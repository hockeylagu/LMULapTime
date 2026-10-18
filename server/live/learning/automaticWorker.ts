import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { advanceAutomaticLearning } from '../../../shared/domain/learning/automatic.js';
import { evaluateLiveLearning } from './report.js';
import { readLearningModels } from '../../core/live/dbLearningModelStore.js';
if (!parentPort) throw new Error('Automatic learning requires a worker');
let db: Database.Database | null = null;
try {
  if (typeof workerData !== 'string' || workerData === ':memory:') throw new Error('Automatic learning requires a saved database');
  db = new Database(workerData, { readonly: true, fileMustExist: true });
  const state = db.transaction(() => {
    const examples = evaluateLiveLearning(db!, 0.25, true).evaluationExamples!;
    return advanceAutomaticLearning(examples, readLearningModels(db!), rows =>
      createHash('sha256').update(JSON.stringify(rows)).digest('hex'), Date.now());
  })();
  parentPort.postMessage({ type: 'models', state });
} catch (error) {
  parentPort.postMessage({ type: 'failed', error: error instanceof Error ? error.message : String(error) });
} finally { db?.close(); parentPort.close(); }
