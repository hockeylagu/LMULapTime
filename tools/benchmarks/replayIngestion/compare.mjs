import Database from 'better-sqlite3';
import { brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [leftPrefix, rightPrefix] = process.argv.slice(2);
if (!leftPrefix || !rightPrefix) throw new Error('Usage: node tools/benchmarks/replayIngestion/compare.mjs <before prefix> <after prefix>');
const databases = [leftPrefix, rightPrefix].map(prefix => new Database(path.resolve(`${prefix}.db`), { readonly: true, fileMustExist: true }));
let result;
try {
  /** @param {import('better-sqlite3').Database} database */
  const blobs = database => {
    /** @type {import('better-sqlite3').Statement<[], {driver_slot: number, lap_key: number, points_count: number, trajectory_br: Buffer}>} */
    const statement = database.prepare(`SELECT driver_slot, lap_key, points_count, trajectory_br
      FROM replay_trajectories ORDER BY driver_slot, lap_key`);
    return [...statement.iterate()].map(row => ({
      slot: row.driver_slot, lap: row.lap_key, points: row.points_count,
      jsonSha256: createHash('sha256').update(brotliDecompressSync(row.trajectory_br)).digest('hex'),
    }));
  };
  const [left, right] = databases.map(blobs);
  /** @type {Record<string, {beforeRows: number, afterRows: number, equal: boolean}>} */
  const normalized = {};
  for (const table of ['replay_trajectory_defaults', 'replay_laps', 'replay_conditions', 'replay_driver_events',
    'replay_running_order', 'replay_facts', 'replay_ingest_drivers']) {
    /** @param {import('better-sqlite3').Database} database */
    const read = database => database.prepare(`SELECT * FROM ${table}`).all().map(row => {
      delete row.updated_at;
      delete row.attempted_at;
      return JSON.stringify(row);
    }).sort();
    const [before, after] = databases.map(read);
    normalized[table] = { beforeRows: before.length, afterRows: after.length, equal: JSON.stringify(before) === JSON.stringify(after) };
  }
  result = { leftPrefix, rightPrefix, blobsBefore: left.length, blobsAfter: right.length,
    points: left.reduce((sum, row) => sum + row.points, 0),
    allTrajectoryJsonIdentical: left.length > 0 && JSON.stringify(left) === JSON.stringify(right), normalized };
} finally {
  for (const database of databases) database.close();
}
fs.writeFileSync(`${path.resolve(rightPrefix)}-comparison.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (!result.allTrajectoryJsonIdentical || Object.values(result.normalized).some(table => !table.equal)) process.exitCode = 1;
