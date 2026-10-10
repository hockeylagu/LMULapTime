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
  ReferenceBenchmarkDiff,
  BenchmarkDiffSummary,
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
  REPLAY_CACHE_VERSION,
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
  cacheAllLapsForDriver,
  ReplaySyncHost,
  ReplayAsyncSyncOptions,
} from './replay/dbReplaySync.js';
import {
  deleteReplayDriverLaps,
  getReplayDriverIngest,
  recordReplayDriverIngest,
  ReplayDriverIngest,
  ReplayDriverIngestStatus,
} from './replay/dbReplayIngestStore.js';
import {
  getReplayTrajectoryCache,
  getStoredReplayTrajectory,
  getAdjacentLapTrajectories,
  hasValidReplayTrajectoryCache,
  setTrajectoryDefaults,
  upsertReplayTrajectoryCache,
} from './replay/dbReplayTrajectoryStore.js';
import {
  ReplayLapRow,
  getRacePositions,
  getReplayLapSignature,
  listReplayLapRows,
  saveRacePositions,
} from './replay/dbRacePositionStore.js';
import {
  StoredReplayFileInfo,
  getAllStoredReplayFiles,
  getReplayMetadataCache,
  getStoredReplayFileInfo,
  getStoredReplayMetadata,
  upsertReplayMetadataCache,
  getReplaysCount,
  getReplayCacheList,
} from './replay/dbReplayMetadataStore.js';
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
  RivalScope,
  applyRivalResolution,
  getActiveRival,
  getBeatenRivals,
  pinRival,
} from './dbRivalStore.js';
import type { RivalTarget } from '../../shared/types/leaderboard.js';
import type { NewRivalTarget, RivalResolution } from '../../shared/domain/rivals.js';
import {
  upsertTelemetryMetadata,
  getTelemetryFiles,
  getTelemetryFilesCount,
  getTelemetryMetadata,
  getTelemetryLapCache,
  upsertTelemetryLapCache,
  pruneTelemetryLapCache,
  clearTelemetryCache,
  linkTelemetryFiles,
  clearTelemetryLinks,
  getTelemetryLapCacheFilenames,
  TelemetryMetadataRecord,
  TelemetryLink,
} from './dbTelemetryStore.js';
import {
  saveReferenceLaptimes,
  getReferenceLaptimesCache,
  getReferenceLaptimeEntry,
  clearReferenceLaptimes,
  recordBenchmarkDiff,
  getBenchmarkDiffHistory,
  getBenchmarkDiffById,
  getBenchmarkDiffIdsWithImpactRuleOtherThan,
  updateBenchmarkDiffImpact,
} from './dbReferenceLaptimeStore.js';
import {
  getSessionById as fetchSessionById,
  upsertSession as insertOrUpdateSession,
  updateSessionMatchingReplay as modifySessionMatchingReplay,
  getSessionsCount as fetchSessionsCount,
  getSessionXmlMtime,
  restoreStoredSessionLinks,
  updateSessionTelemetryFile,
  clearSessionCache,
} from './dbSessionStore.js';
import { getRejectedReplayLinks, rejectSessionReplayLink } from './replay/dbReplayLinkStore.js';
import { archiveReplacedRecording } from './replay/dbReplayIdentity.js';
import { getReplayMatchingEntries, getReplayMatchingEntriesOverlapping, getReplayMatchingEntry } from './replay/dbReplayMatchingStore.js';
import {
  getRecordingOwners, getReplayReconciliationCandidateIds, getSessionsByIds, getSessionsStartingBetween, getTelemetryOwnersWithoutFile,
} from './dbReconciliationStore.js';
import type { ReplayMatchTarget } from '../sessions/replayMatching.js';
import { storeDecodedReplayFacts } from './replay/dbReplayLapStore.js';
import { backfillNormalizedSessions, type NormalizedBackfillBatch } from './sessionRows/verify.js';
import { loadSessions } from './sessionRows/access.js';
import { classifySessionConditions, reclassifyStoredSessions } from './dbSessionConditions.js';
import {
  backfillSessionSummaries, countReadySessionSummaries, isSessionSummaryReady, iterateStoredSessions, projectionState,
  readCompactSession, type SessionSummaryBackfillBatch,
} from './sessionSummaries/store.js';
import type { SessionCard, SessionProjectionState } from '../../shared/types/sessionSummaries.js';
import { getDisplayTrackName } from '../../shared/domain/formatters.js';
import {
  listReplayUpgradeBacklog,
  upgradeReplaysAsyncIterator as runUpgradeReplaysAsyncIterator,
  ReplayUpgradeCandidate,
  ReplayUpgradeHost,
  ReplayUpgradeProgress,
  ReplayUpgradeResult,
} from './replay/dbReplayUpgrade.js';
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
  TelemetryLink,
  ReplayUpgradeCandidate,
  ReplayUpgradeProgress,
  ReplayUpgradeResult,
};

export class SessionDatabase implements ReplaySyncHost, SessionSyncHost, ReplayUpgradeHost {
  private db: DatabaseType;
  private dbPath: string;

  private replayMetadataRevision = 0;
  private telemetryMetadataRevision = 0;

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

  // --- Rivals (user state, kept when the cache is cleared) ---

  public getActiveRival(scope: RivalScope): RivalTarget | null {
    return getActiveRival(this.db, scope);
  }

  public getBeatenRivals(scope: RivalScope): RivalTarget[] {
    return getBeatenRivals(this.db, scope);
  }

  public applyRivalResolution(scope: RivalScope, resolution: RivalResolution): number | null {
    return applyRivalResolution(this.db, scope, resolution);
  }

  public pinRival(scope: RivalScope, target: NewRivalTarget): number {
    return pinRival(this.db, scope, target);
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

  public getReplayMatchingEntries(target?: ReplayMatchTarget) { return getReplayMatchingEntries(this.db, target); }
  public getReplayMatchingEntry(filename: string) { return getReplayMatchingEntry(this.db, filename); }

  /**
   * Stores `filename` as the recording described here. When the stored rows under that name hold a
   * different recording, they are renamed first (see dbReplayIdentity), never overwritten.
   */
  public upsertReplayMetadataCache(filename: string, filePath: string, mtime: number, size: number, metadata: ReplayMetadata): void {
    const archivedAs = archiveReplacedRecording(this.db, filename, { mtime, size, metadata });
    if (archivedAs) {
      console.log(`[SQLite Cache] ${filename} now holds another recording; the stored one is kept as ${archivedAs}`);
      this.markSessionDataChanged();
      this.telemetryMetadataRevision++;
    }
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

  /** Which stored laps a replay's race positions index is built from (see dbRacePositionStore). */
  public getReplayLapSignature(filename: string): string | null {
    return getReplayLapSignature(this.db, filename);
  }

  public listReplayLapRows(filename: string): ReplayLapRow[] {
    return listReplayLapRows(this.db, filename);
  }

  public getRacePositions<T>(filename: string, signature: string): T | null {
    return getRacePositions<T>(this.db, filename, signature);
  }

  public saveRacePositions(filename: string, signature: string, positions: unknown): void {
    saveRacePositions(this.db, filename, signature, positions);
  }

  public upsertReplayTrajectoryCache(filename: string, driverSlot: number, lapKey: number, mtime: number, size: number, trajectory: ReplayTrajectoryData, filePath?: string): void {
    upsertReplayTrajectoryCache(this.db, filename, driverSlot, lapKey, mtime, size, trajectory, filePath);
  }

  public setReplayTrajectoryDefaults(filename: string, driverSlot: number, defaultLapKey: number | null, resolvedDriverSlot?: number | null): void {
    setTrajectoryDefaults(this.db, filename, driverSlot, defaultLapKey, resolvedDriverSlot);
  }

  /**
   * Replaces a driver's whole lap set in one transaction: a crash never leaves half a set, and laps
   * the new decode no longer has do not linger. The player's decode (isPrimary) also points the
   * "no driver requested" alias (-1) at its slot.
   */
  public replaceReplayDriverLaps(
    filename: string,
    filePath: string,
    mtime: number,
    size: number,
    driverSlotKey: number,
    trajectory: ReplayTrajectoryData,
    isPrimary: boolean
  ): void {
    this.db.transaction(() => {
      deleteReplayDriverLaps(this.db, filename, driverSlotKey);
      cacheAllLapsForDriver(this, filename, filePath, mtime, size, driverSlotKey, trajectory);
      // New replay conditions reach the laps of the sessions linked to the replay.
      if (storeDecodedReplayFacts(this.db, filename, driverSlotKey, trajectory, REPLAY_CACHE_VERSION)) {
        this.reclassifyStoredSessions({ replayName: filename });
      }
      recordReplayDriverIngest(this.db, filename, driverSlotKey, mtime, size, 'stored');
      if (isPrimary) {
        // Rows stored under the alias itself (from a decode that could not name the slot) are superseded.
        if (driverSlotKey !== -1) deleteReplayDriverLaps(this.db, filename, -1);
        this.setReplayTrajectoryDefaults(filename, -1, trajectory.currentLap ?? null, driverSlotKey);
        if (driverSlotKey !== -1) recordReplayDriverIngest(this.db, filename, -1, mtime, size, 'stored');
      }
    })();
  }

  public getReplayDriverIngest(filename: string, driverSlot: number): ReplayDriverIngest | null {
    return getReplayDriverIngest(this.db, filename, driverSlot);
  }

  public recordReplayDriverIngest(filename: string, driverSlot: number, mtime: number, size: number, status: ReplayDriverIngestStatus, error?: string | null): void {
    recordReplayDriverIngest(this.db, filename, driverSlot, mtime, size, status, error);
  }

  /** On-disk replays whose stored rows are behind the current parser version (see dbReplayUpgrade). */
  public listReplayUpgradeBacklog(replaysDir: string): ReplayUpgradeCandidate[] {
    return listReplayUpgradeBacklog(this.db, replaysDir);
  }

  public upgradeReplaysAsyncIterator(
    replaysDir: string,
    options: { playerName?: string; shouldStop?: () => boolean } = {}
  ): AsyncGenerator<ReplayUpgradeProgress, ReplayUpgradeResult, void> {
    return runUpgradeReplaysAsyncIterator(this, replaysDir, options);
  }

  public getReplaysCount(): number {
    return getReplaysCount(this.db);
  }

  public getReplayCacheList(replaysDir?: string): ReplayCacheSummary[] {
    return getReplayCacheList(this.db, replaysDir);
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
    options: ReplayAsyncSyncOptions = {}
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

  public getTelemetryFilesCount(): number { return getTelemetryFilesCount(this.db); }

  public getSessionXmlMtime(sessionId: string, filePath: string): number | undefined {
    return getSessionXmlMtime(this.db, sessionId, filePath);
  }

  public getTelemetryMetadata(sessionId?: string): TelemetryMetadataRecord[] {
    return getTelemetryMetadata(this.db, sessionId);
  }

  public getTelemetryLapCache(filename: string, lapNumber: number, options: { anyVersion?: boolean } = {}): DuckDbLapTelemetry | null {
    return getTelemetryLapCache(this.db, filename, lapNumber, options.anyVersion);
  }

  public upsertTelemetryLapCache(filename: string, lapNumber: number, lapData: DuckDbLapTelemetry): void {
    upsertTelemetryLapCache(this.db, filename, lapNumber, lapData);
  }

  public pruneTelemetryLapCache(onDiskFilenames: ReadonlySet<string>, maxAgeMs = 30 * 24 * 60 * 60 * 1000, maxBytes = 512 * 1024 * 1024): void {
    pruneTelemetryLapCache(this.db, onDiskFilenames, maxAgeMs, maxBytes);
  }

  public linkTelemetryFiles(links: readonly TelemetryLink[]): void {
    if (links.length > 0 && linkTelemetryFiles(this.db, links) > 0) this.telemetryMetadataRevision++;
  }

  /**
   * Clears every stored telemetry match once per matching rule, so the matches stored under an
   * earlier rule are decided again. Returns whether it cleared them.
   */
  public resetTelemetryLinksForRule(rule: string): boolean {
    if (getMetadata(this.db, 'telemetry_link_rule') === rule) return false;
    this.db.transaction(() => {
      clearTelemetryLinks(this.db);
      setMetadata(this.db, 'telemetry_link_rule', rule);
    })();
    this.telemetryMetadataRevision++;
    return true;
  }

  public getTelemetryLapCacheFilenames(sessionId?: string): Set<string> {
    return getTelemetryLapCacheFilenames(this.db, sessionId);
  }

  public clearTelemetryCache(): void {
    clearTelemetryCache(this.db);
    this.telemetryMetadataRevision++;
  }

  // --- Sessions Cache & Sync ---

  public getSessionRevision(): number { return Number(this.getMetadata('session_data_revision') ?? 0); }

  public markSessionDataChanged(): void {
    this.db.prepare("INSERT INTO cache_metadata(key,value) VALUES('session_data_revision','1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)").run();
  }

  public getCompactSession(id: string): SessionCard | null { return readCompactSession(this.db, id); }


  public getSessionProjectionState(id: string): SessionProjectionState | null { return projectionState(this.db, id); }

  public backfillSessionSummaryBatch(batchSize = 10): SessionSummaryBackfillBatch { return backfillSessionSummaries(this.db, batchSize); }

  /** Writes and verifies the normalized rows of the next sessions that lack them, from their stored JSON. */
  public backfillNormalizedSessionBatch(batchSize = 10): NormalizedBackfillBatch { return backfillNormalizedSessions(this.db, batchSize); }

  /** Whether history reads can be served: no session waits for its summaries. */
  public isSessionSummaryReady(): boolean { return isSessionSummaryReady(this.db); }

  public *iterateDetailedSessions(batchSize = 10): Generator<DetailedSession> { yield* iterateStoredSessions(this.db, batchSize); }

  // --- Ingestion reconciliation (see dbReconciliationStore) ---

  public getReplayReconciliationCandidateIds(sinceMs: number): string[] { return getReplayReconciliationCandidateIds(this.db, sinceMs); }
  public getSessionsByIds(ids: readonly string[]): DetailedSession[] { return getSessionsByIds(this.db, ids); }
  public getSessionsStartingBetween(fromMs: number, toMs: number): DetailedSession[] { return getSessionsStartingBetween(this.db, fromMs, toMs); }
  public getReplayMatchingEntriesOverlapping(fromMs: number, toMs: number) { return getReplayMatchingEntriesOverlapping(this.db, fromMs, toMs); }
  public getRecordingOwners(names: readonly string[]): Map<string, string> { return getRecordingOwners(this.db, names); }
  public getTelemetryOwnersWithoutFile(): string[] { return getTelemetryOwnersWithoutFile(this.db); }

  /** Stores the session's main DuckDB file on its row and card (see dbSessionStore). */
  public updateSessionTelemetryFile(sessionId: string, duckdbFilename: string | undefined): boolean {
    return updateSessionTelemetryFile(this.db, sessionId, duckdbFilename);
  }

  public getSessionById(id: string): DetailedSession | null {
    return fetchSessionById(this.db, id);
  }

  public getSessionsLinkedToRecording(recordingName: string): DetailedSession[] {
    const rows = this.db.prepare('SELECT id FROM sessions WHERE recording_name = ?').all(recordingName) as Array<{ id: string }>;
    return loadSessions(this.db, rows.map(row => row.id));
  }

  public getStoredRecordingNames(): Set<string> {
    const rows = this.db.prepare('SELECT DISTINCT recording_name FROM sessions WHERE recording_name IS NOT NULL').all() as Array<{ recording_name: string }>;
    return new Set(rows.map(row => row.recording_name));
  }

  public getSessionCatalogStats(): { sessionsCount: number; tracksCount: number; summariesReadyCount: number } {
    const sessionsCount = this.getSessionsCount();
    const rows = this.db.prepare('SELECT DISTINCT track_venue, track_course FROM sessions').all() as Array<{ track_venue: string; track_course: string }>;
    const summariesReadyCount = countReadySessionSummaries(this.db);
    return { sessionsCount, tracksCount: new Set(rows.map(row => getDisplayTrackName(row.track_venue, row.track_course)).filter(Boolean)).size, summariesReadyCount };
  }

  public upsertSession(session: DetailedSession, filePath: string, mtime: number, size: number): void {
    insertOrUpdateSession(this.db, session, filePath, mtime, size);
  }

  /** Links a replay to the session, whose laps then get that replay's conditions. */
  public updateSessionMatchingReplay(sessionId: string, matchingReplayFile: NonNullable<SessionMetadata['matchingReplayFile']>): void {
    this.db.transaction(() => {
      const result = modifySessionMatchingReplay(this.db, sessionId, matchingReplayFile);
      if (result.updated) this.reclassifyStoredSessions({ ids: [sessionId] });
    })();
  }

  /** Withdraws the session's replay link (see dbReplayLinkStore); its laps lose that replay's conditions. */
  public rejectSessionReplayLink(
    sessionId: string,
    link: NonNullable<SessionMetadata['matchingReplayFile']>,
    reason: ReplayLinkRejectionReason
  ): RejectedReplayLink | null {
    return this.db.transaction(() => {
      const rejected = rejectSessionReplayLink(this.db, sessionId, link, reason);
      if (rejected) this.reclassifyStoredSessions({ ids: [sessionId] });
      return rejected;
    })();
  }

  /** Carries a reparsed session's stored replay link and DuckDB attachment over (see dbSessionStore). */
  public restoreStoredSessionLinks(session: DetailedSession): void {
    restoreStoredSessionLinks(this.db, session);
  }

  /** Classifies a parsed session's laps with its linked replay's rain, before it is stored. */
  public classifySessionConditions(session: DetailedSession): void {
    classifySessionConditions(this.db, session);
  }

  /**
   * Classifies stored sessions again and atomically refreshes their persisted summaries.
   */
  public reclassifyStoredSessions(which: { ids: string[] } | { replayName: string }): void {
    reclassifyStoredSessions(this.db, which);
  }

  public getRejectedReplayLinks(sessionIds?: readonly string[]): Map<string, RejectedReplayLink[]> {
    return getRejectedReplayLinks(this.db, sessionIds);
  }

  public *syncSessionsIterator(
    resultsDir: string,
    parser: SessionXmlSyncParser,
    forceReparse = false
  ): Generator<SessionSyncProgress, SyncResult, DetailedSession | null | undefined> {
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
    this.markSessionDataChanged();
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

  public getBenchmarkDiffHistory(limit: number = 30): BenchmarkDiffSummary[] {
    return getBenchmarkDiffHistory(this.db, limit);
  }

  public getBenchmarkDiffById(id: number): ReferenceBenchmarkDiff | null {
    return getBenchmarkDiffById(this.db, id);
  }

  public getBenchmarkDiffIdsWithImpactRuleOtherThan(rule: number): number[] {
    return getBenchmarkDiffIdsWithImpactRuleOtherThan(this.db, rule);
  }

  public updateBenchmarkDiffImpact(id: number, diff: ReferenceBenchmarkDiff): void {
    updateBenchmarkDiffImpact(this.db, id, diff);
  }

  public recordBenchmarkDiff(diff: ReferenceBenchmarkDiff, sourceUrl?: string): number {
    return recordBenchmarkDiff(this.db, diff, sourceUrl);
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
