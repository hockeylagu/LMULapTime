import Database from 'better-sqlite3';
import path from 'node:path';
import { evaluateLiveLearning } from '../../server/live/learning/report.js';

// Reads compact, already-built projections only; does not scan recordings or start game REST requests.
const dbPath = path.resolve(process.argv[2] ?? path.join('server', 'lmu_cache.db'));
const holdout = process.argv[3] === undefined ? 0.25 : Number(process.argv[3]);
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='live_learning_sources'").get();
  if (!exists) console.log(JSON.stringify({ state: 'not-initialized', message: 'Start the updated app to initialize learning storage.' }, null, 2));
  else console.log(JSON.stringify(db.transaction(() => evaluateLiveLearning(db, holdout))(), null, 2));
} finally { db.close(); }
