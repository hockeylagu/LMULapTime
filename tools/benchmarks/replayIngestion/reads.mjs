import { register } from 'tsx/esm/api';
import Database from 'better-sqlite3';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

register();
const { getStoredReplayTrajectory } = await import('../../../server/core/replay/dbReplayTrajectoryStore.ts');
const prefixes = process.argv.slice(2);
if (prefixes.length !== 2) throw new Error('Usage: node tools/benchmarks/replayIngestion/reads.mjs <before prefix> <after prefix>');
const databases = prefixes.map(prefix => new Database(path.resolve(`${prefix}.db`), { readonly: true, fileMustExist: true }));
const rows = [];
try {
  const primary = /** @type {{filename: string, slot: number} | undefined} */ (databases[0].prepare('SELECT filename, resolved_driver_slot slot FROM replay_trajectory_defaults WHERE driver_slot = -1 LIMIT 1').get());
  if (!primary) throw new Error('No default trajectory.');
  const rival = /** @type {{slot: number} | undefined} */ (databases[0].prepare('SELECT DISTINCT driver_slot slot FROM replay_trajectories WHERE filename = ? AND driver_slot != ? ORDER BY driver_slot LIMIT 1')
    .get(primary.filename, primary.slot));
  const lap = /** @type {{lap: number} | undefined} */ (databases[0].prepare('SELECT lap_key lap FROM replay_trajectories WHERE filename = ? AND driver_slot = ? ORDER BY lap_key LIMIT 1')
    .get(primary.filename, primary.slot));
  const cases = [{ slot: primary.slot, lap: -1 }, ...(rival ? [{ slot: rival.slot, lap: -1 }] : []),
    ...(lap ? [{ slot: primary.slot, lap: lap.lap }] : [])];
  for (const testCase of cases) {
    const results = prefixes.map(prefix => ({ prefix, ...testCase, ms: /** @type {number[]} */ ([]), hashes: new Set(/** @type {string[]} */ ([])) }));
    for (let run = 0; run <= 10; run++) {
      for (const index of run % 2 === 0 ? [0, 1] : [1, 0]) {
        const started = performance.now();
        const trajectory = getStoredReplayTrajectory(databases[index], primary.filename, testCase.slot, testCase.lap);
        const ms = performance.now() - started;
        if (!trajectory) throw new Error('Missing cached trajectory.');
        if (run > 0) results[index].ms.push(ms);
        results[index].hashes.add(createHash('sha256').update(JSON.stringify(trajectory)).digest('hex'));
      }
    }
    if (new Set(results.flatMap(result => [...result.hashes])).size !== 1) throw new Error('Cached read output mismatch.');
    for (const result of results) {
      const sorted = [...result.ms].sort((a, b) => a - b);
      rows.push({ ...result, medianMs: (sorted[4] + sorted[5]) / 2, hashes: [...result.hashes] });
    }
  }
} finally {
  for (const database of databases) database.close();
}
fs.writeFileSync(`${path.resolve(prefixes[1])}-reads.json`, JSON.stringify({ rows }, null, 2) + '\n');
console.log(JSON.stringify({ rows }, null, 2));
