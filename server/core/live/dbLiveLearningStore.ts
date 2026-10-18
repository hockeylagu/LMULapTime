import type { Database } from 'better-sqlite3';
import type { LiveLearningExample } from '../../../shared/types/liveLearning.js';
import { LIVE_CAPTURE_MATCH_RULE_VERSION } from './dbLiveCaptureStore.js';

export interface LearningSourceState { signature: string; state: string; error: string | null; updated_at: number }
export function getLearningSource(db: Database, recordingId: string): LearningSourceState | undefined {
  return db.prepare('SELECT signature,state,error,updated_at FROM live_learning_sources WHERE recording_id=?')
    .get(recordingId) as LearningSourceState | undefined;
}
export function setLearningSource(db: Database, recordingId: string, signature: string, state: string, error: string | null = null): void {
  db.prepare(`INSERT INTO live_learning_sources(recording_id,signature,state,error,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(recording_id) DO UPDATE SET signature=excluded.signature,state=excluded.state,error=excluded.error,updated_at=excluded.updated_at`)
    .run(recordingId, signature, state, error, Date.now());
}

/** Atomically replace one derived projection. Raw events remain in DuckDB; no full snapshots enter SQLite. */
export function replaceLearningExamples(db: Database, recordingId: string, signature: string, examples: LiveLearningExample[]): void {
  const insert = db.prepare(`INSERT INTO live_learning_examples
    (session_id,driver_ordinal,lap_ordinal,resource_kind,recording_id,match_version,eligible,example_json)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(session_id,driver_ordinal,lap_ordinal,resource_kind) DO UPDATE SET
      recording_id=excluded.recording_id,match_version=excluded.match_version,
      eligible=excluded.eligible,example_json=excluded.example_json`);
  db.transaction(() => {
    db.prepare('DELETE FROM live_learning_examples WHERE recording_id=?').run(recordingId);
    for (const example of examples) insert.run(example.sessionId, example.driverOrdinal, example.lapOrdinal, example.kind,
      recordingId, example.matchVersion, Number(example.exclusions.length === 0), JSON.stringify(example));
    setLearningSource(db, recordingId, signature, 'ready');
  })();
}

/** Withdrawn/stale ownership cannot enter evaluation. Valid compact facts survive manual raw-file cleanup. */
export function readCurrentLearningExamples(db: Database): LiveLearningExample[] {
  const rows = db.prepare(`SELECT e.example_json FROM live_learning_examples e
    JOIN live_capture_index i ON i.recording_id=e.recording_id
    JOIN live_learning_sources p ON p.recording_id=e.recording_id
    WHERE p.state='ready' AND i.match_status='verified' AND i.match_rule_version=?
      AND i.session_id=e.session_id AND i.match_version=e.match_version
      AND (SELECT count(*) FROM live_capture_index other WHERE other.session_id=i.session_id
        AND other.match_status='verified' AND other.match_rule_version=?)=1
    ORDER BY i.started_at,e.session_id,e.driver_ordinal,e.lap_ordinal,e.resource_kind LIMIT 100001`)
    .all(LIVE_CAPTURE_MATCH_RULE_VERSION, LIVE_CAPTURE_MATCH_RULE_VERSION) as Array<{ example_json: string }>;
  if (rows.length > 100_000) throw new Error('Learning dataset exceeds the 100,000-example evaluation bound; partition the evaluation');
  return rows.map(row => JSON.parse(row.example_json) as LiveLearningExample);
}
