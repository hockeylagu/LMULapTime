import Database from 'better-sqlite3';
import path from 'node:path';
import { readSession } from '../../server/core/sessionRows/reader.js';
import { getTelemetryMetadata, getTelemetryLapCacheFilenames } from '../../server/core/dbTelemetryStore.js';
import { readSessionLapStates } from '../../server/sessions/sessionStrategy.js';
import type { SessionStrategySource } from '../../server/sessions/sessionStrategy.js';
import { readTyreWearLaps } from '../../server/sessions/sessionTyreWear.js';
import { fitTyreWear } from '../../shared/domain/strategy/tyreWear.js';
import { NEW_TYRE_RISE } from '../../shared/domain/strategy/sessionStrategy.js';
import { resolveVehicle } from '../../shared/domain/vehicleMapping.js';
import type { TyreWearLap } from '../../shared/types/liveStrategy.js';

// Read-only: tsx tools/analysis/evaluateTyreWear.ts [session/cohort filter] [dbPath]
// --fixture replaces the report with compact source facts suitable for a checked-in regression fixture.
const fixture = process.argv.includes('--fixture');
const args = process.argv.slice(2).filter(arg => arg !== '--fixture');
const filter = args[0] ?? '';
const db = new Database(path.resolve(args[1] ?? 'server/lmu_cache.db'), { readonly: true, fileMustExist: true });
const source: SessionStrategySource = {
  getDb: () => db,
  getSessionById: id => readSession(db, id),
  getTelemetryMetadata: id => getTelemetryMetadata(db, id),
  getTelemetryLapCacheFilenames: id => getTelemetryLapCacheFilenames(db, id),
  recordIngestError: (_type, filename, error) => console.error(`Unreadable ${filename}:`, error),
};
try {
  const sessions = db.prepare(`SELECT s.id, s.layout_key, s.player_car_type, n.name FROM sessions s
    JOIN session_drivers d ON d.session_id=s.id AND d.is_player=1 JOIN drivers n ON n.driver_id=d.driver_id
    WHERE EXISTS (SELECT 1 FROM telemetry_metadata t WHERE t.matched_session_id=s.id)
      AND EXISTS (SELECT 1 FROM live_capture_index i WHERE i.session_id=s.id AND i.available=1 AND i.match_status='verified')
    ORDER BY s.timestamp DESC, s.id DESC`).all() as Array<{ id: string; layout_key: string; player_car_type: string; name: string }>;
  const groups = new Map<string, Array<{ id: string; laps: TyreWearLap[] }>>();
  const facts: TyreWearLap[] = [];
  for (const session of sessions) {
    if (fixture && !filter.split(',').some(part => session.id.includes(part))) continue;

    const laps = await readTyreWearLaps(source, session.id);
    if (!laps) continue;
    if (fixture && filter.split(',').some(part => session.id.includes(part))) facts.push(...laps);
    const model = resolveVehicle(session.player_car_type)?.model ?? session.player_car_type;
    for (const compound of new Set(laps.filter(lap => lap.exclusions.length === 0).map(lap => lap.compound))) {
      const key = [session.layout_key, model, compound, session.name].join(' | ');
      const group = groups.get(key) ?? [];
      if (group.length < 10) group.push({ id: session.id, laps: laps.filter(lap => lap.compound === compound) });
      groups.set(key, group);
    }
  }
  if (fixture) console.log(JSON.stringify(facts, null, 2));
  else for (const [cohort, sessionsInCohort] of groups) {
    if (!cohort.includes(filter) && !sessionsInCohort.some(session => session.id.includes(filter))) continue;
    const [held, ...training] = sessionsInCohort;
    const profile = fitTyreWear(training.flatMap(session => session.laps));
    console.log(`\n${cohort}\nHeld out: ${held.id}; training sessions: ${training.length}; model laps: ${profile?.laps ?? 0}`);
    for (const session of sessionsInCohort) for (const lap of session.laps) if (lap.exclusions.length) {
      console.log(`  DROP ${session.id} lap ${lap.lapNumber}: ${lap.exclusions.join(', ')}`);
    }
    // The live plan's rule before the race: the preceding session's worst tread from its first crossing to its
    // last, per lap (the tyre tracker's stint), every lap included.
    const before = training[0] ? await readSessionLapStates(source, training[0].id) : [];
    const first = before.find(state => state.lap === 1)?.tread;
    const lastBefore = before.length ? before.reduce((a, b) => (b.lap > a.lap ? b : a)) : null;
    // A tyre change restarts the tracker's stint: no single rate to compare with then.
    const changed = before.some((state, index) => index > 0 && state.tread && before[index - 1].tread
      && state.tread.some((tread, wheel) => tread > before[index - 1].tread![wheel] + NEW_TYRE_RISE));
    const old = !changed && first && lastBefore?.tread && lastBefore.lap > 1
      ? Math.max(0, (Math.min(...first) - Math.min(...lastBefore.tread)) / (lastBefore.lap - 1)) : null;
    console.log(`Old rule (preceding session's worst-tread stint): ${old === null ? 'unknown' : old.toFixed(5)} (source ${training[0]?.id ?? 'none'})`);
    const kept = held.laps.filter(lap => lap.exclusions.length === 0);
    if (!profile || !kept.length) { console.log('Insufficient training or held-out laps.'); continue; }
    const metrics = (errors: number[]) => `bias ${(errors.reduce((sum, value) => sum + value, 0) / errors.length).toFixed(5)}`
      + ` MAE ${(errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length).toFixed(5)}`;
    profile.wheels.forEach((wheel, index) => {
      // Forecast: the plan's wear against each kept lap (negative bias = less wear planned than run, the unsafe side).
      const forecast = kept.map(lap => wheel.wearPerLap - lap.loss[index]);
      const fit = kept.map(lap => wheel.cleanWear + (wheel.perSlipSecond ?? 0) * lap.slip[index] - lap.loss[index]);
      const oldErrors = old === null ? null : kept.map(lap => old - lap.loss[index]);
      console.log(`  ${wheel.corner}: wear ${wheel.wearPerLap} (slope ${wheel.perSlipSecond?.toFixed(5) ?? 'none'}, usual slip ${wheel.usualSlip}s);`
        + ` new ${metrics(forecast)}; old ${oldErrors ? metrics(oldErrors) : 'unknown'}; fit with actual slip ${metrics(fit)}`);
    });

    const states = await readSessionLapStates(source, held.id);
    const xml = source.getSessionById(held.id);
    const player = xml?.playerDriver ?? xml?.drivers.find(driver => driver.isPlayer);
    const flagLap = Math.max(0, ...(player?.laps ?? []).filter(lap => lap.lapTime !== null && lap.lapTime > 0).map(lap => lap.lapNumber));
    const last = states.find(state => state.lap === flagLap);
    const start = states.find(state => state.lap === 0);
    const stopped = held.laps.some(lap => lap.exclusions.some(reason => ['pit-lap', 'new-tyres', 'puncture'].includes(reason)));
    if (stopped) console.log('  Garage projection: skipped (the race had a stop, new tyres or a puncture)');
    else if (start?.tread && last?.tread) {
      const horizon = last.lap;
      const project = (wear: number[]) => Math.min(...start.tread!.map((tread, i) => Math.max(0, tread - horizon * wear[i])));
      console.log(`  Garage projection, ${horizon} laps, no tyre change: new ${project(profile.wheels.map(wheel => wheel.wearPerLap)).toFixed(4)};`
        + ` old ${old === null ? 'unknown' : project([old, old, old, old]).toFixed(4)}; actual ${Math.min(...last.tread).toFixed(4)}`);
    }
  }
} finally { db.close(); }
