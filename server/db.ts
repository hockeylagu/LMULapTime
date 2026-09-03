import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DetailedSession, SessionMetadata } from './types.js';
import { LmuParser } from './parser.js';

export interface CacheStats {
  enabled: boolean;
  dbPath: string;
  sessionsCount: number;
  lastSyncedAt: string | null;
  dbSizeBytes: number;
}

export interface SyncResult {
  added: number;
  updated: number;
  total: number;
  lastSyncedAt: string;
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
      const serverDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
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

      CREATE TABLE IF NOT EXISTS cache_metadata (
        key TEXT PRIMARY KEY,
        value TEXT
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

  public getAllSessions(): DetailedSession[] {
    const rows = this.db.prepare('SELECT data_json FROM sessions ORDER BY timestamp ASC').all() as { data_json: string }[];
    return rows.map(r => JSON.parse(r.data_json) as DetailedSession);
  }

  public getAllSessionSummaries(): SessionMetadata[] {
    const rows = this.db.prepare('SELECT metadata_json FROM sessions ORDER BY timestamp ASC').all() as { metadata_json: string }[];
    return rows.map(r => JSON.parse(r.metadata_json) as SessionMetadata);
  }

  public getSessionById(id: string): DetailedSession | null {
    const row = this.db.prepare('SELECT data_json FROM sessions WHERE id = ?').get(id) as { data_json: string } | undefined;
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
  }

  public syncSessionsFromDir(resultsDir: string, parser: LmuParser): SyncResult {
    if (!fs.existsSync(resultsDir)) {
      return {
        added: 0,
        updated: 0,
        total: this.getSessionsCount(),
        lastSyncedAt: this.getMetadata('last_synced_at') || new Date().toISOString(),
      };
    }

    // Get existing cached session file info
    const existingRows = this.db.prepare('SELECT id, file_path, file_mtime, file_size FROM sessions').all() as {
      id: string;
      file_path: string;
      file_mtime: number;
      file_size: number;
    }[];

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

        // Check if file is already cached and unmodified
        if (cached && cached.file_mtime === Math.floor(stats.mtimeMs) && cached.file_size === stats.size) {
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
    this.db.exec('DELETE FROM sessions; DELETE FROM cache_metadata;');
  }

  public getCacheStats(): CacheStats {
    const count = this.getSessionsCount();
    const lastSyncedAt = this.getMetadata('last_synced_at');

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
