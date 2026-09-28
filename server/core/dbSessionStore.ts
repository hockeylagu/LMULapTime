import { Database as DatabaseType } from 'better-sqlite3';
import { DetailedSession, SessionMetadata } from './types.js';
import { isReplayLinkWithdrawn } from './replay/dbReplayLinkStore.js';

export function getAllSessions(db: DatabaseType): DetailedSession[] {
  const rows = db.prepare('SELECT data_json FROM sessions ORDER BY timestamp ASC').all() as { data_json: string }[];
  return rows.map(r => JSON.parse(r.data_json) as DetailedSession);
}

export function getAllSessionSummaries(db: DatabaseType): SessionMetadata[] {
  const rows = db.prepare('SELECT metadata_json FROM sessions ORDER BY timestamp ASC').all() as { metadata_json: string }[];
  return rows.map(r => JSON.parse(r.metadata_json) as SessionMetadata);
}

export function getSessionById(db: DatabaseType, id: string): DetailedSession | null {
  const cleanId = id.endsWith('.xml') ? id.replace(/\.xml$/, '') : id;
  const withXml = `${cleanId}.xml`;

  const row = db.prepare(
    'SELECT data_json FROM sessions WHERE id = ? OR id = ? OR id = ? OR filename = ? OR filename = ? LIMIT 1'
  ).get(id, cleanId, withXml, withXml, id) as { data_json: string } | undefined;
  if (!row) return null;

  return JSON.parse(row.data_json) as DetailedSession;
}

export function upsertSession(
  db: DatabaseType,
  session: DetailedSession,
  filePath: string,
  mtime: number,
  size: number
): void {
  // A (re)parse matches the replay again from the XML alone. A replay withdrawn from the session
  // stays withdrawn, so it is dropped here instead of being stored and withdrawn again.
  if (session.matchingReplayFile && isReplayLinkWithdrawn(db, session.id, session.matchingReplayFile.name)) {
    delete session.matchingReplayFile;
  }
  const { drivers, ...meta } = session;
  const metadataJson = JSON.stringify(meta);
  const dataJson = JSON.stringify(session);
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO sessions (
      id, filename, file_path, file_mtime, file_size, timestamp,
      track_venue, track_course, session_type, session_name,
      player_driver_name, player_car_class, player_car_type,
      player_best_lap_time, player_laps_count, drivers_count,
      metadata_json, data_json, updated_at
    ) VALUES (
      @id, @filename, @filePath, @fileMtime, @fileSize, @timestamp,
      @trackVenue, @trackCourse, @sessionType, @sessionName,
      @playerDriverName, @playerCarClass, @playerCarType,
      @playerBestLapTime, @playerLapsCount, @driversCount,
      @metadataJson, @dataJson, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      filename = excluded.filename,
      file_path = excluded.file_path,
      file_mtime = excluded.file_mtime,
      file_size = excluded.file_size,
      timestamp = excluded.timestamp,
      track_venue = excluded.track_venue,
      track_course = excluded.track_course,
      session_type = excluded.session_type,
      session_name = excluded.session_name,
      player_driver_name = excluded.player_driver_name,
      player_car_class = excluded.player_car_class,
      player_car_type = excluded.player_car_type,
      player_best_lap_time = excluded.player_best_lap_time,
      player_laps_count = excluded.player_laps_count,
      drivers_count = excluded.drivers_count,
      metadata_json = excluded.metadata_json,
      data_json = excluded.data_json,
      updated_at = excluded.updated_at
  `);

  stmt.run({
    id: session.id,
    filename: session.filename,
    filePath,
    fileMtime: mtime,
    fileSize: size,
    timestamp: session.timestamp,
    trackVenue: session.trackVenue,
    trackCourse: session.trackCourse,
    sessionType: session.sessionType,
    sessionName: session.sessionName,
    playerDriverName: session.playerDriver?.name || null,
    playerCarClass: session.playerDriver?.carClass || null,
    playerCarType: session.playerDriver?.carType || null,
    playerBestLapTime: session.playerDriver?.bestLapTime ?? null,
    playerLapsCount: session.playerDriver?.lapsCount ?? 0,
    driversCount: session.driversCount,
    metadataJson,
    dataJson,
    updatedAt: now,
  });
}

export function updateSessionMatchingReplay(
  db: DatabaseType,
  sessionId: string,
  matchingReplayFile: NonNullable<SessionMetadata['matchingReplayFile']>
): { updated: boolean; session?: DetailedSession; metadata?: SessionMetadata } {
  const metaRow = db.prepare('SELECT metadata_json FROM sessions WHERE id = ?').get(sessionId) as { metadata_json: string } | undefined;
  if (!metaRow) return { updated: false };
  try {
    const meta = JSON.parse(metaRow.metadata_json) as SessionMetadata;
    // Enrichment re-asserts every match on each session list request: skip identical rewrites.
    if (JSON.stringify(meta.matchingReplayFile) === JSON.stringify(matchingReplayFile)) {
      return { updated: false };
    }
    const row = db.prepare('SELECT data_json FROM sessions WHERE id = ?').get(sessionId) as { data_json: string };
    const data = JSON.parse(row.data_json) as DetailedSession;
    meta.matchingReplayFile = matchingReplayFile;
    data.matchingReplayFile = matchingReplayFile;
    db.prepare('UPDATE sessions SET metadata_json = ?, data_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(meta), JSON.stringify(data), Date.now(), sessionId);
    return { updated: true, session: data, metadata: meta };
  } catch (err) {
    console.warn('[SessionDb] Failed to update session matching replay:', err);
    return { updated: false };
  }
}

export function getSessionsCount(db: DatabaseType): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
  return row.count;
}

export function clearSessionCache(db: DatabaseType): void {
  db.exec("DELETE FROM sessions; DELETE FROM cache_metadata WHERE key NOT LIKE 'reference_%';");
}
