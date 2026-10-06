import fs from 'fs';
import path from 'path';
import { Database as DatabaseType } from 'better-sqlite3';
import { ReplayMetadata, ReplayCacheSummary } from '../types.js';
import { upgradeStoredReplayMetadata } from './replayTrajectoryCodec.js';
import { ReplayDriverIngestStatus, settledReplayFailure } from './dbReplayIngestStore.js';
import { resolveRosterVehicles } from '../../../shared/domain/vehicleMapping.js';
import { REPLAY_CACHE_VERSION, compressJson, decompressJson, isCompatibleReplayCacheVersion } from '../dbSchema.js';

// Replay metadata rows, one per .Vcr file. They outlive the file: LMU deletes old replays, and
// the stored row is then the only copy of the metadata.


// Each driver's car is re-derived from its vehicle id on read, so a corrected vehicle mapping
// reaches every stored row, including replays LMU has deleted, without a cache version bump.
function readMetadataRow(row: { parser_version: string; metadata_br: Buffer }): ReplayMetadata {
  return resolveRosterVehicles(upgradeStoredReplayMetadata(decompressJson<ReplayMetadata>(row.metadata_br), row.parser_version));
}

export interface StoredReplayFileInfo {
  file_path: string;
  file_mtime: number;
  file_size: number;
  metadata: ReplayMetadata;
}

export function getReplayMetadataCache(db: DatabaseType, filename: string, mtime: number, size: number, filePath?: string): ReplayMetadata | null {
  const row = db.prepare(
    'SELECT file_path, file_mtime, file_size, parser_version, metadata_br FROM replay_metadata WHERE filename = ?'
  ).get(filename) as { file_path: string; file_mtime: number; file_size: number; parser_version: string; metadata_br: Buffer } | undefined;
  if (!row || row.file_mtime !== mtime || row.file_size !== size || !isCompatibleReplayCacheVersion(row.parser_version) || (filePath && row.file_path !== filePath)) {
    return null;
  }
  return readMetadataRow(row);
}

/** Returns stored metadata even when LMU has deleted the source .Vcr. */
export function getStoredReplayMetadata(db: DatabaseType, filename: string): ReplayMetadata | null {
  const row = db.prepare(
    'SELECT parser_version, metadata_br FROM replay_metadata WHERE filename = ?'
  ).get(filename) as { parser_version: string; metadata_br: Buffer } | undefined;
  if (!row) return null;
  return readMetadataRow(row);
}

/** Returns stored file attributes and metadata for a cached replay file. */
export function getStoredReplayFileInfo(db: DatabaseType, filename: string): StoredReplayFileInfo | null {
  const row = db.prepare(
    'SELECT file_path, file_mtime, file_size, parser_version, metadata_br FROM replay_metadata WHERE filename = ?'
  ).get(filename) as { file_path: string; file_mtime: number; file_size: number; parser_version: string; metadata_br: Buffer } | undefined;
  if (!row) return null;
  return {
    file_path: row.file_path,
    file_mtime: row.file_mtime,
    file_size: row.file_size,
    metadata: readMetadataRow(row),
  };
}

/** Returns all cached replay metadata and disk properties stored in the database. */
export function getAllStoredReplayFiles(db: DatabaseType): Array<StoredReplayFileInfo & { filename: string }> {
  const rows = db.prepare(
    'SELECT filename, file_path, file_mtime, file_size, parser_version, metadata_br FROM replay_metadata ORDER BY file_mtime DESC'
  ).all() as Array<{ filename: string; file_path: string; file_mtime: number; file_size: number; parser_version: string; metadata_br: Buffer }>;
  return rows.map(row => ({
    filename: row.filename,
    file_path: row.file_path,
    file_mtime: row.file_mtime,
    file_size: row.file_size,
    metadata: readMetadataRow(row),
  }));
}

export function upsertReplayMetadataCache(db: DatabaseType, filename: string, filePath: string, mtime: number, size: number, metadata: ReplayMetadata): void {
  db.prepare(`
    INSERT INTO replay_metadata (filename, file_path, file_mtime, file_size, parser_version, metadata_br, updated_at)
    VALUES (@filename, @filePath, @mtime, @size, @parserVersion, @metadataBr, @updatedAt)
    ON CONFLICT(filename) DO UPDATE SET
      file_path = excluded.file_path,
      file_mtime = excluded.file_mtime,
      file_size = excluded.file_size,
      parser_version = excluded.parser_version,
      metadata_br = excluded.metadata_br,
      updated_at = excluded.updated_at
  `).run({
    filename,
    filePath,
    mtime,
    size,
    parserVersion: REPLAY_CACHE_VERSION,
    metadataBr: compressJson(metadata),
    updatedAt: Date.now(),
  });
}

export function getReplaysCount(db: DatabaseType): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM replay_metadata').get() as { count: number };
  return row.count;
}

export function getReplayCacheList(db: DatabaseType, replaysDir?: string): ReplayCacheSummary[] {
  const rows = db.prepare(`
    SELECT rm.filename, rm.file_path, rm.file_size, rm.file_mtime, rm.parser_version, rm.metadata_br, rm.updated_at,
           COUNT(rt.filename) as trajectories_cached,
           LENGTH(rm.metadata_br) + COALESCE(SUM(LENGTH(rt.trajectory_br)), 0) as compressed_size
    FROM replay_metadata rm
    LEFT JOIN replay_trajectories rt ON rt.filename = rm.filename
    GROUP BY rm.filename
    ORDER BY rm.file_mtime DESC
  `).all() as {
    filename: string;
    file_path: string;
    file_size: number;
    file_mtime: number;
    parser_version: string;
    metadata_br: Buffer;
    updated_at: number;
    trajectories_cached: number;
    compressed_size: number;
  }[];

  // The error of a driver this file version cannot be decoded for (rejected, or interrupted too often).
  const unsettledDrivers = db.prepare(`
    SELECT filename, file_mtime, file_size, parser_version, status, error, attempts
    FROM replay_ingest_drivers WHERE status != 'stored'
  `).all() as Array<{ filename: string; file_mtime: number; file_size: number; parser_version: string; status: ReplayDriverIngestStatus; error: string | null; attempts: number }>;
  const versions = new Map(rows.map(row => [row.filename, row]));
  const driverErrors = new Map<string, string>();
  for (const driver of unsettledDrivers) {
    const version = versions.get(driver.filename);
    if (!version || driverErrors.has(driver.filename)) continue;
    const error = settledReplayFailure({
      fileMtime: driver.file_mtime, fileSize: driver.file_size, parserVersion: driver.parser_version,
      status: driver.status, error: driver.error, attempts: driver.attempts,
    }, version.file_mtime, version.file_size);
    if (error !== null) driverErrors.set(driver.filename, error);
  }

  const list: ReplayCacheSummary[] = rows.map(row => {
    const meta = readMetadataRow(row);
    const onDisk = Boolean(
      (row.file_path && fs.existsSync(row.file_path)) ||
      (replaysDir && fs.existsSync(path.join(replaysDir, row.filename)))
    );
    return {
      filename: row.filename,
      fileSizeBytes: row.file_size,
      compressedSizeBytes: row.compressed_size,
      updatedAt: row.updated_at,
      replayDateMs: row.file_mtime,
      trackName: meta.displayTrack || meta.trackName || meta.trackCourse,
      driversCount: meta.drivers?.length || 0,
      durationSec: meta.durationSec,
      eventTitle: meta.eventInfo?.eventTitle,
      trajectoriesCached: row.trajectories_cached,
      parserVersion: row.parser_version,
      replayVersion: row.parser_version,
      isOnDisk: onDisk,
      error: driverErrors.get(row.filename),
    };
  });

  // Files on disk whose metadata could not be read at the last scan: listed with the reason.
  if (replaysDir) {
    const known = new Set(rows.map(row => row.filename.toLowerCase()));
    const unread = db.prepare("SELECT source_path, error_message FROM ingest_errors WHERE source_type = 'vcr'")
      .all() as Array<{ source_path: string; error_message: string }>;
    for (const { source_path: sourcePath, error_message: error } of unread) {
      const filename = path.basename(sourcePath);
      if (known.has(filename.toLowerCase())) continue;
      const filePath = path.join(replaysDir, filename);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }
      known.add(filename.toLowerCase());
      list.push({
        filename,
        fileSizeBytes: stat.size,
        compressedSizeBytes: 0,
        updatedAt: Math.floor(stat.mtimeMs),
        replayDateMs: Math.floor(stat.mtimeMs),
        driversCount: 0,
        trajectoriesCached: 0,
        isOnDisk: true,
        error,
      });
    }
  }

  return list;
}

