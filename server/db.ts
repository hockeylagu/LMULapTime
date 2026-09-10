import Database, { Database as DatabaseType, Statement } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { AiReportRecord, DetailedSession, SessionMetadata, ReferenceLaptimeEntry, ReferenceLaptimesCache, ReferenceBenchmarkDiff, ReplayMetadata, ReplayTrajectoryData, ReplayCacheSummary, AiReportHistoryEntry, AiLapReport } from './types.js';
import { LmuParser } from './parser.js';
import { parseReplayMetadata, extractReplayTrajectory } from './replayParser.js';

// Bumped whenever the .Vcr binary parsing algorithm changes in a way that would
// invalidate previously-cached replay metadata/trajectory rows, without requiring
// the underlying replay file's mtime/size to change.
const REPLAY_CACHE_VERSION = 'v1';

// Replay JSON blobs (esp. full-resolution trajectories with thousands of points) are
// large and highly repetitive, so brotli gives a much better ratio than gzip for a
// one-time write / many-read cache like this.
function compressJson(value: unknown): Buffer {
  return zlib.brotliCompressSync(Buffer.from(JSON.stringify(value), 'utf8'), {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 },
  });
}

function decompressJson<T>(buf: Buffer): T {
  return JSON.parse(zlib.brotliDecompressSync(buf).toString('utf8')) as T;
}

export interface CacheStats {
  enabled: boolean;
  dbPath: string;
  sessionsCount: number;
  lastSyncedAt: string | null;
  dbSizeBytes: number;
  replaysCount: number;
  replayTrajectoriesCount: number;
}

export interface SyncResult {
  added: number;
  updated: number;
  total: number;
  lastSyncedAt: string;
}

export interface ReplaySyncProgress {
  processed: number;
  total: number;
  currentFile: string;
}

export interface ReplaySyncResult {
  added: number;
  updated: number;
  skipped: number;
  total: number;
  lastSyncedAt: string;
  interrupted: boolean;
}

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
      this.dbPath = path.join(serverDir, 'lmu_cache.db');
    }

    this.db = new Database(this.dbPath);
    // Performance pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_mtime INTEGER NOT NULL,
        file_size INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        track_venue TEXT NOT NULL,
        track_course TEXT NOT NULL,
        session_type TEXT NOT NULL,
        session_name TEXT NOT NULL,
        player_driver_name TEXT,
        player_car_class TEXT,
        player_car_type TEXT,
        player_best_lap_time REAL,
        player_laps_count INTEGER,
        drivers_count INTEGER,
        metadata_json TEXT NOT NULL,
        data_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp);
      CREATE INDEX IF NOT EXISTS idx_sessions_track ON sessions(track_venue);

      CREATE TABLE IF NOT EXISTS reference_laptimes (
        key TEXT PRIMARY KEY,
        track_name TEXT NOT NULL,
        car_class TEXT NOT NULL,
        patch TEXT,
        target100_sec REAL NOT NULL,
        alien_sec REAL NOT NULL,
        competitive_sec REAL NOT NULL,
        good_sec REAL NOT NULL,
        good_midpack_sec REAL NOT NULL,
        midpack_sec REAL NOT NULL,
        midpack_tail_sec REAL NOT NULL,
        tail_ender_sec REAL NOT NULL,
        offline_sec REAL NOT NULL,
        fastest_car TEXT,
        record_laptime_sec REAL,
        data_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ref_track_class ON reference_laptimes(track_name, car_class);

      CREATE TABLE IF NOT EXISTS cache_metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS ai_reports (
        cache_key TEXT PRIMARY KEY,
        replay_name TEXT NOT NULL,
        lap_number INTEGER NOT NULL,
        baseline_replay_name TEXT,
        baseline_lap_number INTEGER,
        model TEXT NOT NULL,
        prompt_version INTEGER NOT NULL,
        report_json TEXT NOT NULL,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        generated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS replay_metadata (
        filename TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        file_mtime INTEGER NOT NULL,
        file_size INTEGER NOT NULL,
        parser_version TEXT NOT NULL,
        metadata_br BLOB NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS replay_trajectories (
        filename TEXT NOT NULL,
        driver_slot INTEGER NOT NULL,
        lap_key INTEGER NOT NULL,
        file_mtime INTEGER NOT NULL,
        file_size INTEGER NOT NULL,
        parser_version TEXT NOT NULL,
        points_count INTEGER NOT NULL,
        trajectory_br BLOB NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (filename, driver_slot, lap_key)
      );
    `);
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

  public getReplayMetadataCache(filename: string, mtime: number, size: number): ReplayMetadata | null {
    const row = this.db.prepare(
      'SELECT file_mtime, file_size, parser_version, metadata_br FROM replay_metadata WHERE filename = ?'
    ).get(filename) as { file_mtime: number; file_size: number; parser_version: string; metadata_br: Buffer } | undefined;
    if (!row || row.file_mtime !== mtime || row.file_size !== size || row.parser_version !== REPLAY_CACHE_VERSION) {
      return null;
    }
    return decompressJson<ReplayMetadata>(row.metadata_br);
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

  public getReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number): ReplayTrajectoryData | null {
    const row = this.db.prepare(
      'SELECT file_mtime, file_size, parser_version, trajectory_br FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?'
    ).get(filename, driverSlot, lapKey) as { file_mtime: number; file_size: number; parser_version: string; trajectory_br: Buffer } | undefined;
    if (!row || row.file_mtime !== mtime || row.file_size !== size || row.parser_version !== REPLAY_CACHE_VERSION) {
      return null;
    }
    return decompressJson<ReplayTrajectoryData>(row.trajectory_br);
  }

  // Same validity check as getReplayTrajectoryCache but never reads/decompresses the
  // (potentially multi-MB) trajectory_br blob - used by the eager sync loop, which only
  // needs to know whether a row is already cached, not its contents.
  public hasValidReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number): boolean {
    const row = this.db.prepare(
      'SELECT file_mtime, file_size, parser_version FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?'
    ).get(filename, driverSlot, lapKey) as { file_mtime: number; file_size: number; parser_version: string } | undefined;
    return !!row && row.file_mtime === mtime && row.file_size === size && row.parser_version === REPLAY_CACHE_VERSION;
  }

  public upsertReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, trajectory: ReplayTrajectoryData): void {
    this.db.prepare(`
      INSERT INTO replay_trajectories (filename, driver_slot, lap_key, file_mtime, file_size, parser_version, points_count, trajectory_br, updated_at)
      VALUES (@filename, @driverSlot, @lapKey, @mtime, @size, @parserVersion, @pointsCount, @trajectoryBr, @updatedAt)
      ON CONFLICT(filename, driver_slot, lap_key) DO UPDATE SET
        file_mtime = excluded.file_mtime,
        file_size = excluded.file_size,
        parser_version = excluded.parser_version,
        points_count = excluded.points_count,
        trajectory_br = excluded.trajectory_br,
        updated_at = excluded.updated_at
    `).run({
      filename,
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

  /**
   * Persists every lap of an `allLaps: true` trajectory result under its own (driverSlot, lap)
   * cache row, plus one extra row keyed by lap -1 mirroring the trajectory's chosen/best lap -
   * matching the cache-key convention used for "no explicit lap requested" lookups.
   */
  private cacheAllLapsForDriver(filename: string, mtime: number, size: number, driverSlotKey: number, trajectory: ReplayTrajectoryData): void {
    const perLap = trajectory.allLapsData && trajectory.allLapsData.length > 0 ? trajectory.allLapsData : [trajectory];
    for (const lapTrajectory of perLap) {
      if (typeof lapTrajectory.currentLap !== 'number') continue;
      const { allLapsData: _unused, ...single } = lapTrajectory;
      this.upsertReplayTrajectoryCache(filename, driverSlotKey, lapTrajectory.currentLap, mtime, size, single);
    }
    const { allLapsData: _unused2, ...defaultSingle } = trajectory;
    this.upsertReplayTrajectoryCache(filename, driverSlotKey, -1, mtime, size, defaultSingle);
  }

  /**
   * Same work as `syncReplaysFromDir`, but as a generator that yields progress after every
   * unit of expensive synchronous work (each file, and each per-driver trajectory extraction
   * within a file) instead of running the whole directory in one blocking call. The server
   * drives this with `setImmediate` between `.next()` calls so a large replay library doesn't
   * starve the event loop and make the HTTP server unresponsive for the whole scan.
   */
  public *syncReplaysIterator(
    replaysDir: string,
    options: {
      playerName?: string;
      // Checked between files (and between per-driver extractions within a file) so a
      // graceful shutdown can stop the scan without leaving a file half-processed at a
      // point that isn't safe to resume from. Every cache row written so far stays valid -
      // resuming later just re-checks each (file, driver, lap) key and fills in the rest.
      shouldStop?: () => boolean;
    } = {}
  ): Generator<ReplaySyncProgress, ReplaySyncResult, void> {
    const lastSyncedAt = this.getMetadata('replays_last_synced_at') || new Date().toISOString();
    if (!fs.existsSync(replaysDir)) {
      return { added: 0, updated: 0, skipped: 0, total: this.getReplaysCount(), lastSyncedAt, interrupted: false };
    }

    const files = fs.readdirSync(replaysDir).filter(f => f.toLowerCase().endsWith('.vcr'));
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let interrupted = false;
    let processedCount = 0;

    for (let i = 0; i < files.length; i++) {
      if (options.shouldStop?.()) {
        interrupted = true;
        break;
      }
      const f = files[i];
      yield { processed: i, total: files.length, currentFile: f };
      const filePath = path.join(replaysDir, f);
      try {
        const stat = fs.statSync(filePath);
        const mtime = Math.floor(stat.mtimeMs);
        const size = stat.size;

        let metadata = this.getReplayMetadataCache(f, mtime, size);
        const isNewMetadata = !metadata;
        if (!metadata) {
          try {
            metadata = parseReplayMetadata(filePath, { playerName: options.playerName });
          } catch {
            skipped++; // invalid or currently-active recording file
            continue;
          }
          this.upsertReplayMetadataCache(f, filePath, mtime, size, metadata);
        }

        let anyTrajectoryNewlyCached = false;

        // One full-resolution, all-laps scan per driver: `allLaps: true` finalizes every
        // detected lap for that driver from the single binary pass already required to
        // find them, so this stays O(numDrivers) file scans rather than O(drivers x laps).
        // Each driver's cache is checked independently (not gated on metadata being cached)
        // so a previously-failed or partial trajectory cache still gets filled in on rescan.
        // Only a cheap existence check (no blob decompression) is needed here - the actual
        // resolved slot is looked up on-demand elsewhere; on an already-cached rescan this
        // avoids decompressing every driver's full trajectory just to test presence.
        let defaultDriverSlot: number | undefined;
        if (!this.hasValidReplayTrajectoryCache(f, -1, -1, mtime, size)) {
          try {
            const trajectory = extractReplayTrajectory(filePath, { playerName: options.playerName, maxPoints: 0, allLaps: true });
            defaultDriverSlot = trajectory.driverSlot;
            this.cacheAllLapsForDriver(f, mtime, size, -1, trajectory);
            // Also cache under the resolved driver's own slot number, since the frontend
            // sends an explicit driverSlot once one has been resolved - even for laps of
            // the default/player driver - and that lookup uses the real slot, not -1.
            if (typeof defaultDriverSlot === 'number') {
              this.cacheAllLapsForDriver(f, mtime, size, defaultDriverSlot, trajectory);
            }
            anyTrajectoryNewlyCached = true;
          } catch {
            // Metadata is still cached even if trajectory extraction fails
          }
          // Yield after this driver's (expensive) full binary scan before moving on to others.
          yield { processed: i, total: files.length, currentFile: f };
        }

        for (const driver of metadata.drivers) {
          if (options.shouldStop?.()) {
            interrupted = true;
            break;
          }
          if (typeof driver.slot !== 'number' || driver.slot === defaultDriverSlot) continue;
          if (this.hasValidReplayTrajectoryCache(f, driver.slot, -1, mtime, size)) continue; // already cached
          try {
            const driverTrajectory = extractReplayTrajectory(filePath, {
              driverSlot: driver.slot,
              playerName: options.playerName,
              maxPoints: 0,
              allLaps: true,
            });
            this.cacheAllLapsForDriver(f, mtime, size, driver.slot, driverTrajectory);
            anyTrajectoryNewlyCached = true;
          } catch {
            // Skip drivers whose trajectory can't be extracted (e.g. no telemetry frames)
          }
          // Yield between every driver's extraction - the truly expensive per-file work.
          yield { processed: i, total: files.length, currentFile: f };
        }

        if (isNewMetadata) {
          added++;
        } else if (anyTrajectoryNewlyCached) {
          updated++;
        }
      } catch (err) {
        console.error(`Error caching replay file ${filePath}:`, err);
      } finally {
        processedCount = i + 1;
      }
      if (interrupted) break;
    }

    yield { processed: processedCount, total: files.length, currentFile: '' };

    const nowIso = new Date().toISOString();
    this.setMetadata('replays_last_synced_at', nowIso);
    this.setMetadata('replays_dir', replaysDir);

    return { added, updated, skipped, total: this.getReplaysCount(), lastSyncedAt: nowIso, interrupted };
  }

  /**
   * Eagerly parses every not-yet-cached (or changed) .Vcr file in `replaysDir` - metadata,
   * drivers, and every driver's every lap at full resolution (points, sectors, pit/flag/penalty
   * events) - and persists it all to SQLite. LMU periodically deletes old replay files on disk,
   * so this must run alongside the session scan rather than lazily on first UI request, or that
   * data would be lost forever once the file is gone. The database is meant to be the source of
   * truth for the app after this runs - viewing any driver/lap should never need to re-read the
   * .Vcr binary.
   *
   * Synchronously drains `syncReplaysIterator` in one call - fine for tests and for small
   * libraries, but the live server drives the iterator directly (see index.ts) so it can
   * yield to the event loop between files instead of blocking it for the whole scan.
   */
  public syncReplaysFromDir(
    replaysDir: string,
    options: {
      playerName?: string;
      onProgress?: (progress: ReplaySyncProgress) => void;
      shouldStop?: () => boolean;
    } = {}
  ): ReplaySyncResult {
    const iterator = this.syncReplaysIterator(replaysDir, options);
    let step = iterator.next();
    while (!step.done) {
      options.onProgress?.(step.value);
      step = iterator.next();
    }
    return step.value;
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

    // Reuse the already-loaded full session list when available, instead of maintaining a
    // second in-memory cache that would need its own invalidation kept in sync with this one.
    if (this.allSessionsCache) {
      const found = this.allSessionsCache.find(s =>
        s.id === id || s.id === cleanId || s.id === withXml || s.filename === id || s.filename === withXml
      );
      if (found) return found;
    }

    // Query SQLite with a cached prepared statement
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

  public syncSessionsFromDir(resultsDir: string, parser: LmuParser, forceReparse = false): SyncResult {
    if (!fs.existsSync(resultsDir)) {
      return {
        added: 0,
        updated: 0,
        total: this.getSessionsCount(),
        lastSyncedAt: this.getMetadata('last_synced_at') || new Date().toISOString(),
      };
    }

    const DB_PARSER_VERSION = '2.9_replay_match_session_scoped';
    const cachedVersion = this.getMetadata('parser_version');
    const versionMismatch = cachedVersion !== DB_PARSER_VERSION;
    if (versionMismatch) {
      this.db.exec('DELETE FROM sessions');
      this.setMetadata('parser_version', DB_PARSER_VERSION);
    }

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

    const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.xml'));
    let added = 0;
    let updated = 0;

    // Use transaction for batch upserts
    const insertTransaction = this.db.transaction((sessionsToInsert: { session: DetailedSession; filePath: string; mtime: number; size: number }[]) => {
      for (const item of sessionsToInsert) {
        this.upsertSession(item.session, item.filePath, item.mtime, item.size);
      }
    });

    const pendingInserts: { session: DetailedSession; filePath: string; mtime: number; size: number }[] = [];

    for (const f of files) {
      const filePath = path.join(resultsDir, f);
      try {
        const stats = fs.statSync(filePath);
        const normalizedPath = path.normalize(filePath).toLowerCase();
        const cached = cacheMap.get(normalizedPath);

        // Check if file is already cached and unmodified (unless a reparse is forced, e.g. after a benchmark update)
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
        }
      } catch (err) {
        console.error(`Error processing session XML file ${filePath}:`, err);
      }
    }

    if (pendingInserts.length > 0) {
      insertTransaction(pendingInserts);
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
      // Save metadata
      this.setMetadata('reference_laptimes_last_updated', cache.lastUpdated);
      this.setMetadata('reference_laptimes_source_url', cache.sourceUrl);
      if (cache.lastUpdateDiff) {
        this.setMetadata('reference_laptimes_last_diff', JSON.stringify(cache.lastUpdateDiff));
      }

      // Upsert all entries
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

      // Remove deleted entries if any
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
