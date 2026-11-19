import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SessionDatabase } from '../../server/core/db.js';
import { decompressJson } from '../../server/core/dbCache.js';
import { getReplayLapSignature, listReplayLapRows } from '../../server/core/replay/dbReplayLapRows.js';
import { refreshReplayCornerPasses } from '../../server/corners/cornerPassService.js';
import { buildCornerPassesInWorker } from '../../server/corners/cornerPassWorkerClient.js';
import type { ReplayMetadata } from '../../shared/types/index.js';

// Builds the corner passes of every stored replay whose passes are missing or from another build (another pass
// rule, turn list, centre line or stored laps), with the builder ingestion uses (server/corners/cornerPassService.ts).
// Run it with the app stopped when it writes the app's database. Replays read from `source`; passes written to
// `target` (the same file by default). A separate target measures the rows' size: it then holds only the passes.
// Usage: tsx tools/analysis/buildCornerPasses.ts [path/to/lmu_cache.db] [path/to/target.db] [replay filename filter]
const sourcePath = path.resolve(process.argv[2] ?? path.join('server', 'lmu_cache.db'));
const targetPath = path.resolve(process.argv[3] ?? sourcePath);
const filter = process.argv[4];
const sameFile = sourcePath === targetPath;

const source = new Database(sourcePath, { readonly: !sameFile, fileMustExist: true });
const target = new SessionDatabase(targetPath);
const replays = (source.prepare('SELECT filename, metadata_br FROM replay_metadata ORDER BY filename').all() as Array<{ filename: string; metadata_br: Buffer }>)
  .filter(row => !filter || row.filename.includes(filter));

const store = {
  getReplayLapSignature: (filename: string) => getReplayLapSignature(source, filename),
  listReplayLapRows: (filename: string) => listReplayLapRows(source, filename),
  getCornerPassBuild: (filename: string) => target.getCornerPassBuild(filename),
  replaceCornerPasses: target.replaceCornerPasses.bind(target),
};

const started = Date.now();
const counts = { built: 0, current: 0, skipped: 0, passes: 0 };
// A few replays at a time, each built on a worker thread as ingestion does; this thread reads the laps and writes
// the rows. Each build holds all its replay's laps in memory, so not one per core.
const PARALLEL_BUILDS = Math.max(1, Math.min(6, os.availableParallelism() - 2));
const queue = replays.entries();
let done = 0;
await Promise.all(Array.from({ length: PARALLEL_BUILDS }, async () => {
  for (const [, { filename, metadata_br }] of queue) {
    const metadata = decompressJson<ReplayMetadata>(metadata_br);
    const replayStarted = Date.now();
    const outcome = await refreshReplayCornerPasses(store, filename, metadata, buildCornerPassesInWorker);
    counts[outcome.status]++;
    if (outcome.status === 'built') counts.passes += outcome.passCount;
    const detail = outcome.status === 'built' ? `${outcome.passCount} passes` : outcome.status === 'skipped' ? outcome.reason : 'current';
    console.log(`${++done}/${replays.length} ${filename}: ${detail} (${((Date.now() - replayStarted) / 1000).toFixed(1)} s)`);
  }
}));
target.close();
source.close();
console.log(`Built ${counts.built}, current ${counts.current}, skipped ${counts.skipped}; ${counts.passes} passes in ${((Date.now() - started) / 1000).toFixed(0)} s`);
if (!sameFile) console.log(`Target ${targetPath}: ${(fs.statSync(targetPath).size / 1e6).toFixed(1)} MB`);
