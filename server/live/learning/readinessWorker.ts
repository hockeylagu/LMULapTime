import { parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { learningReadiness } from './readiness.js';
if (!parentPort) throw new Error('Learning readiness requires a worker');
let db: Database.Database | null = null;
try {
  if (typeof workerData !== 'string' || workerData === ':memory:') throw new Error('Learning readiness requires a saved database');
  db = new Database(workerData, { readonly: true, fileMustExist: true });
  const report = db.transaction(() => learningReadiness(db!))();
  parentPort.postMessage({ type: 'readiness', report });
} catch (error) {
  parentPort.postMessage({ type: 'failed', error: error instanceof Error ? error.message : String(error) });
} finally { db?.close(); parentPort.close(); }
