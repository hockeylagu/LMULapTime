import Database from 'better-sqlite3';
import path from 'node:path';
import { initDbSchema } from '../../server/core/dbSchema.js';
import { recodeReplayTrajectories } from '../../server/core/dbReplayRecode.js';

const apply = process.argv.includes('--apply');
const vacuum = process.argv.includes('--vacuum');
const dbPath = path.resolve(process.argv.find(arg => arg.startsWith('--db='))?.slice(5) || 'server/lmu_cache.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 10000');
initDbSchema(db);

const mb = (bytes: number) => (bytes / 1048576).toFixed(1);
let lastCheckpoint = 0;

console.log(`${apply ? 'APPLYING' : 'DRY RUN'} on ${dbPath}\n`);

const report = recodeReplayTrajectories(db, {
  apply,
  onProgress: (done, total, running) => {
    if (done > 0 && done % 1000 === 0) {
      const saved = running.bytesBefore - running.bytesAfter;
      console.log(`  ...${done}/${total}  recoded=${running.recoded}  saved so far ${mb(saved)} MB`);
      if (apply && done - lastCheckpoint >= 5000) {
        db.pragma('wal_checkpoint(PASSIVE)');
        lastCheckpoint = done;
      }
    }
  },
});

console.log(`\nscanned            : ${report.scanned} rows`);
console.log(`recoded            : ${report.recoded} rows`);
console.log(`already columnar   : ${report.skippedAlreadyColumnar} rows`);
console.log(`size of recoded    : ${mb(report.bytesBefore)} MB -> ${mb(report.bytesAfter)} MB  (saves ${mb(report.bytesBefore - report.bytesAfter)} MB)`);

if (report.failures.length > 0) {
  console.error(`\nleft untouched (round-trip check failed) for ${report.failures.length} rows:`);
  for (const key of report.failures.slice(0, 20)) console.error(`  ${key}`);
}

if (!apply) {
  console.log('\nNo changes written. Re-run with --apply (and optionally --vacuum) to migrate.');
  db.close();
  process.exit(0);
}

db.pragma('wal_checkpoint(TRUNCATE)');

if (vacuum) {
  console.log('\nvacuuming (needs free space equal to the database size)...');
  db.exec('VACUUM');
  console.log('vacuum complete.');
}

db.close();
