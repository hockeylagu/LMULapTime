import { Database as DatabaseType } from 'better-sqlite3';
import { DuckDbLapTelemetry } from './types.js';
import { DuckDbFileInfo } from '../telemetry/telemetryMatcher.js';
import {
  DUCKDB_TELEMETRY_CACHE_VERSION,
  compressJson,
  decompressJson,
} from './dbSchema.js';

export interface TelemetryMetadataRecord {
  filename: string;
  filePath: string;
  matchedSessionId: string | null;
  matchedReplayFilename: string | null;
}

export function upsertTelemetryMetadata(
  db: DatabaseType,
  info: DuckDbFileInfo,
  matchedSessionId?: string,
  matchedReplayFilename?: string
): boolean {
  // Every session list and trajectory request re-asserts its matches: rewriting an identical row
  // cost ~1 ms each. A row that already holds a match is the only one holding it.
  const metadataJson = JSON.stringify(info);
  const existing = db.prepare('SELECT metadata_json, matched_session_id, matched_replay_filename FROM telemetry_metadata WHERE filename = ?')
    .get(info.filename) as { metadata_json: string; matched_session_id: string | null; matched_replay_filename: string | null } | undefined;
  if (existing && existing.metadata_json === metadataJson
    && (!matchedSessionId || existing.matched_session_id === matchedSessionId)
    && (!matchedReplayFilename || existing.matched_replay_filename === matchedReplayFilename)) {
    return false;
  }

  const upsert = db.prepare(`
    INSERT INTO telemetry_metadata (
      filename, file_path, file_mtime, file_size, track_name, session_type,
      session_timestamp, laps_count, metadata_json, matched_session_id,
      matched_replay_filename, updated_at
    ) VALUES (
      @filename, @filePath, @fileMtime, @fileSize, @trackName, @sessionType,
      @sessionTimestamp, @lapsCount, @metadataJson, @matchedSessionId,
      @matchedReplayFilename, @updatedAt
    )
    ON CONFLICT(filename) DO UPDATE SET
      file_path = excluded.file_path,
      file_mtime = excluded.file_mtime,
      file_size = excluded.file_size,
      track_name = excluded.track_name,
      session_type = excluded.session_type,
      session_timestamp = excluded.session_timestamp,
      laps_count = excluded.laps_count,
      metadata_json = excluded.metadata_json,
      matched_session_id = COALESCE(excluded.matched_session_id, telemetry_metadata.matched_session_id),
      matched_replay_filename = COALESCE(excluded.matched_replay_filename, telemetry_metadata.matched_replay_filename),
      updated_at = excluded.updated_at
  `);

  db.transaction(() => {
    if (matchedSessionId) {
      db.prepare(`
        UPDATE telemetry_metadata
        SET matched_session_id = NULL
        WHERE matched_session_id = ? AND filename <> ?
      `).run(matchedSessionId, info.filename);
    }
    if (matchedReplayFilename) {
      db.prepare(`
        UPDATE telemetry_metadata
        SET matched_replay_filename = NULL
        WHERE matched_replay_filename = ? AND filename <> ?
      `).run(matchedReplayFilename, info.filename);
    }
    upsert.run({
      filename: info.filename,
      filePath: info.filePath,
      fileMtime: info.fileMtimeMs,
      fileSize: info.fileSizeBytes,
      trackName: info.trackName,
      sessionType: info.sessionType,
      sessionTimestamp: info.timestampStr,
      lapsCount: info.lapsCount || 0,
      metadataJson,
      matchedSessionId: matchedSessionId || null,
      matchedReplayFilename: matchedReplayFilename || null,
      updatedAt: Date.now(),
    });
  })();

  return true;
}

export function getTelemetryFiles(db: DatabaseType): DuckDbFileInfo[] {
  const rows = db.prepare('SELECT metadata_json FROM telemetry_metadata').all() as { metadata_json: string }[];
  return rows.map((r) => JSON.parse(r.metadata_json) as DuckDbFileInfo);
}

export function getTelemetryMetadata(db: DatabaseType): TelemetryMetadataRecord[] {
  const rows = db.prepare(
    'SELECT filename, file_path, matched_session_id, matched_replay_filename FROM telemetry_metadata'
  ).all() as Array<{
    filename: string;
    file_path: string;
    matched_session_id: string | null;
    matched_replay_filename: string | null;
  }>;
  return rows.map((r) => ({
    filename: r.filename,
    filePath: r.file_path,
    matchedSessionId: r.matched_session_id,
    matchedReplayFilename: r.matched_replay_filename,
  }));
}

export function getTelemetryLapCache(db: DatabaseType, filename: string, lapNumber: number): DuckDbLapTelemetry | null {
  const row = db.prepare(
    'SELECT telemetry_br, cache_version FROM telemetry_lap_cache WHERE filename = ? AND lap_number = ?'
  ).get(filename, lapNumber) as { telemetry_br: Buffer; cache_version: string } | undefined;
  if (!row || row.cache_version !== DUCKDB_TELEMETRY_CACHE_VERSION) return null;
  return decompressJson<DuckDbLapTelemetry>(row.telemetry_br);
}

export function upsertTelemetryLapCache(db: DatabaseType, filename: string, lapNumber: number, lapData: DuckDbLapTelemetry): void {
  db.prepare(`
    INSERT INTO telemetry_lap_cache (filename, lap_number, points_count, telemetry_br, cache_version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(filename, lap_number) DO UPDATE SET
      points_count = excluded.points_count,
      telemetry_br = excluded.telemetry_br,
      cache_version = excluded.cache_version,
      updated_at = excluded.updated_at
  `).run(filename, lapNumber, lapData.pointsCount, compressJson(lapData), DUCKDB_TELEMETRY_CACHE_VERSION, Date.now());
}

export function pruneTelemetryLapCache(
  db: DatabaseType,
  maxAgeMs = 30 * 24 * 60 * 60 * 1000,
  maxBytes = 512 * 1024 * 1024
): void {
  const cutoff = Date.now() - maxAgeMs;
  db.prepare('DELETE FROM telemetry_lap_cache WHERE updated_at < ?').run(cutoff);
  const sizeRow = db.prepare('SELECT COALESCE(SUM(LENGTH(telemetry_br)), 0) AS bytes FROM telemetry_lap_cache').get() as { bytes: number };
  if (sizeRow.bytes <= maxBytes) return;

  const deleteOldest = db.prepare('DELETE FROM telemetry_lap_cache WHERE filename = ? AND lap_number = ?');
  const oldestRows = db.prepare(
    'SELECT filename, lap_number, LENGTH(telemetry_br) AS bytes FROM telemetry_lap_cache ORDER BY updated_at ASC'
  ).all() as Array<{ filename: string; lap_number: number; bytes: number }>;
  let currentBytes = sizeRow.bytes;
  const prune = db.transaction(() => {
    for (const row of oldestRows) {
      if (currentBytes <= maxBytes) break;
      deleteOldest.run(row.filename, row.lap_number);
      currentBytes -= row.bytes;
    }
  });
  prune();
}

export function clearTelemetryCache(db: DatabaseType): void {
  db.exec('DELETE FROM telemetry_metadata; DELETE FROM telemetry_lap_cache;');
}
