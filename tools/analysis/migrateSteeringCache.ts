/**
 * Migration script to normalize all cached steering telemetry values in lmu_cache.db
 * to raw ratios [-1.0, 1.0], updating 'v1' rows to 'v2' without invalidating replays or losing data.
 *
 * Usage:
 *   npx tsx tools/analysis/migrateSteeringCache.ts [--db <path>]
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { migrateSteeringCache } from '../../server/migration.js';

function main() {
  const args = process.argv.slice(2);
  let dbPath = '';
  const dbIdx = args.indexOf('--db');
  if (dbIdx !== -1 && args[dbIdx + 1]) {
    dbPath = args[dbIdx + 1];
  } else {
    const toolsDir = path.dirname(fileURLToPath(import.meta.url));
    dbPath = path.resolve(toolsDir, '../../server/lmu_cache.db');
  }

  if (!fs.existsSync(dbPath)) {
    console.log(`Database file not found at ${dbPath}, nothing to migrate.`);
    return;
  }

  console.log(`[Steering Migration] Opening SQLite database at ${dbPath}...`);
  const db = new Database(dbPath, { timeout: 5000 });
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  const result = migrateSteeringCache(db);

  console.log('[Steering Migration] Migration completed successfully!');
  console.log(`  - Replay metadata rows updated to v2: ${result.replayMetadataUpdated}`);
  console.log(`  - Replay trajectories migrated: ${result.replayTrajectoriesMigrated}`);
  console.log(`  - Telemetry lap cache entries migrated: ${result.telemetryLapsMigrated}`);

  db.close();
}

main();
