import { Database as DatabaseType } from 'better-sqlite3';
import { RejectedReplayLink, ReplayLinkRejectionReason, SessionMetadata } from './types.js';

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
  const rejectedAt = Date.now();
  const withdraw = db.transaction((): boolean => {
    const row = db.prepare('SELECT metadata_json, data_json FROM sessions WHERE id = ?').get(sessionId) as
      { metadata_json: string; data_json: string } | undefined;
    if (!row) return false;
    const meta = JSON.parse(row.metadata_json) as SessionMetadata;
    const data = JSON.parse(row.data_json) as SessionMetadata;
    delete meta.matchingReplayFile;
    delete data.matchingReplayFile;
    db.prepare('UPDATE sessions SET metadata_json = ?, data_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(meta), JSON.stringify(data), rejectedAt, sessionId);
    db.prepare(`
      INSERT INTO rejected_replay_links (session_id, replay_filename, reason, previous_link_json, rejected_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id, replay_filename) DO UPDATE SET
        reason = excluded.reason,
        previous_link_json = excluded.previous_link_json,
        rejected_at = excluded.rejected_at
    `).run(sessionId, link.name, reason, JSON.stringify(link), rejectedAt);
    return true;
  });
  return withdraw() ? { replayName: link.name, reason, rejectedAt } : null;
}

/** Every withdrawal per session, oldest first. */
export function getRejectedReplayLinks(db: DatabaseType): Map<string, RejectedReplayLink[]> {
  const rows = db.prepare(
    'SELECT session_id, replay_filename, reason, rejected_at FROM rejected_replay_links ORDER BY rejected_at ASC'
  ).all() as Array<{ session_id: string; replay_filename: string; reason: ReplayLinkRejectionReason; rejected_at: number }>;
  const bySession = new Map<string, RejectedReplayLink[]>();
  for (const row of rows) {
    const withdrawals = bySession.get(row.session_id) ?? [];
    withdrawals.push({ replayName: row.replay_filename, reason: row.reason, rejectedAt: row.rejected_at });
    bySession.set(row.session_id, withdrawals);
  }
  return bySession;
}
