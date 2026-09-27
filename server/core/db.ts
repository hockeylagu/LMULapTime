import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  AiReportRecord,
  DetailedSession,
  SessionMetadata,
  ReferenceLaptimeEntry,
  ReferenceLaptimesCache,
  ReplayMetadata,
  ReplayTrajectoryData,
  ReplayCacheSummary,
  AiReportHistoryEntry,
  RejectedReplayLink,
  ReplayLinkRejectionReason,
  DuckDbLapTelemetry,
} from './types.js';
import { DuckDbFileInfo } from '../telemetry/telemetryMatcher.js';
import {
  initDbSchema,
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
  ReplaySyncHost,
} from './dbReplaySync.js';
import {
  getReplayTrajectoryCache,
  getStoredReplayTrajectory,
  getAdjacentLapTrajectories,
  hasValidReplayTrajectoryCache,
  setTrajectoryDefaults,
  upsertReplayTrajectoryCache,
} from './dbReplayTrajectoryStore.js';
import {
  StoredReplayFileInfo,
  getAllStoredReplayFiles,
  getReplayMetadataCache,
  getStoredReplayFileInfo,
  getStoredReplayMetadata,
  upsertReplayMetadataCache,
  getReplaysCount,
  getReplayCacheList,
} from './dbReplayMetadataStore.js';
import {
  getMetadata,
  setMetadata,
  recordIngestError,
  clearIngestError,
  getIngestErrors,
  IngestErrorEntry,
} from './dbMetadataStore.js';
import {
  getAiReport,
  getAiReportsList,
  saveAiReport,
} from './dbAiReportStore.js';
import {
  upsertTelemetryMetadata,
  getTelemetryFiles,
  getTelemetryMetadata,
  getTelemetryLapCache,
  upsertTelemetryLapCache,
  pruneTelemetryLapCache,
  clearTelemetryCache,
  TelemetryMetadataRecord,
} from './dbTelemetryStore.js';
import {
  saveReferenceLaptimes,
  getReferenceLaptimesCache,
  getReferenceLaptimeEntry,
  clearReferenceLaptimes,
} from './dbReferenceLaptimeStore.js';
import {
  getAllSessions as fetchAllSessions,
  getAllSessionSummaries as fetchAllSessionSummaries,
  getSessionById as fetchSessionById,
  upsertSession as insertOrUpdateSession,
  updateSessionMatchingReplay as modifySessionMatchingReplay,
  getSessionsCount as fetchSessionsCount,
  clearSessionCache,
} from './dbSessionStore.js';
import { getRejectedReplayLinks, rejectSessionReplayLink } from './dbReplayLinkStore.js';
import {
  SessionXmlSyncParser,
  SessionSyncHost,
  syncSessionsIterator as runSyncSessionsIterator,
  syncSessionsFromDir as runSyncSessionsFromDir,
  syncSessionsAsyncIterator as runSyncSessionsAsyncIterator,
} from './dbSessionSync.js';

export type {
  CacheStats,
  SyncResult,
  SessionSyncProgress,
  ReplaySyncProgress,
  ReplaySyncResult,
  SessionXmlSyncParser,
  IngestErrorEntry,
  TelemetryMetadataRecord,
};

export class SessionDatabase implements ReplaySyncHost, SessionSyncHost {
  private db: DatabaseType;
  private dbPath: string;
  private replayMetadataRevision = 0;
  private telemetryMetadataRevision = 0;
  private allSessionsCache: DetailedSession[] | null = null;

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

  public getDb(): DatabaseType {
    return this.db;
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  // --- Metadata & Ingest Errors ---

  public getMetadata(key: string): string | null {
    return getMetadata(this.db, key);
  }

  public setMetadata(key: string, value: string): void {
    setMetadata(this.db, key, value);
  }

  public recordIngestError(sourceType: string, sourcePath: string, error: unknown): void {
    recordIngestError(this.db, sourceType, sourcePath, error);
  }

  public clearIngestError(sourceType: string, sourcePath: string): void {
    clearIngestError(this.db, sourceType, sourcePath);
  }

  public getIngestErrors(): IngestErrorEntry[] {
    return getIngestErrors(this.db);
  }

  // --- AI Reports ---

  public getAiReport(cacheKey: string): AiReportRecord | null {
    return getAiReport(this.db, cacheKey);
  }

  public getAiReportsList(limit = 200): AiReportHistoryEntry[] {
    return getAiReportsList(this.db, limit);
  }

  public saveAiReport(record: AiReportRecord): void {
    saveAiReport(this.db, record);
  }

  // --- Replays & Trajectories ---

  public getReplayMetadataCache(filename: string, mtime: number, size: number, filePath?: string): ReplayMetadata | null {
    return getReplayMetadataCache(this.db, filename, mtime, size, filePath);
  }

  /** Returns stored metadata even when LMU has deleted the source .Vcr. */
  public getStoredReplayMetadata(filename: string): ReplayMetadata | null {
    return getStoredReplayMetadata(this.db, filename);
  }

  /** Returns stored file attributes and metadata for a cached replay file. */
  public getStoredReplayFileInfo(filename: string): StoredReplayFileInfo | null {
    return getStoredReplayFileInfo(this.db, filename);
  }

  /** Returns all cached replay metadata and disk properties stored in the database. */
  public getAllStoredReplayFiles(): Array<StoredReplayFileInfo & { filename: string }> {
    return getAllStoredReplayFiles(this.db);
  }

  /** Changes whenever a replay_metadata row does: callers cache what they derive from the rows. */
  public getReplayMetadataRevision(): number {
    return this.replayMetadataRevision;
  }

  public upsertReplayMetadataCache(filename: string, filePath: string, mtime: number, size: number, metadata: ReplayMetadata): void {
    upsertReplayMetadataCache(this.db, filename, filePath, mtime, size, metadata);
    this.replayMetadataRevision++;
  }

  public getReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, filePath?: string): ReplayTrajectoryData | null {
    return getReplayTrajectoryCache(this.db, filename, driverSlot, lapKey, mtime, size, filePath);
  }

  /** Returns a cached trajectory for a replay whose source .Vcr is no longer on disk. */
  public getStoredReplayTrajectory(filename: string, driverSlot: number, lapKey: number, options?: { allowFallback?: boolean }): ReplayTrajectoryData | null {
    return getStoredReplayTrajectory(this.db, filename, driverSlot, lapKey, options);
  }

  /** The stored rows of the laps either side of a lap of the same recording (see dbReplayTrajectoryStore). */
  public getAdjacentLapTrajectories(filename: string, driverSlot: number, lapKey: number): { previous: ReplayTrajectoryData | null; next: ReplayTrajectoryData | null } {
    return getAdjacentLapTrajectories(this.db, filename, driverSlot, lapKey);
  }

  public hasValidReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, filePath?: string): boolean {
    return hasValidReplayTrajectoryCache(this.db, filename, driverSlot, lapKey, mtime, size, filePath);
  }

  public upsertReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, trajectory: ReplayTrajectoryData, filePath?: string): void {
    upsertReplayTrajectoryCache(this.db, filename, driverSlot, lapKey, mtime, size, trajectory, filePath);
  }

  public setReplayTrajectoryDefaults(filename: string, driverSlot: number, defaultLapKey: number | null, resolvedDriverSlot?: number | null): void {
    setTrajectoryDefaults(this.db, filename, driverSlot, defaultLapKey, resolvedDriverSlot);
  }

  public getReplaysCount(): number {
    return getReplaysCount(this.db);
  }

  public getReplayCacheList(): ReplayCacheSummary[] {
    return getReplayCacheList(this.db);
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

  // --- Telemetry Cache ---

  /** Changes whenever a telemetry_metadata row does: callers cache what they derive from the rows. */
  public getTelemetryMetadataRevision(): number {
    return this.telemetryMetadataRevision;
  }

  public upsertTelemetryMetadata(info: DuckDbFileInfo, matchedSessionId?: string, matchedReplayFilename?: string): void {
    const changed = upsertTelemetryMetadata(this.db, info, matchedSessionId, matchedReplayFilename);
    if (changed) {
      this.telemetryMetadataRevision++;
    }
  }

  public getTelemetryFiles(): DuckDbFileInfo[] {
    return getTelemetryFiles(this.db);
  }

  public getTelemetryMetadata(): TelemetryMetadataRecord[] {
    return getTelemetryMetadata(this.db);
  }

  public getTelemetryLapCache(filename: string, lapNumber: number): DuckDbLapTelemetry | null {
    return getTelemetryLapCache(this.db, filename, lapNumber);
  }

  public upsertTelemetryLapCache(filename: string, lapNumber: number, lapData: DuckDbLapTelemetry): void {
    upsertTelemetryLapCache(this.db, filename, lapNumber, lapData);
  }

  public pruneTelemetryLapCache(maxAgeMs = 30 * 24 * 60 * 60 * 1000, maxBytes = 512 * 1024 * 1024): void {
    pruneTelemetryLapCache(this.db, maxAgeMs, maxBytes);
  }

  public clearTelemetryCache(): void {
    clearTelemetryCache(this.db);
    this.telemetryMetadataRevision++;
  }

  // --- Sessions Cache & Sync ---

  public invalidateSessionCache(): void {
    this.allSessionsCache = null;
  }

  public getAllSessions(): DetailedSession[] {
    if (this.allSessionsCache) return this.allSessionsCache;
    const sessions = fetchAllSessions(this.db);
    this.allSessionsCache = sessions;
    return sessions;
  }

  public getAllSessionSummaries(): SessionMetadata[] {
    return fetchAllSessionSummaries(this.db);
  }

  public getSessionById(id: string): DetailedSession | null {
    const cleanId = id.endsWith('.xml') ? id.replace(/\.xml$/, '') : id;
    const withXml = `${cleanId}.xml`;

    if (this.allSessionsCache) {
      const found = this.allSessionsCache.find(s =>
        s.id === id || s.id === cleanId || s.id === withXml || s.filename === id || s.filename === withXml
      );
      if (found) return found;
    }

    return fetchSessionById(this.db, id);
  }

  public upsertSession(session: DetailedSession, filePath: string, mtime: number, size: number): void {
    insertOrUpdateSession(this.db, session, filePath, mtime, size);
    this.allSessionsCache = null;
  }

  public updateSessionMatchingReplay(sessionId: string, matchingReplayFile: NonNullable<SessionMetadata['matchingReplayFile']>): void {
    const result = modifySessionMatchingReplay(this.db, sessionId, matchingReplayFile);
    if (result.updated && this.allSessionsCache) {
      const cached = this.allSessionsCache.find(s => s.id === sessionId);
      if (cached) cached.matchingReplayFile = matchingReplayFile;
    }
  }

  /** Withdraws the session's replay link (see dbReplayLinkStore); the cached session loses it too. */
  public rejectSessionReplayLink(
    sessionId: string,
    link: NonNullable<SessionMetadata['matchingReplayFile']>,
    reason: ReplayLinkRejectionReason
  ): RejectedReplayLink | null {
    const rejected = rejectSessionReplayLink(this.db, sessionId, link, reason);
    const cached = rejected ? this.allSessionsCache?.find(s => s.id === sessionId) : undefined;
    if (cached && rejected) {
      delete cached.matchingReplayFile;
      cached.rejectedReplayLink = rejected;
    }
    return rejected;
  }

  public getRejectedReplayLinks(): Map<string, RejectedReplayLink> {
    return getRejectedReplayLinks(this.db);
  }

  public *syncSessionsIterator(
    resultsDir: string,
    parser: SessionXmlSyncParser,
    forceReparse = false
  ): Generator<SessionSyncProgress, SyncResult, void> {
    return yield* runSyncSessionsIterator(this, resultsDir, parser, forceReparse);
  }

  public syncSessionsFromDir(
    resultsDir: string,
    parser: SessionXmlSyncParser,
    forceReparse = false,
    onProgress?: (progress: SessionSyncProgress) => void
  ): SyncResult {
    return runSyncSessionsFromDir(this, resultsDir, parser, forceReparse, onProgress);
  }

  public syncSessionsAsyncIterator(
    resultsDir: string,
    parser: SessionXmlSyncParser,
    forceReparse = false
  ): AsyncGenerator<SessionSyncProgress, SyncResult, void> {
    return runSyncSessionsAsyncIterator(this, resultsDir, parser, forceReparse);
  }

  public getSessionsCount(): number {
    return fetchSessionsCount(this.db);
  }

  public clearCache(): void {
    this.allSessionsCache = null;
    clearSessionCache(this.db);
  }

  // --- Reference Lap times & Alien Benchmarks ---

  public saveReferenceLaptimes(cache: ReferenceLaptimesCache): void {
    saveReferenceLaptimes(this.db, cache, (key, value) => this.setMetadata(key, value));
  }

  public getReferenceLaptimesCache(): ReferenceLaptimesCache | null {
    return getReferenceLaptimesCache(this.db, (key) => this.getMetadata(key));
  }

  public getReferenceLaptimeEntry(key: string): ReferenceLaptimeEntry | null {
    return getReferenceLaptimeEntry(this.db, key);
  }

  public clearReferenceLaptimes(): void {
    clearReferenceLaptimes(this.db);
  }

  // --- General Cache Diagnostics & Lifecycle ---

  public getCacheStats(): CacheStats {
    const count = this.getSessionsCount();
    const lastSyncedAt = this.getMetadata('last_synced_at');
    const replaysCount = this.getReplaysCount();
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
