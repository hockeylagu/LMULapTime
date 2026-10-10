import type { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession, SessionMetadata } from '../types.js';
import type { Row } from './fields.js';
import { recordingLink, readSession } from './reader.js';
import { NORMALIZED_SESSION_VERSION } from './schema.js';
import { stableKey } from './writer.js';

type ReplayLink = NonNullable<SessionMetadata['matchingReplayFile']>;

/**
 * The stored session, assembled from its rows. A session whose rows are not verified at the current
 * version (not backfilled yet, or a mismatch) is read from its JSON instead, until phase 3 removes it.
 */
export function loadSession(db: DatabaseType, id: string): DetailedSession | null {
  const row = db.prepare('SELECT normalized_version AS version FROM sessions WHERE id = ?').get(id) as { version: number } | undefined;
  if (!row) return null;
  if (row.version === NORMALIZED_SESSION_VERSION) return readSession(db, id);
  const json = db.prepare('SELECT data_json FROM sessions WHERE id = ?').get(id) as { data_json: string } | undefined;
  return json ? JSON.parse(json.data_json) as DetailedSession : null;
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
 * Sessions without verified rows answer from their JSON.
 */
export function readStoredLinkState(db: DatabaseType, id: string): StoredLinkState | undefined {
  const session = db.prepare('SELECT normalized_version AS version, has_duckdb_telemetry, duckdb_filename FROM sessions WHERE id = ?').get(id) as Row | undefined;
  if (!session) return undefined;
  if (session.version !== NORMALIZED_SESSION_VERSION) {
    const loaded = loadSession(db, id);
    return loaded ? { link: loaded.matchingReplayFile, duckdbFilename: loaded.duckdbFilename } : undefined;
  }
  const recording = db.prepare('SELECT * FROM session_recordings WHERE session_id = ?').get(id) as Row | undefined;
  return {
    link: recording ? recordingLink(recording, session) as unknown as ReplayLink : undefined,
    duckdbFilename: typeof session.duckdb_filename === 'string' ? session.duckdb_filename : undefined,
  };
}

/**
 * Keeps the session's JSON copies in step with its rows while the JSON is still written (rolling
 * back is a code revert until phase 3 removes it).
 */
export function writeSessionJson(db: DatabaseType, session: DetailedSession, updatedAt?: number): void {
  const { drivers: _drivers, ...meta } = session;
  if (updatedAt === undefined) {
    db.prepare('UPDATE sessions SET metadata_json = ?, data_json = ? WHERE id = ?').run(JSON.stringify(meta), JSON.stringify(session), session.id);
  } else {
    db.prepare('UPDATE sessions SET metadata_json = ?, data_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(meta), JSON.stringify(session), updatedAt, session.id);
  }
}
