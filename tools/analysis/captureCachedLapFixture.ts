/**
 * Captures one full-resolution lap stored in the replay cache (server/lmu_cache.db, opened
 * read-only) into a compact columnar fixture under ignored .tmp/personal-regressions/replays/, so tests run on a real
 * lap without opening the live database (which the background replay upgrade rewrites).
 *
 * Usage:
 *   npx tsx tools/analysis/captureCachedLapFixture.ts <fixture-name> "<replay>" <driver slot> <lap>
 *
 * Example (a private regression fixture, the player's lap 5 at Algarve, parser v5):
 *   npx tsx tools/analysis/captureCachedLapFixture.ts algarve-r1-19-player-lap5 \
 *     "Algarve International Circuit R1 19.Vcr" 18 5
 *
 * Pass the real driver slot, not the -1 player alias: since the dedup migration the alias is only
 * a pointer (replay_trajectory_defaults.resolved_driver_slot). Only the channels corner analysis
 * reads are kept, rounded to 3 decimals; stationM/lateralOffsetM are left out because the test
 * derives them from the configured local track package.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { decompressTrajectory } from '../../server/core/replay/replayTrajectoryCodec.js';
import { ReplayTrajectoryPoint } from '../../shared/types/index.js';

const FIELDS: Array<keyof ReplayTrajectoryPoint> = ['x', 'z', 'timeSec', 'speedKmh', 'throttle', 'brake', 'steerYaw'];

const [name, replayName, slotArg, lapArg] = process.argv.slice(2);
if (!name || !replayName || slotArg === undefined || lapArg === undefined) {
  console.error('usage: captureCachedLapFixture.ts <fixture-name> "<replay>" <driver slot> <lap>');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new Database(path.join(root, 'server', 'lmu_cache.db'), { readonly: true, fileMustExist: true });
const row = db.prepare(`
  SELECT trajectory_br, parser_version FROM replay_trajectories
  WHERE filename = ? AND driver_slot = ? AND lap_key = ?
`).get(replayName, Number(slotArg), Number(lapArg)) as { trajectory_br: Buffer; parser_version: string } | undefined;
db.close();
if (!row) {
  console.error(`no cached lap ${lapArg} for slot ${slotArg} of ${replayName}`);
  process.exit(1);
}

const trajectory = decompressTrajectory(row.trajectory_br);
const columns: Record<string, Array<number | null>> = {};
for (const field of FIELDS) {
  columns[field] = trajectory.points.map(p => {
    const value = p[field];
    return typeof value === 'number' ? Math.round(value * 1000) / 1000 : null;
  });
}

const fixture = {
  replayName,
  driverName: trajectory.driverName,
  driverSlot: Number(slotArg),
  currentLap: Number(lapArg),
  lapTimeSec: trajectory.laps?.find(l => l.lapNumber === Number(lapArg))?.lapTimeSec ?? null,
  parserVersion: row.parser_version,
  signConvention: trajectory.signConvention,
  columns,
};
if (!/^[a-z0-9_-]+$/.test(name)) throw new Error('Invalid fixture name');
const out = path.join(root, '.tmp', 'personal-regressions', 'replays', `${name}.json`);
fs.writeFileSync(out, JSON.stringify(fixture));
console.log(`${out}: ${trajectory.points.length} points, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
