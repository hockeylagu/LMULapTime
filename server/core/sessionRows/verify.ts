import type { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession } from '../types.js';
import { canonicalSession, diffValues } from './canonical.js';
import { readSession } from './reader.js';
import { NORMALIZED_SESSION_VERSION } from './schema.js';
import type { SessionSummaryProjection } from '../../../shared/types/sessionSummaries.js';
import { deleteSessionRows, writeSessionRows } from './writer.js';
import { isSessionJsonRemoved } from './conversion.js';

/** The paths where the session read back from its rows differs from its canonical form; empty when it matches. */
export function verifySessionRows(db: DatabaseType, session: DetailedSession, limit = 20): string[] {
  const stored = readSession(db, session.id);
  if (!stored) return ['$: no stored session'];
  return diffValues(canonicalSession(session), stored, limit);
}

export interface SessionRowsResult { ok: boolean; mismatches: string[]; error?: unknown }

/**
 * Writes a session's rows and checks they read back as the session. `normalized_version` is the
 * current version only on a match; it is its negative after a mismatch or an error (attempted, not
 * to be trusted). Rows that mismatch stay, because their derived columns still feed history reads, but
 * readers keep to the session's JSON; rows an error left behind are removed. Never throws.
 */
export function writeAndVerifySessionRows(db: DatabaseType, session: DetailedSession, projection?: SessionSummaryProjection): SessionRowsResult {
  let result: SessionRowsResult;
  try {
    writeSessionRows(db, session, projection);
    const mismatches = verifySessionRows(db, session);
    result = { ok: mismatches.length === 0, mismatches };
  } catch (error: unknown) {
    result = { ok: false, mismatches: [], error };
  }
  if (result.error !== undefined) {
    try { deleteSessionRows(db, session.id); } catch { /* the version below keeps the rows from being read */ }
  }
  db.prepare('UPDATE sessions SET normalized_version = ? WHERE id = ?')
    .run(result.ok ? NORMALIZED_SESSION_VERSION : -NORMALIZED_SESSION_VERSION, session.id);
  return result;
}

export interface NormalizedBackfillBatch {
  processed: number;
  failed: Array<{ id: string; mismatches: string[]; error?: unknown }>;
}

/** Sessions whose rows were not written and checked at the current version (a negative version was attempted). */
const STALE_ROWS = 'normalized_version NOT IN (?, ?)';

export function countStaleNormalizedSessions(db: DatabaseType): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM sessions WHERE ${STALE_ROWS}`)
    .get(NORMALIZED_SESSION_VERSION, -NORMALIZED_SESSION_VERSION) as { count: number }).count;
}

/** Writes and verifies the rows of up to `batchSize` sessions from their stored JSON. */
export function backfillNormalizedSessions(db: DatabaseType, batchSize = 10): NormalizedBackfillBatch {
  if (isSessionJsonRemoved(db)) return { processed: 0, failed: [] };
  const ids = db.prepare(`SELECT id FROM sessions WHERE ${STALE_ROWS} ORDER BY timestamp LIMIT ?`)
    .all(NORMALIZED_SESSION_VERSION, -NORMALIZED_SESSION_VERSION, Math.max(1, batchSize)) as Array<{ id: string }>;
  const select = db.prepare('SELECT data_json FROM sessions WHERE id = ?');
  const batch: NormalizedBackfillBatch = { processed: 0, failed: [] };
  for (const { id } of ids) {
    batch.processed++;
    try {
      const row = select.get(id) as { data_json: string } | undefined;
      if (!row) continue;
      const result = writeAndVerifySessionRows(db, JSON.parse(row.data_json) as DetailedSession);
      if (!result.ok) batch.failed.push({ id, mismatches: result.mismatches, error: result.error });
    } catch (error: unknown) {
      db.prepare('UPDATE sessions SET normalized_version = ? WHERE id = ?').run(-NORMALIZED_SESSION_VERSION, id);
      batch.failed.push({ id, mismatches: [], error });
    }
  }
  return batch;
}
