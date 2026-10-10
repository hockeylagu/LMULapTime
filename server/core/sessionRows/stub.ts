import type { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession } from '../types.js';

/**
 * Inserts the `sessions` row a session's rows hang from, with the columns the session itself carries
 * and no JSON. For tests and offline checks; ingestion creates the row in upsertSession.
 */
export function insertSessionRow(db: DatabaseType, session: DetailedSession): void {
  db.prepare(`INSERT OR REPLACE INTO sessions (id, filename, file_path, file_mtime, file_size, timestamp, track_venue, track_course,
    session_type, session_name, drivers_count, updated_at)
    VALUES (@id, @filename, @filePath, 0, 0, @timestamp, @trackVenue, @trackCourse, @sessionType, @sessionName, @driversCount, 0)`)
    .run({ id: session.id, filename: session.filename, filePath: session.filePath, timestamp: session.timestamp, trackVenue: session.trackVenue,
      trackCourse: session.trackCourse, sessionType: session.sessionType, sessionName: session.sessionName, driversCount: session.driversCount });
}
