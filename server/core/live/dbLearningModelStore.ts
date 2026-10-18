import type { Database } from 'better-sqlite3';
import type { AutomaticLearningState } from '../../../shared/domain/learning/automatic.js';

export function readLearningModels(db: Database): AutomaticLearningState {
  const row = db.prepare('SELECT state_json FROM live_learning_models WHERE id=1').get() as { state_json: string } | undefined;
  if (!row) return { version: 1, models: [] };
  return JSON.parse(row.state_json) as AutomaticLearningState;
}

/** Replace atomically, including withdrawals; no old active correction survives a rejected refresh. */
export function saveLearningModels(db: Database, state: AutomaticLearningState): void {
  db.prepare(`INSERT INTO live_learning_models(id,state_json,updated_at) VALUES(1,?,?)
    ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`)
    .run(JSON.stringify(state), Date.now());
}
