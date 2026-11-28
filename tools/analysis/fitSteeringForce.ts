/**
 * Fits each car's FFB from its replay channels (`estimateFfbPct`, shared/domain/vehicles/steeringForce.ts) on the
 * driver's own laps that have both a replay and DuckDB telemetry, scores the fit on sessions it was not fitted on, and
 * with `--write` stores the passing cars in `steering_force_fit`, from which replay-only laps of the car (rivals' too)
 * get an estimated steering force. Run it again after changing the in-game FFB strength: the fit holds the strength.
 *
 * The laps come from the running app (port 3001), each twice: fused with DuckDB (the measured FFB) and from the replay
 * alone (`source=vcr`), so the fit sees the lap exactly as the app serves and processes it. They are kept in
 * `.cache/steering-force-fit/`; a lap already there is not fetched again.
 *
 * Gate per car: at least two sessions, held-out R² ≥ 0.85 against the measured force (the FFB's 0.15 s mean). The
 * stored coefficients are then fitted on all the car's laps.
 *
 * Usage: tsx tools/analysis/fitSteeringForce.ts [--write]
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { ReplayTrajectoryData, ReplayTrajectoryPoint, SteeringForceFit } from '../../shared/types/index.js';
import { applyTelemetryPostProcessingToTrajectory } from '../../src/utils/telemetryPostProcessing.js';
import { vcrLapBaseTime } from '../../server/telemetry/telemetryFusion.js';
import { computeSteeringForce, estimateFfbPct } from '../../shared/domain/vehicles/steeringForce.js';
import { carModel } from '../../server/corners/cornerAnalysisService.js';
import { replaceSteeringForceFits, type SteeringForceFitRow } from '../../server/core/dbSteeringForceFitStore.js';

const MIN_R2 = 0.85, MIN_SPEED_KMH = 54, LAPS_PER_SESSION = 4, API = 'http://localhost:3001/api';
const dbPath = path.join('server', 'lmu_cache.db'), cacheDir = path.join('.cache', 'steering-force-fit');
const write = process.argv.includes('--write');

interface PairedLap { session: string; car: string; carClass: string; track: string; file: string }
interface Sample { ay: number; understeerDeg: number; force: number }
interface MarkerTrace { t: number[]; steer: number[]; speed: number[]; estimateInputs: Array<[number, number] | undefined>; counter: boolean[] }
interface LapData { lap: PairedLap; samples: Sample[]; markers: MarkerTrace; rangeDeg: number }

const get = async (url: string): Promise<ReplayTrajectoryData> => {
  const response = await fetch(`${API}${url}`);
  if (!response.ok) throw Error(`${response.status} ${url}`);
  return await response.json() as ReplayTrajectoryData;
};

/** The driver's sessions whose DuckDB file is matched to a replay, then their first laps with a time, fetched once. */
async function pairedLaps(): Promise<PairedLap[]> {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const sessions = (db.prepare(`SELECT DISTINCT matched_session_id AS id FROM telemetry_metadata
    WHERE matched_session_id IS NOT NULL AND matched_replay_filename IS NOT NULL AND laps_count > 0 ORDER BY id`).all() as Array<{ id: string }>)
    .map(row => row.id);
  db.close();
  fs.mkdirSync(cacheDir, { recursive: true });
  const laps: PairedLap[] = [];
  for (const id of sessions) {
    const detailResponse = await fetch(`${API}/session/${encodeURIComponent(id)}`);
    if (!detailResponse.ok) continue;
    const detail = await detailResponse.json() as { trackVenue: string; drivers: Array<{ isPlayer?: boolean; driverOrdinal: number; carType?: string; carClass?: string; laps: Array<{ lapOrdinal: number; lapTime: number | null }> }> };
    const me = detail.drivers.find(driver => driver.isPlayer);
    const car = carModel(me?.carType ?? null);
    if (!me || !car) continue;
    for (const { lapOrdinal } of me.laps.filter(lap => (lap.lapTime ?? 0) > 0).slice(0, LAPS_PER_SESSION)) {
      const file = path.join(cacheDir, `${id}_${lapOrdinal}.json`);
      if (!fs.existsSync(file)) {
        const query = `/session/${encodeURIComponent(id)}/telemetry?driverOrdinal=${me.driverOrdinal}&lapOrdinal=${lapOrdinal}`;
        try {
          const fused = await get(query);
          if (fused.source !== 'duckdb') continue;
          fs.writeFileSync(file, JSON.stringify({ fused, vcr: await get(`${query}&source=vcr`) }));
        } catch (error) { console.log(`skip ${id} lap ${lapOrdinal}: ${error instanceof Error ? error.message : String(error)}`); continue; }
      }
      laps.push({ session: id, car, carClass: me.carClass ?? '', track: detail.trackVenue, file });
    }
  }
  return laps;
}

/** Linear interpolation of a lap channel at time t, walking forward (the points sorted by time). */
function sampler(points: ReplayTrajectoryPoint[], read: (point: ReplayTrajectoryPoint) => number | undefined) {
  let k = 0;
  return (t: number): number | undefined => {
    while (k < points.length - 2 && (points[k + 1].timeSec ?? 0) < t) k++;
    const a = points[k], b = points[k + 1];
    if (!b) return undefined;
    const ta = a.timeSec ?? 0, tb = b.timeSec ?? 0, va = read(a), vb = read(b);
    if (va === undefined || vb === undefined || t < ta - 0.05 || t > tb + 0.05) return undefined;
    return tb > ta ? va + ((vb - va) * Math.min(1, Math.max(0, (t - ta) / (tb - ta)))) : va;
  };
}

/** The replay lap processed as the app does (in the run's steering lock), against the measured force at its times. */
function loadLap(lap: PairedLap): LapData | null {
  const { fused, vcr } = JSON.parse(fs.readFileSync(lap.file, 'utf8')) as { fused: ReplayTrajectoryData; vcr: ReplayTrajectoryData };
  const processed = applyTelemetryPostProcessingToTrajectory({ ...vcr, steeringForceFit: undefined, setupSteering: fused.setupSteering });
  const base = vcrLapBaseTime(vcr);
  const forceAt = sampler(fused.points, point => point.driverForcePct);
  const counterAt = sampler(fused.points, point => (point.passiveCounterSteer ? 1 : 0));
  const samples: Sample[] = [], markers: MarkerTrace = { t: [], steer: [], speed: [], estimateInputs: [], counter: [] };
  processed.points.forEach((point, i) => {
    const t = (vcr.points[i].timeSec ?? 0) - base, force = forceAt(t);
    if (force === undefined) return;
    markers.t.push(t); markers.steer.push(vcr.points[i].steerYaw ?? 0); markers.speed.push(point.speedKmh ?? 0);
    markers.estimateInputs.push(point.accelLatG === undefined ? undefined : [point.accelLatG, point.understeerDeg ?? 0]);
    markers.counter.push((counterAt(t) ?? 0) > 0.5);
    if (point.accelLatG !== undefined && (point.speedKmh ?? 0) >= MIN_SPEED_KMH) samples.push({ ay: point.accelLatG, understeerDeg: point.understeerDeg ?? 0, force });
  });
  return samples.length > 100 ? { lap, samples, markers, rangeDeg: fused.setupSteering?.steeringWheelRangeDeg ?? 540 } : null;
}

/** Least squares of the measured force (−FFB) on the model's two terms, no intercept. */
function fit(laps: LapData[]): SteeringForceFit {
  const unit = { c1: 1, c2: 0 }, trail = { c1: 0, c2: 1 };
  let s11 = 0, s12 = 0, s22 = 0, s1y = 0, s2y = 0;
  for (const { samples } of laps) for (const s of samples) {
    const f1 = estimateFfbPct(s.ay, s.understeerDeg, unit), f2 = estimateFfbPct(s.ay, s.understeerDeg, trail), y = -s.force;
    s11 += f1 * f1; s12 += f1 * f2; s22 += f2 * f2; s1y += f1 * y; s2y += f2 * y;
  }
  const det = s11 * s22 - s12 * s12;
  return { c1: (s1y * s22 - s2y * s12) / det, c2: (s2y * s11 - s1y * s12) / det };
}

function score(laps: LapData[], c: SteeringForceFit): { r2: number; rms: number } {
  const all = laps.flatMap(lap => lap.samples), mean = all.reduce((sum, s) => sum - s.force, 0) / all.length;
  let sse = 0, sst = 0;
  for (const s of all) { sse += (-s.force - estimateFfbPct(s.ay, s.understeerDeg, c)) ** 2; sst += (-s.force - mean) ** 2; }
  return { r2: 1 - sse / sst, rms: Math.sqrt(sse / all.length) };
}

/** Passive counter-steer from the estimate against the measured one, by samples. */
function counterSteerAgreement(laps: LapData[], c: SteeringForceFit): string {
  let both = 0, measuredOnly = 0, estimatedOnly = 0;
  for (const { markers: m, rangeDeg } of laps) {
    const estimated = computeSteeringForce({ timeSec: m.t, steer: m.steer, speedKmh: m.speed, steeringWheelRangeDeg: rangeDeg,
      ffbPct: m.estimateInputs.map(input => (input ? estimateFfbPct(input[0], input[1], c) : undefined)) }).passiveCounterSteer;
    m.counter.forEach((measured, i) => {
      if (measured && estimated[i]) both++; else if (measured) measuredOnly++; else if (estimated[i]) estimatedOnly++;
    });
  }
  const pct = (part: number, whole: number) => `${((100 * part) / Math.max(1, whole)).toFixed(0)} %`;
  return `counter-steer found ${pct(both, both + measuredOnly)}, right ${pct(both, both + estimatedOnly)}`;
}

const laps = (await pairedLaps()).map(loadLap).filter((lap): lap is LapData => lap !== null);
const byCar = new Map<string, LapData[]>();
for (const lap of laps) byCar.set(lap.lap.car, [...(byCar.get(lap.lap.car) ?? []), lap]);
const passing: SteeringForceFitRow[] = [];
for (const [car, carLaps] of byCar) {
  const sessions = [...new Set(carLaps.map(lap => lap.lap.session))].sort();
  const tracks = [...new Set(carLaps.map(lap => lap.lap.track))].join(', ');
  if (sessions.length < 2) { console.log(`${car}: one session (${tracks}), nothing to hold out`); continue; }
  const fitted = new Set(sessions.filter((_, i) => i % 2 === 0));
  const heldOut = carLaps.filter(lap => !fitted.has(lap.lap.session));
  const trial = fit(carLaps.filter(lap => fitted.has(lap.lap.session))), test = score(heldOut, trial);
  const pass = test.r2 >= MIN_R2;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${car} [${carLaps[0].lap.carClass}] ${tracks}: held-out R² ${test.r2.toFixed(2)}, RMS ${test.rms.toFixed(1)} %`
    + ` over ${heldOut.length} laps; ${counterSteerAgreement(heldOut, trial)}`);
  if (!pass) continue;
  const all = fit(carLaps);
  passing.push({ carModel: car, c1: Number(all.c1.toFixed(3)), c2: Number(all.c2.toFixed(3)), heldOutR2: Number(test.r2.toFixed(3)),
    lapsCount: carLaps.length, newestSession: sessions[sessions.length - 1], fittedAt: Date.now() });
}
console.log(`${passing.length} of ${byCar.size} cars pass, ${laps.length} laps.`);
if (write) {
  // The app only reads this table, per request: a write beside the running server is one short transaction (WAL).
  const db = new Database(dbPath, { fileMustExist: true, timeout: 10_000 });
  replaceSteeringForceFits(db, passing);
  db.close();
  console.log('Stored in steering_force_fit.');
}
