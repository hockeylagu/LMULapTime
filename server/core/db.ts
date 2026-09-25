import Database, { Database as DatabaseType, Statement } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  AiReportRecord,
  DetailedSession,
  SessionMetadata,
  ReferenceLaptimeEntry,
  ReferenceLaptimesCache,
  ReferenceBenchmarkDiff,
  ReplayMetadata,
  ReplayTrajectoryData,
  ReplayCacheSummary,
  AiReportHistoryEntry,
  AiLapReport,
  DuckDbLapTelemetry,
} from './types.js';
import { DuckDbFileInfo } from '../telemetry/telemetryMatcher.js';
import { LmuParser } from '../sessions/parser.js';
import {
  initDbSchema,
  compressJson,
  decompressJson,
  REPLAY_CACHE_VERSION,
  DUCKDB_TELEMETRY_CACHE_VERSION,
  CacheStats,
  SyncResult,
  SessionSyncProgress,
  ReplaySyncProgress,
  ReplaySyncResult,
} from './dbSchema.js';
import {
  syncReplaysAsyncIterator as runSyncReplaysAsyncIterator,
  syncReplaysIterator as runSyncReplaysIterator,
  syncReplaysFromDir as runSyncReplaysFromDir,
} from './dbReplaySync.js';

export type { CacheStats, SyncResult, SessionSyncProgress, ReplaySyncProgress, ReplaySyncResult };

export class SessionDatabase {
  private db: DatabaseType;
  private dbPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.dbPath = customPath;
    } else if (process.env.NODE_ENV === 'test') {
      this.dbPath = ':memory:';
    } else {
      const serverDir = path.dirname(fileURLToPath(import.meta.url));
      this.dbPath = path.join(serverDir, '..', 'lmu_cache.db');
    }

    this.db = new Database(this.dbPath, { timeout: 5000 });
    // Performance pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    initDbSchema(this.db);
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  public getMetadata(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM cache_metadata WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  public setMetadata(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO cache_metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }

  public getAiReport(cacheKey: string): AiReportRecord | null {
    const row = this.db.prepare('SELECT * FROM ai_reports WHERE cache_key = ?').get(cacheKey) as {
      cache_key: string;
      replay_name: string;
      lap_number: number;
      baseline_replay_name: string | null;
      baseline_lap_number: number | null;
      model: string;
      prompt_version: number;
      report_json: string;
      prompt_tokens: number | null;
      completion_tokens: number | null;
      total_tokens: number | null;
      generated_at: number;
    } | undefined;
    if (!row) return null;
    return {
      cacheKey: row.cache_key,
      replayName: row.replay_name,
      lapNumber: row.lap_number,
      baselineReplayName: row.baseline_replay_name,
      baselineLapNumber: row.baseline_lap_number,
      model: row.model,
      promptVersion: row.prompt_version,
      report: JSON.parse(row.report_json) as AiReportRecord['report'],
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
      generatedAt: row.generated_at,
    };
  }

  public getAiReportsList(limit = 200): AiReportHistoryEntry[] {
    const rows = this.db.prepare(`
      SELECT cache_key, replay_name, lap_number, baseline_replay_name, baseline_lap_number,
             model, prompt_tokens, completion_tokens, total_tokens, generated_at, report_json
      FROM ai_reports
      ORDER BY generated_at DESC
      LIMIT ?
    `).all(limit) as {
      cache_key: string;
      replay_name: string;
      lap_number: number;
      baseline_replay_name: string | null;
      baseline_lap_number: number | null;
      model: string;
      prompt_tokens: number | null;
      completion_tokens: number | null;
      total_tokens: number | null;
      generated_at: number;
      report_json: string;
    }[];

    return rows.map(row => {
      let overallSummary: string | undefined;
      try {
        overallSummary = (JSON.parse(row.report_json) as AiLapReport).overallSummary;
      } catch {
        overallSummary = undefined;
      }
      return {
        cacheKey: row.cache_key,
        replayName: row.replay_name,
        lapNumber: row.lap_number,
        baselineReplayName: row.baseline_replay_name,
        baselineLapNumber: row.baseline_lap_number,
        model: row.model,
        overallSummary,
        tokensUsed: row.total_tokens != null ? {
          prompt: row.prompt_tokens ?? 0,
          completion: row.completion_tokens ?? 0,
          total: row.total_tokens,
        } : undefined,
        generatedAt: row.generated_at,
      };
    });
  }

  public saveAiReport(record: AiReportRecord): void {
    this.db.prepare(`
      INSERT INTO ai_reports (
        cache_key, replay_name, lap_number, baseline_replay_name, baseline_lap_number,
        model, prompt_version, report_json, prompt_tokens, completion_tokens, total_tokens, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        report_json = excluded.report_json,
        prompt_tokens = excluded.prompt_tokens,
        completion_tokens = excluded.completion_tokens,
        total_tokens = excluded.total_tokens,
        generated_at = excluded.generated_at
    `).run(
      record.cacheKey,
      record.replayName,
      record.lapNumber,
      record.baselineReplayName ?? null,
      record.baselineLapNumber ?? null,
      record.model,
      record.promptVersion,
      JSON.stringify(record.report),
      record.promptTokens ?? null,
      record.completionTokens ?? null,
      record.totalTokens ?? null,
      record.generatedAt,
    );
  }

  public getReplayMetadataCache(filename: string, mtime: number, size: number, filePath?: string): ReplayMetadata | null {
    const row = this.db.prepare(
      'SELECT file_path, file_mtime, file_size, parser_version, metadata_br FROM replay_metadata WHERE filename = ?'
    ).get(filename) as { file_path: string; file_mtime: number; file_size: number; parser_version: string; metadata_br: Buffer } | undefined;
    if (!row || row.file_mtime !== mtime || row.file_size !== size || row.parser_version !== REPLAY_CACHE_VERSION || (filePath && row.file_path !== filePath)) {
      return null;
    }
    return decompressJson<ReplayMetadata>(row.metadata_br);
  }

  /** Returns stored metadata even when LMU has deleted the source .Vcr. */
  public getStoredReplayMetadata(filename: string): ReplayMetadata | null {
    const row = this.db.prepare(
      'SELECT parser_version, metadata_br FROM replay_metadata WHERE filename = ?'
    ).get(filename) as { parser_version: string; metadata_br: Buffer } | undefined;
    if (!row) return null;
    return decompressJson<ReplayMetadata>(row.metadata_br);
  }

  /** Returns stored file attributes and metadata for a cached replay file. */
  public getStoredReplayFileInfo(filename: string): { file_mtime: number; file_size: number; file_path: string; metadata: ReplayMetadata } | null {
    const row = this.db.prepare(
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
  public getAllStoredReplayFiles(): Array<{ filename: string; file_path: string; file_mtime: number; file_size: number; metadata: ReplayMetadata }> {
    const rows = this.db.prepare(
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

  public upsertReplayMetadataCache(filename: string, filePath: string, mtime: number, size: number, metadata: ReplayMetadata): void {
    this.db.prepare(`
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

  public getReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, filePath?: string): ReplayTrajectoryData | null {
    const row = this.db.prepare(
      'SELECT file_mtime, file_size, source_path, parser_version, trajectory_br FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?'
    ).get(filename, driverSlot, lapKey) as { file_mtime: number; file_size: number; source_path: string | null; parser_version: string; trajectory_br: Buffer } | undefined;
    if (!row || row.file_mtime !== mtime || row.file_size !== size || row.parser_version !== REPLAY_CACHE_VERSION || (filePath && row.source_path && row.source_path !== filePath)) {
      return null;
    }
    return decompressJson<ReplayTrajectoryData>(row.trajectory_br);
  }

  /** Returns a cached trajectory for a replay whose source .Vcr is no longer on disk. */
  public getStoredReplayTrajectory(filename: string, driverSlot: number, lapKey: number): ReplayTrajectoryData | null {
    const row = this.db.prepare(
      'SELECT parser_version, trajectory_br FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?'
    ).get(filename, driverSlot, lapKey) as { parser_version: string; trajectory_br: Buffer } | undefined;
    if (!row) return null;
    return decompressJson<ReplayTrajectoryData>(row.trajectory_br);
  }

  // Same validity check as getReplayTrajectoryCache but never reads/decompresses the
  // (potentially multi-MB) trajectory_br blob
  public hasValidReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, filePath?: string): boolean {
    const row = this.db.prepare(
      'SELECT file_mtime, file_size, source_path, parser_version FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?'
    ).get(filename, driverSlot, lapKey) as { file_mtime: number; file_size: number; source_path: string | null; parser_version: string } | undefined;
    return !!row && row.file_mtime === mtime && row.file_size === size && row.parser_version === REPLAY_CACHE_VERSION && (!filePath || !row.source_path || row.source_path === filePath);
  }

  public upsertReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, trajectory: ReplayTrajectoryData, filePath?: string): void {
    this.db.prepare(`
      INSERT INTO replay_trajectories (filename, source_path, driver_slot, lap_key, file_mtime, file_size, parser_version, points_count, trajectory_br, updated_at)
      VALUES (@filename, @filePath, @driverSlot, @lapKey, @mtime, @size, @parserVersion, @pointsCount, @trajectoryBr, @updatedAt)
      ON CONFLICT(filename, driver_slot, lap_key) DO UPDATE SET
        source_path = excluded.source_path,
        file_mtime = excluded.file_mtime,
        file_size = excluded.file_size,
        parser_version = excluded.parser_version,
        points_count = excluded.points_count,
        trajectory_br = excluded.trajectory_br,
        updated_at = excluded.updated_at
    `).run({
      filename,
      filePath: filePath || null,
      driverSlot,
      lapKey,
      mtime,
      size,
      parserVersion: REPLAY_CACHE_VERSION,
      pointsCount: trajectory.points.length,
      trajectoryBr: compressJson(trajectory),
      updatedAt: Date.now(),
    });
  }

  public clearReplayCache(): void {
    this.db.exec('DELETE FROM replay_metadata; DELETE FROM replay_trajectories;');
  }

  public upsertTelemetryMetadata(info: DuckDbFileInfo, matchedSessionId?: string, matchedReplayFilename?: string): void {
    this.db.prepare(`
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
    `).run({
      filename: info.filename,
      filePath: info.filePath,
      fileMtime: info.fileMtimeMs,
      fileSize: info.fileSizeBytes,
      trackName: info.trackName,
      sessionType: info.sessionType,
      sessionTimestamp: info.timestampStr,
      lapsCount: info.lapsCount || 0,
      metadataJson: JSON.stringify(info),
      matchedSessionId: matchedSessionId || null,
      matchedReplayFilename: matchedReplayFilename || null,
      updatedAt: Date.now(),
    });
  }

  public recordIngestError(sourceType: string, sourcePath: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO ingest_errors (source_type, source_path, error_message, attempts, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(source_type, source_path) DO UPDATE SET
        error_message = excluded.error_message,
        attempts = ingest_errors.attempts + 1,
        last_seen_at = excluded.last_seen_at
    `).run(sourceType, sourcePath, message, now, now);
  }

  public clearIngestError(sourceType: string, sourcePath: string): void {
    this.db.prepare('DELETE FROM ingest_errors WHERE source_type = ? AND source_path = ?').run(sourceType, sourcePath);
  }

  public getIngestErrors(): Array<{
    sourceType: string;
    sourcePath: string;
    errorMessage: string;
    attempts: number;
    firstSeenAt: number;
    lastSeenAt: number;
  }> {
    const rows = this.db.prepare(`
      SELECT source_type, source_path, error_message, attempts, first_seen_at, last_seen_at
      FROM ingest_errors ORDER BY last_seen_at DESC
    `).all() as Array<{
      source_type: string;
      source_path: string;
      error_message: string;
      attempts: number;
      first_seen_at: number;
      last_seen_at: number;
    }>;
    return rows.map(row => ({
      sourceType: row.source_type,
      sourcePath: row.source_path,
      errorMessage: row.error_message,
      attempts: row.attempts,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    }));
  }

  public getTelemetryFiles(): DuckDbFileInfo[] {
    const rows = this.db.prepare('SELECT metadata_json FROM telemetry_metadata').all() as { metadata_json: string }[];
    return rows.map((r) => JSON.parse(r.metadata_json) as DuckDbFileInfo);
  }

  public getTelemetryMetadata(): Array<{
    filename: string;
    filePath: string;
    matchedSessionId: string | null;
    matchedReplayFilename: string | null;
  }> {
    const rows = this.db.prepare(
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

  public getTelemetryLapCache(filename: string, lapNumber: number): DuckDbLapTelemetry | null {
    const row = this.db.prepare(
      'SELECT telemetry_br, cache_version FROM telemetry_lap_cache WHERE filename = ? AND lap_number = ?'
    ).get(filename, lapNumber) as { telemetry_br: Buffer; cache_version: string } | undefined;
    if (!row || row.cache_version !== DUCKDB_TELEMETRY_CACHE_VERSION) return null;
    return decompressJson<DuckDbLapTelemetry>(row.telemetry_br);
  }

  public upsertTelemetryLapCache(filename: string, lapNumber: number, lapData: DuckDbLapTelemetry): void {
    this.db.prepare(`
      INSERT INTO telemetry_lap_cache (filename, lap_number, points_count, telemetry_br, cache_version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(filename, lap_number) DO UPDATE SET
        points_count = excluded.points_count,
        telemetry_br = excluded.telemetry_br,
        cache_version = excluded.cache_version,
        updated_at = excluded.updated_at
    `).run(filename, lapNumber, lapData.pointsCount, compressJson(lapData), DUCKDB_TELEMETRY_CACHE_VERSION, Date.now());
  }

  public pruneTelemetryLapCache(maxAgeMs = 30 * 24 * 60 * 60 * 1000, maxBytes = 512 * 1024 * 1024): void {
    const cutoff = Date.now() - maxAgeMs;
    this.db.prepare('DELETE FROM telemetry_lap_cache WHERE updated_at < ?').run(cutoff);
    const sizeRow = this.db.prepare('SELECT COALESCE(SUM(LENGTH(telemetry_br)), 0) AS bytes FROM telemetry_lap_cache').get() as { bytes: number };
    if (sizeRow.bytes <= maxBytes) return;

    const deleteOldest = this.db.prepare('DELETE FROM telemetry_lap_cache WHERE filename = ? AND lap_number = ?');
    const oldestRows = this.db.prepare(
      'SELECT filename, lap_number, LENGTH(telemetry_br) AS bytes FROM telemetry_lap_cache ORDER BY updated_at ASC'
    ).all() as Array<{ filename: string; lap_number: number; bytes: number }>;
    let currentBytes = sizeRow.bytes;
    const prune = this.db.transaction(() => {
      for (const row of oldestRows) {
        if (currentBytes <= maxBytes) break;
        deleteOldest.run(row.filename, row.lap_number);
        currentBytes -= row.bytes;
      }
    });
    prune();
  }

  public clearTelemetryCache(): void {
    this.db.exec('DELETE FROM telemetry_metadata; DELETE FROM telemetry_lap_cache;');
  }

  public getReplaysCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM replay_metadata').get() as { count: number };
    return row.count;
  }

  public getReplayCacheList(): ReplayCacheSummary[] {
    const rows = this.db.prepare(`
      SELECT rm.filename, rm.file_size, rm.file_mtime, rm.metadata_br, rm.updated_at,
             COUNT(rt.filename) as trajectories_cached,
             LENGTH(rm.metadata_br) + COALESCE(SUM(LENGTH(rt.trajectory_br)), 0) as compressed_size
      FROM replay_metadata rm
      LEFT JOIN replay_trajectories rt ON rt.filename = rm.filename
      GROUP BY rm.filename
      ORDER BY rm.file_mtime DESC
    `).all() as { filename: string; file_size: number; file_mtime: number; metadata_br: Buffer; updated_at: number; trajectories_cached: number; compressed_size: number }[];

    return rows.map(row => {
      const meta = decompressJson<ReplayMetadata>(row.metadata_br);
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
      };
    });
  }

  public syncReplaysIterator(
    replaysDir: string,
    options: {
      playerName?: string;
      shouldStop?: () => boolean;
    } = {}
  ): Generator<ReplaySyncProgress, ReplaySyncResult, void> {
    return runSyncReplaysIterator(this, replaysDir, options);
  }

  public syncReplaysAsyncIterator(
    replaysDir: string,
    options: {
      playerName?: string;
      shouldStop?: () => boolean;
    } = {}
  ): AsyncGenerator<ReplaySyncProgress, ReplaySyncResult, void> {
    return runSyncReplaysAsyncIterator(this, replaysDir, options);
  }

  public syncReplaysFromDir(
    replaysDir: string,
    options: {
      playerName?: string;
      onProgress?: (progress: ReplaySyncProgress) => void;
      shouldStop?: () => boolean;
    } = {}
  ): ReplaySyncResult {
    return runSyncReplaysFromDir(this, replaysDir, options);
  }

  private allSessionsCache: DetailedSession[] | null = null;

  public getAllSessions(): DetailedSession[] {
    if (this.allSessionsCache) return this.allSessionsCache;
    const rows = this.db.prepare('SELECT data_json FROM sessions ORDER BY timestamp ASC').all() as { data_json: string }[];
    const sessions = rows.map(r => JSON.parse(r.data_json) as DetailedSession);
    this.allSessionsCache = sessions;
    return sessions;
  }

  public getAllSessionSummaries(): SessionMetadata[] {
    const rows = this.db.prepare('SELECT metadata_json FROM sessions ORDER BY timestamp ASC').all() as { metadata_json: string }[];
    return rows.map(r => JSON.parse(r.metadata_json) as SessionMetadata);
  }

  private stmtGetSessionById: Statement | null = null;

  public getSessionById(id: string): DetailedSession | null {
    const cleanId = id.endsWith('.xml') ? id.replace(/\.xml$/, '') : id;
    const withXml = `${cleanId}.xml`;

    if (this.allSessionsCache) {
      const found = this.allSessionsCache.find(s =>
        s.id === id || s.id === cleanId || s.id === withXml || s.filename === id || s.filename === withXml
      );
      if (found) return found;
    }

    if (!this.stmtGetSessionById) {
      this.stmtGetSessionById = this.db.prepare(
        'SELECT data_json FROM sessions WHERE id = ? OR id = ? OR id = ? OR filename = ? OR filename = ? LIMIT 1'
      );
    }

    const row = this.stmtGetSessionById.get(id, cleanId, withXml, withXml, id) as { data_json: string } | undefined;
    if (!row) return null;

    return JSON.parse(row.data_json) as DetailedSession;
  }

  public upsertSession(session: DetailedSession, filePath: string, mtime: number, size: number): void {
    const { drivers, ...meta } = session;
    const metadataJson = JSON.stringify(meta);
    const dataJson = JSON.stringify(session);
    const now = Date.now();

    const stmt = this.db.prepare(`
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

    this.allSessionsCache = null;
  }

  public updateSessionMatchingReplay(sessionId: string, matchingReplayFile: NonNullable<SessionMetadata['matchingReplayFile']>): void {
    const row = this.db.prepare('SELECT metadata_json, data_json FROM sessions WHERE id = ?').get(sessionId) as { metadata_json: string; data_json: string } | undefined;
    if (!row) return;
    try {
      const meta = JSON.parse(row.metadata_json) as SessionMetadata;
      const data = JSON.parse(row.data_json) as DetailedSession;
      meta.matchingReplayFile = matchingReplayFile;
      data.matchingReplayFile = matchingReplayFile;
      this.db.prepare('UPDATE sessions SET metadata_json = ?, data_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(meta), JSON.stringify(data), Date.now(), sessionId);
      if (this.allSessionsCache) {
        const cached = this.allSessionsCache.find(s => s.id === sessionId);
        if (cached) cached.matchingReplayFile = matchingReplayFile;
      }
    } catch (err) {
      console.warn('[SessionDb] Failed to update session matching replay:', err);
    }
  }

  public *syncSessionsIterator(
    resultsDir: string,
    parser: LmuParser,
    forceReparse = false
  ): Generator<SessionSyncProgress, SyncResult, void> {
    if (!fs.existsSync(resultsDir)) {
      return {
        added: 0,
        updated: 0,
        total: this.getSessionsCount(),
        lastSyncedAt: this.getMetadata('last_synced_at') || new Date().toISOString(),
      };
    }

    const DB_PARSER_VERSION = '2.11_accurate_fixed_setups_and_tire_warmers';
    const cachedVersion = this.getMetadata('parser_version');
    const versionMismatch = cachedVersion !== DB_PARSER_VERSION;

    // Get existing cached session file info
    const existingRows = versionMismatch ? [] : (this.db.prepare('SELECT id, file_path, file_mtime, file_size FROM sessions').all() as {
      id: string;
      file_path: string;
      file_mtime: number;
      file_size: number;
    }[]);

    const cacheMap = new Map<string, { id: string; file_mtime: number; file_size: number }>();
    for (const row of existingRows) {
      cacheMap.set(path.normalize(row.file_path).toLowerCase(), row);
    }

    // Seed parser's replay index with stored DB replays so deleted VCR files still match
    const storedReplays = this.getAllStoredReplayFiles();
    for (const r of storedReplays) {
      const match = r.filename.match(/^(.+?)\s+([PQR]\d+)\b/i);
      const trackName = match ? match[1].trim() : (r.metadata.trackVenue || r.metadata.trackCourse || r.metadata.trackName || r.filename.replace(/\.vcr$/i, ''));
      const sessionCode = match ? match[2].toUpperCase() : (r.metadata.sessionType || '');
      parser.addReplayEntry({
        name: r.filename,
        path: r.file_path,
        sizeBytes: r.file_size,
        trackName,
        sessionCode,
        mtime: r.file_mtime,
        eventTitle: r.metadata.eventInfo?.eventTitle,
        splitNo: r.metadata.eventInfo?.splitNo,
        eventType: r.metadata.eventInfo?.eventType,
        durationSec: r.metadata.durationSec,
      });
    }

    const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.xml'));
    let added = 0;
    let updated = 0;

    // Keep the previous parser-version cache readable until its complete replacement is ready.
    const persistTransaction = this.db.transaction((sessionsToInsert: { session: DetailedSession; filePath: string; mtime: number; size: number }[]) => {
      if (versionMismatch) {
        this.db.exec('DELETE FROM sessions');
        this.setMetadata('parser_version', DB_PARSER_VERSION);
        this.allSessionsCache = null;
      }
      for (const item of sessionsToInsert) {
        this.upsertSession(item.session, item.filePath, item.mtime, item.size);
      }
    });

    const pendingInserts: { session: DetailedSession; filePath: string; mtime: number; size: number }[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      yield { processed: i, total: files.length, currentFile: f, stage: 'Reading XML session log', filePercent: 5 };
      const filePath = path.join(resultsDir, f);
      try {
        const stats = fs.statSync(filePath);
        const normalizedPath = path.normalize(filePath).toLowerCase();
        const cached = cacheMap.get(normalizedPath);

        // Check if file is already cached and unmodified
        if (!forceReparse && cached && cached.file_mtime === Math.floor(stats.mtimeMs) && cached.file_size === stats.size) {
          continue;
        }

        // Parse new or modified XML file
        const parsed = parser.parseSessionXml(filePath);
        if (parsed) {
          pendingInserts.push({
            session: parsed,
            filePath,
            mtime: Math.floor(stats.mtimeMs),
            size: stats.size,
          });

          if (cached) {
            updated++;
          } else {
            added++;
          }
          this.clearIngestError('xml', filePath);
        }
      } catch (err) {
        this.recordIngestError('xml', filePath, err);
        console.error(`Error processing session XML file ${filePath}:`, err);
      }
    }

    if (pendingInserts.length > 0 || versionMismatch) {
      yield { processed: files.length, total: files.length, currentFile: '', stage: 'Persisting session cache', filePercent: 95 };
      persistTransaction(pendingInserts);
    }

    const nowIso = new Date().toISOString();
    this.setMetadata('last_synced_at', nowIso);
    this.setMetadata('results_dir', resultsDir);

    return {
      added,
      updated,
      total: this.getSessionsCount(),
      lastSyncedAt: nowIso,
    };
  }

  public syncSessionsFromDir(
    resultsDir: string,
    parser: LmuParser,
    forceReparse = false,
    onProgress?: (progress: SessionSyncProgress) => void
  ): SyncResult {
    const iterator = this.syncSessionsIterator(resultsDir, parser, forceReparse);
    let step = iterator.next();
    while (!step.done) {
      onProgress?.(step.value);
      step = iterator.next();
    }
    return step.value;
  }

  public async *syncSessionsAsyncIterator(
    resultsDir: string,
    parser: LmuParser,
    forceReparse = false
  ): AsyncGenerator<SessionSyncProgress, SyncResult, void> {
    const iterator = this.syncSessionsIterator(resultsDir, parser, forceReparse);
    let step = iterator.next();
    while (!step.done) {
      yield step.value;
      step = iterator.next();
    }
    return step.value;
  }

  public getSessionsCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
    return row.count;
  }

  public clearCache(): void {
    this.allSessionsCache = null;
    this.db.exec("DELETE FROM sessions; DELETE FROM cache_metadata WHERE key NOT LIKE 'reference_%';");
  }

  public saveReferenceLaptimes(cache: ReferenceLaptimesCache): void {
    const upsertStmt = this.db.prepare(`
      INSERT INTO reference_laptimes (
        key, track_name, car_class, patch, target100_sec,
        alien_sec, competitive_sec, good_sec, good_midpack_sec,
        midpack_sec, midpack_tail_sec, tail_ender_sec, offline_sec,
        fastest_car, record_laptime_sec, data_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        track_name = excluded.track_name,
        car_class = excluded.car_class,
        patch = excluded.patch,
        target100_sec = excluded.target100_sec,
        alien_sec = excluded.alien_sec,
        competitive_sec = excluded.competitive_sec,
        good_sec = excluded.good_sec,
        good_midpack_sec = excluded.good_midpack_sec,
        midpack_sec = excluded.midpack_sec,
        midpack_tail_sec = excluded.midpack_tail_sec,
        tail_ender_sec = excluded.tail_ender_sec,
        offline_sec = excluded.offline_sec,
        fastest_car = excluded.fastest_car,
        record_laptime_sec = excluded.record_laptime_sec,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `);

    const now = Date.now();
    const entries = Object.values(cache.entries);

    const transaction = this.db.transaction(() => {
      this.setMetadata('reference_laptimes_last_updated', cache.lastUpdated);
      this.setMetadata('reference_laptimes_source_url', cache.sourceUrl);
      if (cache.lastUpdateDiff) {
        this.setMetadata('reference_laptimes_last_diff', JSON.stringify(cache.lastUpdateDiff));
      }

      for (const entry of entries) {
        const targets = entry.targets || {
          alienSec: entry.target100Sec,
          competitiveSec: entry.target100Sec * 1.01,
          goodSec: entry.target100Sec * 1.02,
          goodMidpackSec: entry.target100Sec * 1.03,
          midpackSec: entry.target100Sec * 1.04,
          midpackTailSec: entry.target100Sec * 1.05,
          tailEnderSec: entry.target100Sec * 1.06,
          offlineSec: entry.target100Sec * 1.07,
        };

        upsertStmt.run(
          entry.key,
          entry.trackName,
          entry.carClass,
          entry.patch || null,
          entry.target100Sec,
          targets.alienSec,
          targets.competitiveSec,
          targets.goodSec,
          targets.goodMidpackSec,
          targets.midpackSec,
          targets.midpackTailSec,
          targets.tailEnderSec,
          targets.offlineSec,
          entry.fastestCar || null,
          entry.recordLaptimeSec ?? null,
          JSON.stringify(entry),
          now
        );
      }

      const existingKeys = this.db.prepare('SELECT key FROM reference_laptimes').all() as { key: string }[];
      const newKeySet = new Set(Object.keys(cache.entries));
      const deleteStmt = this.db.prepare('DELETE FROM reference_laptimes WHERE key = ?');
      for (const row of existingKeys) {
        if (!newKeySet.has(row.key)) {
          deleteStmt.run(row.key);
        }
      }
    });

    transaction();
  }

  public getReferenceLaptimesCache(): ReferenceLaptimesCache | null {
    const rows = this.db.prepare('SELECT data_json FROM reference_laptimes').all() as { data_json: string }[];
    if (rows.length === 0) {
      return null;
    }

    const entries: Record<string, ReferenceLaptimeEntry> = {};
    for (const row of rows) {
      const entry = JSON.parse(row.data_json) as ReferenceLaptimeEntry;
      entries[entry.key] = entry;
    }

    const lastUpdated = this.getMetadata('reference_laptimes_last_updated') || new Date().toISOString();
    const sourceUrl = this.getMetadata('reference_laptimes_source_url') || '';
    const diffJson = this.getMetadata('reference_laptimes_last_diff');
    const lastUpdateDiff = diffJson ? (JSON.parse(diffJson) as ReferenceBenchmarkDiff) : null;

    return {
      lastUpdated,
      sourceUrl,
      entriesCount: Object.keys(entries).length,
      entries,
      lastUpdateDiff,
    };
  }

  public getReferenceLaptimeEntry(key: string): ReferenceLaptimeEntry | null {
    const row = this.db.prepare('SELECT data_json FROM reference_laptimes WHERE key = ?').get(key) as { data_json: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.data_json) as ReferenceLaptimeEntry;
  }

  public clearReferenceLaptimes(): void {
    this.db.exec("DELETE FROM reference_laptimes; DELETE FROM cache_metadata WHERE key LIKE 'reference_%';");
  }

  public getCacheStats(): CacheStats {
    const count = this.getSessionsCount();
    const lastSyncedAt = this.getMetadata('last_synced_at');
    const replaysCount = (this.db.prepare('SELECT COUNT(*) as count FROM replay_metadata').get() as { count: number }).count;
    const replayTrajectoriesCount = (this.db.prepare('SELECT COUNT(*) as count FROM replay_trajectories').get() as { count: number }).count;
    const telemetryFilesCount = (this.db.prepare('SELECT COUNT(*) as count FROM telemetry_metadata').get() as { count: number }).count;

    let dbSizeBytes = 0;
    if (this.dbPath !== ':memory:' && fs.existsSync(this.dbPath)) {
      try {
        dbSizeBytes = fs.statSync(this.dbPath).size;
      } catch {
        dbSizeBytes = 0;
      }
    }

    return {
      enabled: true,
      dbPath: this.dbPath,
      sessionsCount: count,
      lastSyncedAt,
      dbSizeBytes,
      replaysCount,
      replayTrajectoriesCount,
      telemetryFilesCount,
    };
  }

  public close(): void {
    this.db.close();
  }
}

// Singleton instance
let defaultDbInstance: SessionDatabase | null = null;

export function getSessionDatabase(customPath?: string): SessionDatabase {
  if (!defaultDbInstance || customPath) {
    const instance = new SessionDatabase(customPath);
    if (!customPath) {
      defaultDbInstance = instance;
    }
    return instance;
  }
  return defaultDbInstance;
}

export function resetSessionDatabaseForTest(customPath?: string): SessionDatabase {
  if (defaultDbInstance) {
    try {
      defaultDbInstance.close();
    } catch {
      // ignore
    }
  }
  defaultDbInstance = new SessionDatabase(customPath || ':memory:');
  return defaultDbInstance;
}
