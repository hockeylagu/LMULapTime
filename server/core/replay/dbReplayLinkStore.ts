import { Database as DatabaseType } from 'better-sqlite3';
import { RejectedReplayLink, ReplayLinkRejectionReason, SessionMetadata } from '../types.js';
import { deleteTargetedReplayLink } from '../sessionRows/targeted.js';

// Withdrawn session -> replay links (see rejected_replay_links in dbSchema.ts).

type ReplayLink = NonNullable<SessionMetadata['matchingReplayFile']>;

/**
 * Withdraws a session's replay link in one transaction: records it (with what the session row held)
 * and removes it from the session row. Returns the withdrawal, or null when the session is gone.
 */
export function rejectSessionReplayLink(
  db: DatabaseType,
  sessionId: string,
  link: ReplayLink,
  reason: ReplayLinkRejectionReason
): RejectedReplayLink | null {
  const sessionExists = db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sessionId);
  if (!sessionExists) return null;
  const rejectedAt = Date.now();
  db.transaction(() => {
    deleteTargetedReplayLink(db, sessionId, rejectedAt);
    db.prepare(`
      INSERT INTO rejected_replay_links (session_id, replay_filename, reason, previous_link_json, rejected_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id, replay_filename) DO UPDATE SET
        reason = excluded.reason,
        previous_link_json = excluded.previous_link_json,
        rejected_at = excluded.rejected_at
    `).run(sessionId, link.name, reason, JSON.stringify(link), rejectedAt);
  })();
  return { replayName: link.name, reason, rejectedAt };
}


/** Every withdrawal per session, oldest first. */
export function getRejectedReplayLinks(db: DatabaseType, sessionIds?: readonly string[]): Map<string, RejectedReplayLink[]> {
  if (sessionIds?.length === 0) return new Map();
  const scope = sessionIds ? ` WHERE session_id IN (${sessionIds.map(() => '?').join(',')})` : '';
  const rows = db.prepare(
    `SELECT session_id, replay_filename, reason, rejected_at FROM rejected_replay_links${scope} ORDER BY rejected_at ASC`
  ).all(...(sessionIds ?? [])) as Array<{ session_id: string; replay_filename: string; reason: ReplayLinkRejectionReason; rejected_at: number }>;
  const bySession = new Map<string, RejectedReplayLink[]>();
  for (const row of rows) {
    const withdrawals = bySession.get(row.session_id) ?? [];
    withdrawals.push({ replayName: row.replay_filename, reason: row.reason, rejectedAt: row.rejected_at });
    bySession.set(row.session_id, withdrawals);
  }
  return bySession;
}

/** Whether this replay was withdrawn from this session. */
export function isReplayLinkWithdrawn(db: DatabaseType, sessionId: string, replayName: string): boolean {
  return db.prepare('SELECT 1 FROM rejected_replay_links WHERE session_id = ? AND replay_filename = ?').get(sessionId, replayName) !== undefined;
}
