import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { FileIngestWorker } from './ingest/fileIngestWorkerClient.js';
import type { ReplayIngestJob } from './types.js';
import path from 'path';
import { LmuParser } from '../sessions/parser.js';
import type { ReplayFileEntry } from '../sessions/sessionXmlTypes.js';

import { SessionReplayLinks } from '../sessions/sessionReplayLinks.js';
import { DetailedSession, ReferenceBenchmarkDiff, ReferenceLaptimeRefreshStatus, ReplayScanStatus, ScanStatus, SessionScanStatus, TelemetryScanStatus } from './types.js';

import { SessionDatabase } from './db.js';
import {
  decideTelemetryLinks, TELEMETRY_LINK_RULE, TelemetryLinks, telemetryCandidateWindow, telemetryFileChunks, type TelemetryLinkInput,
} from '../telemetry/telemetryLinks.js';
import type { TelemetryLink } from './dbTelemetryStore.js';
import { TelemetryCatalog } from '../telemetry/telemetryCatalog.js';
import { ReplayRecordingService } from '../replay/replayRecordingService.js';
import { ReplayUpgradeRunner } from '../replay/replayUpgradeRunner.js';
import { pumpScanInBackground, startedScanStatus } from './backgroundScan.js';
import { replaceCachedLastUpdateDiff } from '../benchmarks/referenceLaptimes.js';
import { BENCHMARK_IMPACT_RULE, enrichBenchmarkDiffWithCompactImpact } from '../benchmarks/benchmarkImpact.js';

/** When the replay links were last reconciled (cache_metadata): later changes are the next candidates. */
const REPLAY_LINKS_RECONCILED_AT = 'replay_links_reconciled_at';

const yieldToEventLoop = () => new Promise<void>(resolve => setImmediate(resolve));

export interface ServerContextOptions {
  resultsDir: string;
  replaysDir: string;
  telemetryDir: string;
  parser: LmuParser;
  sessionDb: SessionDatabase;
  telemetryCatalog: TelemetryCatalog;
  replayRecordings: ReplayRecordingService;
}

export class ServerContext {
  private currentResultsDir: string;
  private currentReplaysDir: string;
  private currentTelemetryDir: string;
  private parser: LmuParser;
  private readonly replayJobs = new Map<string, ReplayIngestJob>();
  private pendingSessionRefresh = false;
  private pendingForcedSessionReparse = false;
  private pendingPostSessionDiscovery = false;
  // A replay sync asked for while the replay links were being reconciled.
  private pendingReplaySync = false;
  private sessionReplayReconciliationRunning = false;
  private telemetryOwnershipReconciliationRunning = false;
  private sessionReplayReconciliation: Promise<void> | null = null;
  private telemetryOwnershipReconciliation: Promise<void> | null = null;
  private projectionBackfillStarted = false;
  private normalizedBackfillStarted = false;
  private sessionProjectionBackfill = { running: false, processed: 0, total: 0, failed: 0, currentSessionId: null as string | null, startedAt: null as string | null, finishedAt: null as string | null, error: null as string | null };
  // A manual refresh asked the next replay sync to try again the replays that failed MAX_DECODE_ATTEMPTS times.
  private retryFailedReplays = false;
  private readonly instanceId = randomUUID();

  private replayUpgradeRunner: ReplayUpgradeRunner | null = null;
  private readonly replayLinks: SessionReplayLinks;
  private replayScanStatus: ReplayScanStatus = {
    running: false,
    processed: 0,
    total: 0,
    currentFile: null,
    currentStage: null,
    filePercent: null,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
  };
  private sessionScanStatus: SessionScanStatus = {
    running: false,
    currentStage: null,
    filePercent: null,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
  };
  private referenceLaptimeRefreshStatus: ReferenceLaptimeRefreshStatus = {
    started: false,
    running: false,
    checked: false,
    completedAt: null,
    refreshed: false,
    updatedCount: 0,
    diff: null,
    error: null,
  };

  public constructor(private readonly options: ServerContextOptions) {
    this.currentResultsDir = options.resultsDir;
    this.currentReplaysDir = options.replaysDir;
    this.currentTelemetryDir = options.telemetryDir;
    this.parser = options.parser;
    this.replayLinks = new SessionReplayLinks(options.sessionDb);
    this.configureReplayLookup();
  }

  public get sessionDb(): SessionDatabase { return this.options.sessionDb; }
  public get telemetryCatalog(): TelemetryCatalog { return this.options.telemetryCatalog; }
  public get replayRecordings(): ReplayRecordingService { return this.options.replayRecordings; }
  public get resultsDir(): string { return this.currentResultsDir; }
  public get replaysDir(): string { return this.currentReplaysDir; }
  public get telemetryDir(): string { return this.currentTelemetryDir; }
  public get currentParser(): LmuParser { return this.parser; }

  /** Null when the database cannot run the upgrade (test doubles). */
  public get replayUpgrade(): ReplayUpgradeRunner | null {
    if (!this.replayUpgradeRunner && typeof this.sessionDb.upgradeReplaysAsyncIterator === 'function') {
      this.replayUpgradeRunner = new ReplayUpgradeRunner(this.sessionDb);
    }
    return this.replayUpgradeRunner;
  }

  // The upgrade is the lowest-priority work: it runs only once no scan is running.
  public startReplayUpgradeWhenIdle(): boolean {
    if (this.hasActiveFileScan() || this.pendingSessionRefresh) return false;
    return this.replayUpgrade?.start(this.currentReplaysDir, this.parser.configuredPlayerName) ?? false;
  }

  public configureDirectories(values: { resultsDir?: unknown; replaysDir?: unknown; telemetryDir?: unknown; playerName?: unknown }): boolean {
    if (this.hasActiveFileScan()) return false;
    this.replayUpgrade?.stop();

    if (typeof values.resultsDir === 'string' && fs.existsSync(values.resultsDir)) this.currentResultsDir = values.resultsDir;
    if (typeof values.replaysDir === 'string' && fs.existsSync(values.replaysDir)) this.currentReplaysDir = values.replaysDir;
    if (typeof values.telemetryDir === 'string' && fs.existsSync(values.telemetryDir)) {
      const telemetryDirectoryChanged = path.normalize(values.telemetryDir).toLowerCase() !== path.normalize(this.currentTelemetryDir).toLowerCase();
      if (telemetryDirectoryChanged && typeof this.sessionDb.clearTelemetryCache === 'function') {
        this.sessionDb.clearTelemetryCache();
      }
      if (telemetryDirectoryChanged && typeof this.telemetryCatalog?.clear === 'function') {
        this.telemetryCatalog.clear();
      }
      this.currentTelemetryDir = values.telemetryDir;
      this.sessionDb.setMetadata('telemetry_dir', this.currentTelemetryDir);
    }

    this.parser = new LmuParser(this.currentReplaysDir, this.currentResultsDir, { indexReplays: false, readReplayMetadata: false });
    if (typeof values.playerName === 'string' && values.playerName.trim()) {
      this.parser.configuredPlayerName = values.playerName.trim();
    }
    this.configureReplayLookup();
    return true;
  }

  public hasActiveFileScan(): boolean {
    const telemetryRunning = typeof this.telemetryCatalog?.getScanStatus === 'function'
      ? this.telemetryCatalog.getScanStatus().running
      : false;
    return this.sessionScanStatus.running || this.replayScanStatus.running || telemetryRunning ||
      this.sessionReplayReconciliationRunning || this.telemetryOwnershipReconciliationRunning;
  }

  private configureReplayLookup(): void {
    if (typeof this.sessionDb.getReplayMatchingEntries === 'function') {
      this.parser.setReplayLookup(target => this.sessionDb.getReplayMatchingEntries(target));
    }
  }

  public get serverInstanceId(): string { return this.instanceId; }

  private replayByName() {
    return { get: (name: string) => typeof this.sessionDb.getReplayMatchingEntry === 'function'
      ? this.sessionDb.getReplayMatchingEntry(name) : this.parser.getReplaysList().find(replay => replay.name === name) };
  }

  /**
   * Links the replays and decides the DuckDB owners of `sessions`, then stores each one's main
   * file on its row (applySessionTelemetry), so reads never consult the telemetry catalog.
   */
  public enrichSessionsWithTelemetry(sessions: DetailedSession[]): void {
    try {
      this.configureReplayLookup();
      this.replayLinks.linkSessions(sessions, this.parser, this.replayByName());
      this.resetTelemetryLinksIfRuleChanged();
      const catalog = { files: this.sessionDb.getTelemetryFiles(), stored: this.sessionDb.getTelemetryMetadata() };
      this.storeNewTelemetryLinks(sessions, this.sessionDb.getReplayMatchingEntries?.() ?? this.parser.getReplaysList(), catalog);
      for (const session of sessions) this.applySessionTelemetry(session);
    } catch (error) {
      console.warn('[Telemetry Matcher] Error enriching sessions with DuckDB telemetry:', error);
    }
  }

  /** Sets the session's main DuckDB file from the stored ownership, and stores it when it changed. */
  private applySessionTelemetry(session: DetailedSession): void {
    const filename = TelemetryLinks.load(this.sessionDb, session.id).forSession(session);
    session.hasDuckDbTelemetry = Boolean(filename);
    if (filename) session.duckdbFilename = filename;
    else delete session.duckdbFilename;
    const replayLink = session.matchingReplayFile;
    if (replayLink) {
      replayLink.hasDuckDbTelemetry = Boolean(filename);
      if (filename) replayLink.duckdbFilename = filename;
      else delete replayLink.duckdbFilename;
    }
    if (typeof this.sessionDb.updateSessionTelemetryFile === 'function') this.sessionDb.updateSessionTelemetryFile(session.id, filename);
  }

  private resetTelemetryLinksIfRuleChanged(): void {
    if (this.sessionDb.resetTelemetryLinksForRule(TELEMETRY_LINK_RULE)) {
      console.log('[Telemetry Matcher] Stored telemetry matches cleared to be decided again: each file goes to the session it was recorded in');
    }
  }

  /**
   * Decides the DuckDB matches of `catalog.files` that have none yet and stores them. Matches are
   * decided once: a stored match is only read afterwards. `catalog.stored` is updated in place so
   * later decisions in the same run see the ownership just committed.
   */
  private storeNewTelemetryLinks(sessions: DetailedSession[], replays: ReplayFileEntry[],
    catalog: Pick<TelemetryLinkInput, 'files' | 'stored'>, replayOwnerByName?: ReadonlyMap<string, string>): TelemetryLink[] {
    const links = decideTelemetryLinks({
      sessionEndMs: session => this.replayLinks.xmlMtime(session),
      ...catalog,
      sessions,
      replays,
      replayOwnerByName,
      loadReplayMetadata: replayName => this.sessionDb.getStoredReplayMetadata(replayName),
    });
    this.sessionDb.linkTelemetryFiles(links);
    const storedByName = new Map(catalog.stored.map(row => [row.filename, row] as const));
    for (const link of links) {
      const row = storedByName.get(link.filename);
      if (row) { row.matchedSessionId = link.sessionId; row.matchedReplayFilename = link.replayName; }
    }
    return links;
  }

  public requestSessionRefresh(forceReparse = false): void {
    const started = this.runSessionSyncInBackground(forceReparse);
    if (!started) {
      this.pendingSessionRefresh = true;
      this.pendingForcedSessionReparse ||= forceReparse;
    }
  }

  private startSessionProjectionBackfill(): void {
    if (this.projectionBackfillStarted || typeof this.sessionDb.backfillSessionSummaryBatch !== 'function' || typeof this.sessionDb.getSessionsCount !== 'function') return;
    this.projectionBackfillStarted = true;
    const status = this.sessionProjectionBackfill;
    status.running = true;
    status.startedAt = new Date().toISOString();
    status.total = this.sessionDb.getSessionsCount();
    const finish = (error?: unknown) => {
      status.running = false;
      status.currentSessionId = null;
      status.finishedAt = new Date().toISOString();
      if (error !== undefined) status.error = error instanceof Error ? error.message : String(error);
      if (this.pendingPostSessionDiscovery) {
        this.pendingPostSessionDiscovery = false;
        this.runReplaySyncInBackground();
        this.runTelemetryScanInBackground();
      }
    };
    const runBatch = () => {
      try {
        const batch = this.sessionDb.backfillSessionSummaryBatch(10);
        status.processed += batch.processed;
        status.failed += batch.failed.length;
        // A session that cannot be summarized is left out of history views (projection_error), not retried here.
        for (const failure of batch.failed) console.warn(`[Session Summaries] ${failure.id} left out of history views:`, failure.error);
        if (batch.processed === 10) {
          setImmediate(runBatch);
          return;
        }
        finish();
        this.startNormalizedSessionBackfill();
      } catch (error: unknown) {
        finish(error);
      }
    };
    setImmediate(runBatch);
  }

  /**
   * Writes the normalized rows of stored sessions (NORMALIZED_SESSION_VERSION), ten at a time with the
   * event loop free in between. JSON stays the source of truth: a session whose rows do not read back
   * as it keeps its JSON and is reported here. Nothing waits for this step.
   */
  private startNormalizedSessionBackfill(): void {
    if (this.normalizedBackfillStarted || typeof this.sessionDb.backfillNormalizedSessionBatch !== 'function') return;
    this.normalizedBackfillStarted = true;
    const runBatch = () => {
      try {
        const batch = this.sessionDb.backfillNormalizedSessionBatch(10);
        for (const failure of batch.failed) console.warn(`[Normalized Sessions] ${failure.id} stays on JSON:`, failure.error ?? failure.mismatches.slice(0, 3));
        if (batch.processed > 0) setImmediate(runBatch);
      } catch (error: unknown) {
        console.warn('[Normalized Sessions] Backfill stopped:', error);
      }
    };
    setImmediate(runBatch);
  }

  /**
   * Links and re-checks the replay links of the sessions a scan could have changed: rows written
   * and replays stored since the last reconciliation (dbReconciliationStore), ten at a time. The
   * first run after an upgrade or a cache clear has no stamp and checks every session once.
   */
  public reconcileSessionReplayLinks(): Promise<void> {
    if (typeof this.sessionDb.getReplayReconciliationCandidateIds !== 'function') return Promise.resolve();
    if (this.sessionReplayReconciliation) return this.sessionReplayReconciliation;
    this.sessionReplayReconciliationRunning = true;
    const task = (async () => {
      const startedAt = Date.now();
      const since = Number(this.sessionDb.getMetadata(REPLAY_LINKS_RECONCILED_AT) ?? 0);
      this.configureReplayLookup();
      const replaysByName = this.replayByName();
      const ids = this.sessionDb.getReplayReconciliationCandidateIds(since);
      for (let i = 0; i < ids.length; i += 10) {
        this.replayLinks.linkSessions(this.sessionDb.getSessionsByIds(ids.slice(i, i + 10)), this.parser, replaysByName);
        await yieldToEventLoop();
      }
      // Rows written during this run carry a later stamp and are checked again next time.
      this.sessionDb.setMetadata(REPLAY_LINKS_RECONCILED_AT, String(startedAt));
    })().finally(() => {
      this.sessionReplayReconciliationRunning = false;
      this.sessionReplayReconciliation = null;
      if (this.pendingReplaySync) {
        this.pendingReplaySync = false;
        this.runReplaySyncInBackground();
      }
    });
    this.sessionReplayReconciliation = task;
    return task;
  }

  public runReplaySyncInBackground(): boolean {
    if (this.replayScanStatus.running) return false;
    if (this.sessionReplayReconciliationRunning) {
      // Runs when the reconciliation ends: a session scan finishing meanwhile must not lose it.
      this.pendingReplaySync = true;
      return false;
    }
    const retryFailed = this.retryFailedReplays;
    this.retryFailedReplays = false;
    this.replayUpgrade?.stop();
    this.replayScanStatus = startedScanStatus();
    const replaysDir = this.currentReplaysDir;
    this.replayJobs.clear();
    const iterator = this.sessionDb.syncReplaysAsyncIterator(replaysDir, {
      playerName: this.parser.configuredPlayerName,
      retryFailed,
      onMetadataReady: async () => {
        await this.reconcileSessionReplayLinks();
        return typeof this.sessionDb.getStoredRecordingNames === 'function' ? this.sessionDb.getStoredRecordingNames() : new Set<string>();
      },
      onReplayState: job => { this.replayJobs.set(job.name, job); },
    });
    pumpScanInBackground(iterator, this.replayScanStatus, outcome => {
      void (async () => {
        if ('result' in outcome) {
          const { total, added, updated, skipped } = outcome.result;
          console.log(`[SQLite Cache] Cached ${total} replays (${added} new, ${updated} updated, ${skipped} skipped) from ${replaysDir}`);
          try {
            await this.reconcileSessionReplayLinks();
          } catch (err) {
            console.warn('[ServerContext] Error enriching sessions after replay sync:', err);
          }
        } else {
          console.warn('[SQLite Cache] Replay sync warning:', outcome.error);
        }
        this.runPendingSessionRefresh();
        this.startReplayUpgradeWhenIdle();
      })();
    });
    return true;
  }

  private runPendingSessionRefresh(): boolean {
    if (!this.pendingSessionRefresh) return false;
    const forceReparse = this.pendingForcedSessionReparse;
    this.pendingSessionRefresh = false;
    this.pendingForcedSessionReparse = false;
    if (this.hasActiveFileScan()) {
      this.pendingSessionRefresh = true;
      this.pendingForcedSessionReparse = forceReparse;
      return false;
    }
    if (this.runSessionSyncInBackground(forceReparse)) return true;
    this.pendingSessionRefresh = true;
    this.pendingForcedSessionReparse = forceReparse;
    return false;
  }

  /**
   * `retryFailedReplays` (a manual refresh) makes the replay sync that follows decode again the replays
   * that failed MAX_DECODE_ATTEMPTS times; a server start leaves them alone. The request is kept when a
   * scan is already running, for the replay sync that follows it.
   */
  public runSessionSyncInBackground(forceReparse = false, retryFailedReplays = false): boolean {
    if (retryFailedReplays) this.retryFailedReplays = true;
    if (this.hasActiveFileScan()) return false;
    this.replayUpgrade?.stop();
    const status: SessionScanStatus = startedScanStatus();
    this.sessionScanStatus = status;
    const resultsDir = this.currentResultsDir;
    const parser = this.parser;
    const worker = new FileIngestWorker();
    const iterator = this.sessionDb.syncSessionsAsyncIterator(resultsDir, {
      setReplayLookup: lookup => parser.setReplayLookup(lookup),
      parseSessionXml: filePath => parser.parseSessionXml(filePath),
      parseSessionXmlAsync: filePath => worker.parseXml(filePath, parser.configuredPlayerName, [], this.sessionDb.getReferenceLaptimesCache?.() ?? null),
    }, forceReparse);
    pumpScanInBackground(iterator, status, outcome => {
      void worker.close();
      if ('result' in outcome) {
        const { total, added, updated } = outcome.result;
        console.log(`[SQLite Cache] Loaded ${total} sessions (${added} new, ${updated} updated) from ${resultsDir}`);
      } else {
        console.warn('[SQLite Cache] Initial sync warning:', outcome.error);
      }
      // Replays are matched against the sessions: their sync always follows.
      if (!this.runPendingSessionRefresh()) {
        if (this.sessionProjectionBackfill.running) this.pendingPostSessionDiscovery = true;
        else { this.runReplaySyncInBackground(); this.runTelemetryScanInBackground(); }
      }
    });
    return true;
  }

  /**
   * Scans the DuckDB folder for new and changed files (at start, on Refresh, after a folder change),
   * then matches them to the sessions. A scan already running on the folder is joined.
   */
  public runTelemetryScanInBackground(): void {
    if (typeof this.telemetryCatalog?.refresh !== 'function') return;
    const telemetryDir = this.currentTelemetryDir;
    void this.telemetryCatalog.refresh(telemetryDir).then(async (count) => {
      console.log(`[SQLite Cache] Found ${count} DuckDB telemetry files from ${telemetryDir}`);
      await this.reconcileTelemetryOwnership();
    }).catch((error: unknown) => {
      // The catalog records the failure as an ingest error.
      console.warn('[SQLite Cache] Telemetry scan warning:', error);
    }).finally(() => {
      this.runPendingSessionRefresh();
      this.startReplayUpgradeWhenIdle();
    });
  }

  public runInitialSessionSyncInBackground(): void {
    this.startSessionProjectionBackfill();
    this.runSessionSyncInBackground();
  }

  public runReferenceLaptimeRefreshInBackground(
    refresh: () => Promise<{ refreshed: boolean; diff: ReferenceBenchmarkDiff | null }>
  ): void {
    if (this.referenceLaptimeRefreshStatus.started) return;
    this.referenceLaptimeRefreshStatus = {
      started: true,
      running: true,
      checked: false,
      completedAt: null,
      refreshed: false,
      updatedCount: 0,
      diff: null,
      error: null,
    };

    setImmediate(() => {
      void refresh()
        .then((result) => {
          this.referenceLaptimeRefreshStatus.refreshed = result.refreshed;
          this.referenceLaptimeRefreshStatus.diff = result.diff;
          this.referenceLaptimeRefreshStatus.updatedCount = result.diff?.updatedCount || 0;
        })
        .catch((error: unknown) => {
          this.referenceLaptimeRefreshStatus.error = error instanceof Error ? error.message : String(error);
          console.warn('[Reference Laptimes] Startup refresh warning:', error);
        })
        .finally(() => {
          // Before completion is published, so the clients' refetch sees the new ratings.
          this.refreshBenchmarkDiffImpacts();
          this.referenceLaptimeRefreshStatus.running = false;
          this.referenceLaptimeRefreshStatus.checked = true;
          this.referenceLaptimeRefreshStatus.completedAt = new Date().toISOString();
        });
    });
  }

  /**
   * Decides the owners of DuckDB files that have none, from the sessions and replays recorded
   * around each file (indexed time windows), never from the whole history. Files are taken in
   * time order, in small chunks loaded with every candidate their files could belong to; then the
   * sessions that gained files store their main file. A file without a recording time has no
   * window and stays unattached.
   */
  private reconcileTelemetryOwnership(): Promise<void> {
    if (this.telemetryOwnershipReconciliation) return this.telemetryOwnershipReconciliation;
    this.telemetryOwnershipReconciliationRunning = true;
    const task = (async () => {
      this.resetTelemetryLinksIfRuleChanged();
      const catalog = { files: this.sessionDb.getTelemetryFiles(), stored: this.sessionDb.getTelemetryMetadata() };
      const claimed = new Set(catalog.stored.filter(row => row.matchedSessionId || row.matchedReplayFilename).map(row => row.filename));
      const pending = catalog.files.filter(file => !claimed.has(file.filename) && file.timestampEpochMs > 0)
        .sort((a, b) => a.timestampEpochMs - b.timestampEpochMs);
      const owners = new Set<string>();
      for (const chunk of telemetryFileChunks(pending)) {
        const window = telemetryCandidateWindow(chunk[0].timestampEpochMs, chunk[chunk.length - 1].timestampEpochMs);
        const sessions = this.sessionDb.getSessionsStartingBetween(window.sessionsFromMs, window.sessionsToMs);
        const replays = this.sessionDb.getReplayMatchingEntriesOverlapping(window.replaysFromMs, window.replaysToMs);
        const links = this.storeNewTelemetryLinks(sessions, replays, { files: chunk, stored: catalog.stored },
          this.sessionDb.getRecordingOwners(replays.map(replay => replay.name)));
        for (const link of links) if (link.sessionId) owners.add(link.sessionId);
        await yieldToEventLoop();
      }
      // Rows stored before the attachment was persisted on them.
      for (const id of this.sessionDb.getTelemetryOwnersWithoutFile()) owners.add(id);
      for (const session of this.sessionDb.getSessionsByIds([...owners])) this.applySessionTelemetry(session);
    })().finally(() => {
      this.telemetryOwnershipReconciliationRunning = false;
      this.telemetryOwnershipReconciliation = null;
    });
    this.telemetryOwnershipReconciliation = task;
    return task;
  }

  /**
   * Recomputes the effect on your laps of stored benchmark updates counted with an older rule
   * (BENCHMARK_IMPACT_RULE), in the history row, its metadata copy and the in-memory latest update.
   */
  public refreshBenchmarkDiffImpacts(): void {
    if (typeof this.sessionDb.getBenchmarkDiffIdsWithImpactRuleOtherThan !== 'function') return;
    try {
      const ids = this.sessionDb.getBenchmarkDiffIdsWithImpactRuleOtherThan(BENCHMARK_IMPACT_RULE);
      if (ids.length === 0) return;
      for (const id of ids) {
        const diff = this.sessionDb.getBenchmarkDiffById(id);
        if (!diff) continue;
        if (typeof this.sessionDb.getDb !== 'function') continue;
        const enriched = { ...enrichBenchmarkDiffWithCompactImpact(diff, this.sessionDb.getDb()), id };
        this.sessionDb.updateBenchmarkDiffImpact(id, enriched);
        replaceCachedLastUpdateDiff(enriched);
      }
    } catch (error: unknown) {
      console.warn('[Benchmark Impact] Unable to recompute stored update impacts:', error);
    }
  }

  public getReplayScanStatus(): ReplayScanStatus { return this.replayScanStatus; }

  public getScanStatus(): ScanStatus {
    const defaultTelemetryScan: TelemetryScanStatus = {
      running: false,
      processed: 0,
      total: 0,
      currentFile: null,
      startedAt: null,
      finishedAt: null,
      result: null,
      error: null,
    };
    const telemetryScan = typeof this.telemetryCatalog?.getScanStatus === 'function'
      ? this.telemetryCatalog.getScanStatus()
      : defaultTelemetryScan;
    const allComplete = !this.pendingSessionRefresh && !this.replayScanStatus.running && !this.sessionScanStatus.running &&
      !telemetryScan.running && !this.sessionProjectionBackfill.running && !this.sessionReplayReconciliationRunning &&
      !this.telemetryOwnershipReconciliationRunning;
    const allCached = Boolean(
      allComplete && ![...this.replayJobs.values()].some(job => job.status === 'failed') && !this.replayScanStatus.error && !this.sessionScanStatus.error && !telemetryScan.error &&
      (this.replayScanStatus.result?.added === 0 && this.replayScanStatus.result?.updated === 0) &&
      (this.sessionScanStatus.result?.added === 0 && this.sessionScanStatus.result?.updated === 0)
    );

    return {
      // Includes the process identity: a restarted server cannot reuse the previous revision.
      dataRevision: [this.instanceId, this.sessionDb.getSessionRevision?.() ?? 0,
        this.sessionDb.getReplayMetadataRevision?.() ?? 0,
        this.sessionDb.getTelemetryMetadataRevision?.() ?? 0].join(':'),
      ...this.replayScanStatus,
      replayJobs: [...this.replayJobs.values()],
      refreshQueued: this.pendingSessionRefresh,
      sessionScan: this.sessionScanStatus,
      sessionProjectionBackfill: this.sessionProjectionBackfill,
      replayUpgrade: this.replayUpgrade?.getStatus(),
      telemetryScan,
      referenceLaptimes: this.referenceLaptimeRefreshStatus,
      allComplete,
      allCached,
    };
  }
}
