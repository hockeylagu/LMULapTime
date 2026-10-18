import type { Database } from 'better-sqlite3';
import type { LiveAuditRecord } from '../../../shared/types/liveAudit.js';

/** Legacy history is read-only; current checkpoints belong to the session DuckDB. */
function hasLegacyAudit(db: Database): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='live_strategy_audit'").get());
}

export function readLiveAudit(db: Database, runId: string | null, limit = 200): LiveAuditRecord[] {
  if (!hasLegacyAudit(db)) return [];
  const rows = runId === null
    ? db.prepare('SELECT record_json FROM live_strategy_audit ORDER BY recorded_at DESC, run_id, sequence DESC LIMIT ?').all(limit)
    : db.prepare('SELECT record_json FROM live_strategy_audit WHERE run_id = ? ORDER BY sequence DESC LIMIT ?').all(runId, limit);
  return (rows as { record_json: string }[]).map(row => JSON.parse(row.record_json) as LiveAuditRecord);
}

/** Streaming export does not load an unbounded history into memory. */
export function* iterateLiveAudit(db: Database, runId: string | null): Generator<LiveAuditRecord> {
  if (!hasLegacyAudit(db)) return;
  const rows = runId === null
    ? db.prepare('SELECT record_json FROM live_strategy_audit ORDER BY recorded_at, run_id, sequence').iterate()
    : db.prepare('SELECT record_json FROM live_strategy_audit WHERE run_id = ? ORDER BY sequence').iterate(runId);
  for (const row of rows as Iterable<{ record_json: string }>) yield JSON.parse(row.record_json) as LiveAuditRecord;
}
