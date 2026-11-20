import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { SessionDatabase } from '../../server/core/db.js';
import { DRIVE_CUE_COLUMNS } from '../../server/core/dbSchema.js';
import { refreshReplayCornerPasses } from '../../server/corners/cornerPassService.js';
import { refreshSequenceMaps } from '../../server/corners/sequenceMapService.js';

// Builds the corner passes and sequence passes of every stored replay whose rows are missing or from another build
// (another pass rule, turn list, centre line, stored laps or class map), with the builder ingestion uses
// (server/corners/). First the turn sequence maps: each layout and class's map is built or grown from the stored
// passes (a full map stays as it is; --remap rebuilds it, narrowed by --layout and --class). Run it with the app
// stopped: it writes the app's database.
// Usage: tsx --env-file-if-exists=.env.local tools/analysis/buildCornerPasses.ts [path/to/lmu_cache.db]
//   [--filter <replay filename part>] [--layout <layoutKey>] [--class <class>] [--remap]
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { filter: { type: 'string' }, layout: { type: 'string' }, class: { type: 'string' }, remap: { type: 'boolean' } },
});
const dbPath = path.resolve(positionals[0] ?? path.join('server', 'lmu_cache.db'));
if (!fs.existsSync(dbPath)) throw new Error(`No database at ${dbPath}`);
const db = new SessionDatabase(dbPath);
// A database from before the passes' drive cues: add their columns (the rebuild below fills them).
for (const table of ['replay_corner_passes', 'replay_sequence_passes']) {
  const columns = new Set((db.getDb().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(column => column.name));
  for (const column of DRIVE_CUE_COLUMNS.split(',').map(part => part.trim().split(' ')[0]).filter(Boolean)) {
    if (!columns.has(column)) db.getDb().exec(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER`);
  }
}

const started = Date.now();
const layouts = values.layout ? [values.layout]
  : [...new Set(db.getReplayCacheList().flatMap(({ filename }) => db.getCornerPassBuild(filename)?.layoutKey ?? []))].sort();
for (const layoutKey of layouts) {
  const changed = await refreshSequenceMaps(db, layoutKey, values.class ? [values.class] : null, { remap: values.remap });
  if (changed.length) console.log(`Map ${layoutKey}: ${changed.join(', ')}`);
}
console.log(`Maps in ${((Date.now() - started) / 1000).toFixed(0)} s`);

const replays = db.getReplayCacheList().map(({ filename }) => filename)
  .filter(filename => !values.filter || filename.includes(values.filter))
  .filter(filename => !values.layout || db.getCornerPassBuild(filename)?.layoutKey === values.layout)
  .sort();
const counts = { built: 0, current: 0, skipped: 0, passes: 0, sequencePasses: 0 };
// A few replays at a time, each built on a worker thread as ingestion does; this thread reads the laps and writes
// the rows. Each build holds all its replay's laps in memory, so not one per core.
const PARALLEL_BUILDS = Math.max(1, Math.min(6, os.availableParallelism() - 2));
const queue = replays.values();
let done = 0;
await Promise.all(Array.from({ length: PARALLEL_BUILDS }, async () => {
  for (const filename of queue) {
    const metadata = db.getStoredReplayMetadata(filename);
    if (!metadata) continue;
    const replayStarted = Date.now();
    const outcome = await refreshReplayCornerPasses(db, filename, metadata);
    counts[outcome.status]++;
    if (outcome.status === 'built') {
      counts.passes += outcome.passCount;
      counts.sequencePasses += outcome.sequencePassCount;
    }
    const detail = outcome.status === 'built' ? `${outcome.passCount} passes, ${outcome.sequencePassCount} sequence passes`
      : outcome.status === 'skipped' ? outcome.reason : 'current';
    console.log(`${++done}/${replays.length} ${filename}: ${detail} (${((Date.now() - replayStarted) / 1000).toFixed(1)} s)`);
  }
}));
db.close();
console.log(`Built ${counts.built}, current ${counts.current}, skipped ${counts.skipped}; ${counts.passes} passes, `
  + `${counts.sequencePasses} sequence passes in ${((Date.now() - started) / 1000).toFixed(0)} s`);
