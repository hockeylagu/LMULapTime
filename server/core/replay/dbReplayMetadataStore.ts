import type { StoredReplayFileInfo } from './replayStorageTypes.js';
import fs from 'fs';
import path from 'path';
import { Database as DatabaseType } from 'better-sqlite3';
import { ReplayMetadata, ReplayCacheSummary } from '../../../shared/types/index.js';
import { ReplayDriverIngestStatus, settledReplayFailure } from './dbReplayIngestStore.js';
import { resolveRosterVehicles } from '../../../shared/domain/vehicleMapping.js';
import { REPLAY_CACHE_VERSION, compressJson, decompressJson, isCompatibleReplayCacheVersion } from '../dbCache.js';
import { writeReplayMatchingFacts } from './dbReplayMatchingStore.js';
import { getMetadata, setMetadata } from '../dbMetadataStore.js';

// Replay metadata rows, one per .Vcr file. They outlive the file: LMU deletes old replays, and
// the stored row is then the only copy of the metadata.


// Each driver's car is re-derived from its vehicle id on read, so a corrected vehicle mapping
// reaches every stored row, including replays LMU has deleted, without a cache version bump.
function readMetadataRow(row: { metadata_br: Buffer }, playerName?: string): { metadata: ReplayMetadata; ownershipChanged: boolean } {
  const metadata = decompressJson<ReplayMetadata>(row.metadata_br);
  const ownershipChanged = applyConfiguredPlayer(metadata, playerName);
  return { metadata: resolveRosterVehicles(metadata), ownershipChanged };
}

function applyConfiguredPlayer(metadata: ReplayMetadata, playerName?: string): boolean {
  if (playerName === undefined) return false;
  const target = playerName.trim().toLowerCase();
  const matches = target ? metadata.drivers.filter(driver => driver.name.trim().toLowerCase() === target) : [];
  const player = matches.length === 1 ? matches[0] : undefined;
  const previousPlayers = metadata.drivers.filter(driver => driver.isPlayer);
  const ownershipChanged = !player || previousPlayers.length !== 1 || previousPlayers[0] !== player;
  const changed = metadata.drivers.some(driver => driver.isPlayer !== (driver === player))
    || ownershipChanged && metadata.laps !== undefined;
  for (const driver of metadata.drivers) driver.isPlayer = driver === player;
  if (ownershipChanged) delete metadata.laps;
  delete metadata.carType;
  delete metadata.carClass;
  return changed;
}

function persistConfiguredPlayer(db: DatabaseType, filename: string, metadata: ReplayMetadata, ownershipChanged: boolean): void {
  if (ownershipChanged) {
    db.prepare('UPDATE replay_metadata SET metadata_br=?,updated_at=? WHERE filename=?')
      .run(compressJson(metadata), Date.now(), filename);
  }
}

/** Repair retained ownership once per configured identity, including list and telemetry reads. */
export function reconcileReplayPlayerOwnership(db: DatabaseType, playerName: string): boolean {
  const rule = JSON.stringify(['exact-player-v1', playerName.trim().toLowerCase()]);
  if (getMetadata(db, 'replay_player_ownership_rule') === rule) return false;
  db.transaction(() => {
    const files = db.prepare('SELECT filename FROM replay_metadata').all() as Array<{ filename: string }>;
    const read = db.prepare('SELECT parser_version,metadata_br FROM replay_metadata WHERE filename=?');
    for (const { filename } of files) {
      const row = read.get(filename) as { parser_version: string; metadata_br: Buffer };
      const { metadata, ownershipChanged } = readMetadataRow(row, playerName);
      persistConfiguredPlayer(db, filename, metadata, ownershipChanged);
    }
    setMetadata(db, 'replay_player_ownership_rule', rule);
  })();
  return true;
}

export function getReplayMetadataCache(db: DatabaseType, filename: string, mtimeMs: number, fileSizeBytes: number, filePath?: string, playerName?: string): ReplayMetadata | null {
  const row = db.prepare(
    'SELECT file_path, file_mtime_ms, file_size_bytes, parser_version, metadata_br FROM replay_metadata WHERE filename = ?'
  ).get(filename) as { file_path: string; file_mtime_ms: number; file_size_bytes: number; parser_version: string; metadata_br: Buffer } | undefined;
  if (!row || row.file_mtime_ms !== mtimeMs || row.file_size_bytes !== fileSizeBytes || !isCompatibleReplayCacheVersion(row.parser_version) || (filePath && row.file_path !== filePath)) {
    return null;
  }
  const { metadata, ownershipChanged } = readMetadataRow(row, playerName);
  persistConfiguredPlayer(db, filename, metadata, ownershipChanged);
  return metadata;
}

/** Returns stored metadata even when LMU has deleted the source .Vcr. */
export function getStoredReplayMetadata(db: DatabaseType, filename: string, playerName?: string): ReplayMetadata | null {
  const row = db.prepare(
    'SELECT parser_version, metadata_br FROM replay_metadata WHERE filename = ?'
  ).get(filename) as { parser_version: string; metadata_br: Buffer } | undefined;
  if (!row) return null;
  const { metadata, ownershipChanged } = readMetadataRow(row, playerName);
  persistConfiguredPlayer(db, filename, metadata, ownershipChanged);
  return metadata;
}

/** Returns stored file attributes and metadata for a cached replay file. */
export function getStoredReplayFileInfo(db: DatabaseType, filename: string): StoredReplayFileInfo | null {
  const row = db.prepare(
    'SELECT file_path, file_mtime_ms, file_size_bytes, parser_version, metadata_br FROM replay_metadata WHERE filename = ?'
  ).get(filename) as { file_path: string; file_mtime_ms: number; file_size_bytes: number; parser_version: string; metadata_br: Buffer } | undefined;
  if (!row) return null;
  return {
    file_path: row.file_path,
    file_mtime_ms: row.file_mtime_ms,
    file_size_bytes: row.file_size_bytes,
    metadata: readMetadataRow(row).metadata,
  };
}

/** Returns all cached replay metadata and disk properties stored in the database. */
export function getAllStoredReplayFiles(db: DatabaseType): Array<StoredReplayFileInfo & { filename: string }> {
  const rows = db.prepare(
    'SELECT filename, file_path, file_mtime_ms, file_size_bytes, parser_version, metadata_br FROM replay_metadata ORDER BY file_mtime_ms DESC'
  ).all() as Array<{ filename: string; file_path: string; file_mtime_ms: number; file_size_bytes: number; parser_version: string; metadata_br: Buffer }>;
  return rows.map(row => ({
    filename: row.filename,
    file_path: row.file_path,
    file_mtime_ms: row.file_mtime_ms,
    file_size_bytes: row.file_size_bytes,
    metadata: readMetadataRow(row).metadata,
  }));
}

export function upsertReplayMetadataCache(db: DatabaseType, filename: string, filePath: string, mtimeMs: number, fileSizeBytes: number, metadata: ReplayMetadata): void {
  db.transaction(() => {
  db.prepare(`
    INSERT INTO replay_metadata (filename, file_path, file_mtime_ms, file_size_bytes, parser_version, metadata_br, updated_at)
    VALUES (@filename, @filePath, @mtimeMs, @fileSizeBytes, @parserVersion, @metadataBr, @updatedAt)
    ON CONFLICT(filename) DO UPDATE SET
      file_path = excluded.file_path,
      file_mtime_ms = excluded.file_mtime_ms,
      file_size_bytes = excluded.file_size_bytes,
      parser_version = excluded.parser_version,
      metadata_br = excluded.metadata_br,
      updated_at = excluded.updated_at
  `).run({
    filename,
    filePath,
    mtimeMs,
    fileSizeBytes,
    parserVersion: REPLAY_CACHE_VERSION,
    metadataBr: compressJson(metadata),
    updatedAt: Date.now(),
  });
  writeReplayMatchingFacts(db, filename, filePath, mtimeMs, fileSizeBytes, metadata);
  })();
}

export function getReplaysCount(db: DatabaseType): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM replay_metadata').get() as { count: number };
  return row.count;
}

export function getReplayCacheList(db: DatabaseType, replaysDir?: string): ReplayCacheSummary[] {
  const rows = db.prepare(`
    SELECT rm.filename, rm.file_path, rm.file_size_bytes, rm.file_mtime_ms, rm.parser_version, rm.metadata_br, rm.updated_at,
           COUNT(rt.filename) as trajectories_cached,
           LENGTH(rm.metadata_br) + COALESCE(SUM(LENGTH(rt.trajectory_br)), 0) as compressed_size
    FROM replay_metadata rm
    LEFT JOIN replay_trajectories rt ON rt.filename = rm.filename
    GROUP BY rm.filename
    ORDER BY rm.file_mtime_ms DESC
  `).all() as {
    filename: string;
    file_path: string;
    file_size_bytes: number;
    file_mtime_ms: number;
    parser_version: string;
    metadata_br: Buffer;
    updated_at: number;
    trajectories_cached: number;
    compressed_size: number;
  }[];

  // The error of a driver this file version cannot be decoded for (rejected, or interrupted too often).
  const unsettledDrivers = db.prepare(`
    SELECT filename, file_mtime_ms, file_size_bytes, parser_version, status, error, attempts
    FROM replay_ingest_drivers WHERE status != 'stored'
  `).all() as Array<{ filename: string; file_mtime_ms: number; file_size_bytes: number; parser_version: string; status: ReplayDriverIngestStatus; error: string | null; attempts: number }>;
  const versions = new Map(rows.map(row => [row.filename, row]));
  const driverErrors = new Map<string, string>();
  for (const driver of unsettledDrivers) {
    const version = versions.get(driver.filename);
    if (!version || driverErrors.has(driver.filename)) continue;
    const error = settledReplayFailure({
      mtimeMs: driver.file_mtime_ms, fileSizeBytes: driver.file_size_bytes, parserVersion: driver.parser_version,
      status: driver.status, error: driver.error, attempts: driver.attempts,
    }, version.file_mtime_ms, version.file_size_bytes);
    if (error !== null) driverErrors.set(driver.filename, error);
  }

  const list: ReplayCacheSummary[] = rows.map(row => {
    const meta = readMetadataRow(row).metadata;
    const onDisk = Boolean(
      (row.file_path && fs.existsSync(row.file_path)) ||
      (replaysDir && fs.existsSync(path.join(replaysDir, row.filename)))
    );
    return {
      filename: row.filename,
      fileSizeBytes: row.file_size_bytes,
      compressedSizeBytes: row.compressed_size,
      updatedAt: row.updated_at,
      replayDateMs: row.file_mtime_ms,
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

