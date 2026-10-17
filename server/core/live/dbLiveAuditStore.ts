import type { Database } from 'better-sqlite3';
import type { LiveAuditRecord } from '../../../shared/types/liveAudit.js';

/** Captures kept: each holds a full snapshot every 10 s or so, so an endurance race alone can weigh tens of MB. */
export const LIVE_AUDIT_KEPT_RUNS = 30;

/** Deletes every capture but the `keepRuns` most recent ones (by their last record). Returns the rows deleted. */
export function pruneLiveAudit(db: Database, keepRuns = LIVE_AUDIT_KEPT_RUNS): number {
  return db.prepare(`DELETE FROM live_strategy_audit WHERE run_id NOT IN (
    SELECT run_id FROM live_strategy_audit GROUP BY run_id ORDER BY MAX(recorded_at) DESC LIMIT ?)`).run(keepRuns).changes;
}

/**
 * One prepared insert per checkpoint, not per telemetry frame. The main database already uses WAL.
 * Old captures are pruned once here, when the server starts, never during a session.
 */
export function createLiveAuditWriter(db: Database): (record: LiveAuditRecord) => void {
  pruneLiveAudit(db);
  const insert = db.prepare('INSERT INTO live_strategy_audit (run_id, sequence, recorded_at, record_json) VALUES (?, ?, ?, ?)');
  return record => { insert.run(record.runId, record.sequence, record.recordedAt, JSON.stringify(record)); };
}

export function readLiveAudit(db: Database, runId: string | null, limit = 200): LiveAuditRecord[] {
  const rows = runId === null
    ? db.prepare('SELECT record_json FROM live_strategy_audit ORDER BY recorded_at DESC, run_id, sequence DESC LIMIT ?').all(limit)
    : db.prepare('SELECT record_json FROM live_strategy_audit WHERE run_id = ? ORDER BY sequence DESC LIMIT ?').all(runId, limit);
  return (rows as { record_json: string }[]).map(row => JSON.parse(row.record_json) as LiveAuditRecord);
}

/** Streaming export does not load an unbounded history into memory. */
export function* iterateLiveAudit(db: Database, runId: string | null): Generator<LiveAuditRecord> {
  const rows = runId === null
    ? db.prepare('SELECT record_json FROM live_strategy_audit ORDER BY recorded_at, run_id, sequence').iterate()
    : db.prepare('SELECT record_json FROM live_strategy_audit WHERE run_id = ? ORDER BY sequence').iterate(runId);
  for (const row of rows as Iterable<{ record_json: string }>) yield JSON.parse(row.record_json) as LiveAuditRecord;
}
