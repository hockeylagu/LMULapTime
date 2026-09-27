import fs from 'fs';
import path from 'path';
import { Database as DatabaseType } from 'better-sqlite3';
import { ReplayMetadata, ReplayCacheSummary } from './types.js';
import { REPLAY_CACHE_VERSION, compressJson, decompressJson, isCompatibleReplayCacheVersion } from './dbSchema.js';

// Replay metadata rows, one per .Vcr file. They outlive the file: LMU deletes old replays, and
// the stored row is then the only copy of the metadata.

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
  return decompressJson<ReplayMetadata>(row.metadata_br);
}

/** Returns stored metadata even when LMU has deleted the source .Vcr. */
export function getStoredReplayMetadata(db: DatabaseType, filename: string): ReplayMetadata | null {
  const row = db.prepare(
    'SELECT parser_version, metadata_br FROM replay_metadata WHERE filename = ?'
  ).get(filename) as { parser_version: string; metadata_br: Buffer } | undefined;
  if (!row) return null;
  return decompressJson<ReplayMetadata>(row.metadata_br);
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
    metadata: decompressJson<ReplayMetadata>(row.metadata_br),
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
    metadata: decompressJson<ReplayMetadata>(row.metadata_br),
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

  return rows.map(row => {
    const meta = decompressJson<ReplayMetadata>(row.metadata_br);
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
    };
  });
}

