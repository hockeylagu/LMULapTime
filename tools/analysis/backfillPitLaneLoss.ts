import fs from 'node:fs';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import type { DuckDBConnection } from '@duckdb/node-api';
import { SessionDatabase } from '../../server/core/db.js';
import { readPitLaneLoss, recordPitLaneLoss } from '../../server/core/live/dbPitLaneStore.js';
import type { PitLaneLossRow } from '../../server/core/live/dbPitLaneStore.js';
import { damageSpoilsStop, PIT_LANE_PACE_LAPS, PIT_LANE_STOPPED_GAP_SECONDS, pitLaneLoss } from '../../shared/domain/live/livePitLane.js';
import { median } from '../../shared/domain/pitStops.js';
import type { LiveSnapshot } from '../../shared/types/live.js';

// Stores the pit lane loss of every race stop in the closed live recordings, as the live service does at each stop
// (shared/domain/live/livePitLane.ts): the in-lap and out-lap from the strategy audit checkpoints, the time standing
// in the box from the samples' speed. Stops with recent damage are left out. Run again, it replaces the same stops.
// Usage: tsx tools/analysis/backfillPitLaneLoss.ts [captureDirectory] [path/to/lmu_cache.db]
const directory = path.resolve(process.argv[2] ?? path.join('server', 'live-captures'));
const database = new SessionDatabase(path.resolve(process.argv[3] ?? path.join('server', 'lmu_cache.db')));
const STILL_MPS = 0.3;

interface Stop { inLap: number; entryEt: number; exitEt: number | null; impactLap: number | null; measuredAt: number }

async function rows(connection: DuckDBConnection, sql: string): Promise<unknown[][]> {
  return (await connection.runAndReadAll(sql)).getRows();
}

/** Seconds standing still (longer than the gap) between two session times, from the samples' forward speed. */
async function stoppedSeconds(connection: DuckDBConnection, from: number, to: number): Promise<number> {
  const samples = await rows(connection, `SELECT elapsed_seconds, velocity_forward_mps FROM capture_samples
    WHERE elapsed_seconds BETWEEN ${from} AND ${to} ORDER BY elapsed_seconds`);
  let total = 0;
  let still: number | null = null;
  let last = from;
  for (const [elapsed, speed] of samples) {
    const et = Number(elapsed);
    if (Math.abs(Number(speed)) < STILL_MPS) still ??= et;
    else if (still !== null) { if (last - still > PIT_LANE_STOPPED_GAP_SECONDS) total += last - still; still = null; }
    last = et;
  }
  return still !== null && last - still > PIT_LANE_STOPPED_GAP_SECONDS ? total + last - still : total;
}

const captures = fs.readdirSync(directory).filter(name => name.includes('_race_') && name.endsWith('.live.duckdb')
  // A recording still being written keeps its WAL: the recording worker owns it.
  && !fs.existsSync(path.join(directory, `${name}.wal`))).sort();
const stored = new Map<string, PitLaneLossRow[]>();
for (const filename of captures) {
  const instance = await DuckDBInstance.create(path.join(directory, filename), { access_mode: 'READ_ONLY' });
  const connection = await instance.connect();
  try {
    const recordingId = filename.slice(-48, -12);
    const checkpoints = await rows(connection, `SELECT elapsed_seconds, received_at, data FROM capture_observations
      WHERE source='recorder' AND kind='strategy-audit-v1' ORDER BY observation_id`);
    const laps = new Map<number, { seconds: number | null; valid: boolean }>();
    const stops: Stop[] = [];
    let layoutKey: string | null = null;
    let carClass: string | null = null;
    let previous = 'none';
    for (const [elapsed, receivedAt, data] of checkpoints) {
      const snapshot = (JSON.parse(String(data)) as { snapshot: LiveSnapshot }).snapshot;
      if (snapshot.session?.kind !== 'race') continue;
      layoutKey = snapshot.identity?.layoutKey ?? layoutKey;
      carClass = snapshot.identity?.carClass ?? carClass;
      for (const lap of snapshot.recentLaps) laps.set(lap.lapNumber, { seconds: lap.lapSeconds, valid: lap.valid });
      const state = snapshot.strategy?.pit?.state ?? previous;
      const et = Number(elapsed);
      const inLane = state === 'entering' || state === 'stopped' || state === 'exiting';
      const impactLap = snapshot.strategy?.damage?.impactLap ?? null;
      const last = stops[stops.length - 1];
      if (inLane && !(previous === 'entering' || previous === 'stopped' || previous === 'exiting')) {
        stops.push({ inLap: snapshot.session.playerLapsCompleted + 1, entryEt: et, exitEt: null, impactLap, measuredAt: Number(receivedAt) });
      } else if (last && snapshot.session.playerLapsCompleted <= last.inLap + 1) {
        // To the end of the out-lap: a hit then spoils the stop too.
        if (impactLap !== null) last.impactLap = Math.max(last.impactLap ?? impactLap, impactLap);
        if (!inLane && last.exitEt === null) last.exitEt = et;
      }
      previous = state;
    }
    if (!layoutKey || !carClass) continue;
    const stopLaps = new Set(stops.flatMap(stop => [stop.inLap, stop.inLap + 1]));
    for (const stop of stops) {
      const before = [...laps].filter(([number, lap]) => number < stop.inLap && lap.valid && !stopLaps.has(number) && lap.seconds !== null)
        .sort(([a], [b]) => a - b).slice(-PIT_LANE_PACE_LAPS).map(([, lap]) => lap.seconds!);
      const pace = median(before);
      // The checkpoints follow the 3 s standings poll: a few seconds either side catch the whole stand.
      const still = stop.exitEt === null ? null : await stoppedSeconds(connection, stop.entryEt - 5, stop.exitEt + 5);
      const damaged = damageSpoilsStop(stop.impactLap, stop.inLap);
      const loss = damaged || still === null ? null
        : pitLaneLoss(laps.get(stop.inLap)?.seconds ?? null, laps.get(stop.inLap + 1)?.seconds ?? null, pace, still);
      console.log(`${filename.slice(0, 40)} lap ${stop.inLap}: ${damaged ? 'damaged, skipped' : loss === null
        ? 'not measurable' : `${loss} s (pace ${pace?.toFixed(1)}, stopped ${still?.toFixed(1)} s)`}`);
      if (loss === null) continue;
      const row = { stopKey: `${recordingId}|${stop.inLap}`, layoutKey, carClass, lossSeconds: loss, measuredAt: stop.measuredAt };
      recordPitLaneLoss(database.getDb(), row);
      stored.set(`${layoutKey}|${carClass}`, [...(stored.get(`${layoutKey}|${carClass}`) ?? []), row]);
    }
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}
for (const [key, list] of stored) {
  const [layoutKey, carClass] = key.split('|');
  console.log(`${key}: ${list.length} stops stored, median now ${readPitLaneLoss(database.getDb(), layoutKey, carClass)} s`);
}
