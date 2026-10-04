import { Database as DatabaseType } from 'better-sqlite3';
import { DetailedSession } from './types.js';
import { getMetadata, setMetadata } from './dbMetadataStore.js';
import { classifySessionConditions } from './dbSessionConditions.js';
import { rateDriversPace } from '../sessions/sessionPaceRating.js';

/** The benchmark version (its `lastUpdated`) the stored sessions' pace ratings were computed against. */
// Repair ratings retained by the former late-worker race, even with unchanged targets.
const SESSION_PACE_REFERENCE_KEY = 'session_pace_reference_v2';

/**
 * Rates the stored sessions' laps again when the benchmark targets changed since they were last
 * rated, and rewrites the rows whose ratings moved. Pace is rated when a session is parsed, so
 * without this a target update only reaches sessions parsed after it. Returns the sessions rewritten.
 */
export function rerateStoredSessionPace(db: DatabaseType, referenceVersion: string): DetailedSession[] {
  if (getMetadata(db, SESSION_PACE_REFERENCE_KEY) === referenceVersion) return [];
  const ids = (db.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>).map(row => row.id);
  const select = db.prepare('SELECT data_json FROM sessions WHERE id = ?');
  const update = db.prepare('UPDATE sessions SET metadata_json = ?, data_json = ?, updated_at = ? WHERE id = ?');
  const rewritten: DetailedSession[] = [];
  db.transaction(() => {
    for (const id of ids) {
      const row = select.get(id) as { data_json: string } | undefined;
      if (!row) continue;
      const session = JSON.parse(row.data_json) as DetailedSession;
      rateDriversPace(session.drivers ?? [], {
        venue: session.trackVenue, course: session.trackCourse, trackLengthMeters: session.trackLengthMeters,
      });
      // Same rule as the parser: a wet best lap is not rated against the dry targets.
      classifySessionConditions(db, session);
      const dataJson = JSON.stringify(session);
      if (dataJson === row.data_json) continue;
      const { drivers: _drivers, ...meta } = session;
      update.run(JSON.stringify(meta), dataJson, Date.now(), id);
      rewritten.push(session);
    }
    setMetadata(db, SESSION_PACE_REFERENCE_KEY, referenceVersion);
  })();
  return rewritten;
}
