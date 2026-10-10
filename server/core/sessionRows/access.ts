import type { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession, SessionMetadata } from '../types.js';
import type { Row } from './fields.js';
import { recordingLink, readSession } from './reader.js';
import { stableKey } from './writer.js';

type ReplayLink = NonNullable<SessionMetadata['matchingReplayFile']>;

/**
 * The stored session, assembled directly from its normalized rows.
 */
export function loadSession(db: DatabaseType, id: string): DetailedSession | null {
  return readSession(db, id);
}

/** Loads each id that exists, in the order given. */
export function loadSessions(db: DatabaseType, ids: readonly string[]): DetailedSession[] {
  return ids.flatMap(id => {
    const session = loadSession(db, id);
    return session ? [session] : [];
  });
}

/** Whether two links say the same: key order and absent-or-null properties do not matter. */
export function sameReplayLink(a: ReplayLink, b: ReplayLink): boolean {
  const clean = (link: ReplayLink) => stableKey(Object.fromEntries(Object.entries(link).filter(([, value]) => value !== null && value !== undefined)));
  return clean(a) === clean(b);
}

export interface StoredLinkState { link: ReplayLink | undefined; duckdbFilename: string | undefined }

/**
 * A session's replay link and main DuckDB file without assembling the session: two small row reads.
 */
export function readStoredLinkState(db: DatabaseType, id: string): StoredLinkState | undefined {
  const session = db.prepare('SELECT has_duckdb_telemetry, duckdb_filename FROM sessions WHERE id = ?').get(id) as Row | undefined;
  if (!session) return undefined;
  const recording = db.prepare('SELECT * FROM session_recordings WHERE session_id = ?').get(id) as Row | undefined;
  return {
    link: recording ? recordingLink(recording, session) as unknown as ReplayLink : undefined,
    duckdbFilename: typeof session.duckdb_filename === 'string' ? session.duckdb_filename : undefined,
  };
}
