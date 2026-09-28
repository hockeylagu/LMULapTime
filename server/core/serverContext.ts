import fs from 'fs';
import path from 'path';
import { LmuParser } from '../sessions/parser.js';
import type { ReplayFileEntry } from '../sessions/sessionXmlTypes.js';
import { replayIndexEntryFromStored } from '../sessions/replayMatching.js';
import { SessionReplayLinks } from '../sessions/sessionReplayLinks.js';
import { DetailedSession, ReferenceBenchmarkDiff, ReferenceLaptimeRefreshStatus, ReplayScanStatus, ScanStatus, SessionScanStatus, TelemetryScanStatus } from './types.js';

import { SessionDatabase } from './db.js';
import { decideTelemetryLinks, TELEMETRY_LINK_RULE, TelemetryLinks } from '../telemetry/telemetryLinks.js';
import { TelemetryCatalog } from '../telemetry/telemetryCatalog.js';
import { ReplayCacheService } from '../replay/replayCacheService.js';
import { ReplayUpgradeRunner } from '../replay/replayUpgradeRunner.js';
import { ReplayFactsBackfillRunner } from '../replay/replayFactsBackfill.js';
import { pumpScanInBackground, startedScanStatus } from './backgroundScan.js';

export interface ServerContextOptions {
  resultsDir: string;
  replaysDir: string;
  telemetryDir: string;
  parser: LmuParser;
  sessionDb: SessionDatabase;
  telemetryCatalog: TelemetryCatalog;
  replayCache: ReplayCacheService;
}

export class ServerContext {
  private currentResultsDir: string;
  private currentReplaysDir: string;
  private currentTelemetryDir: string;
  private parser: LmuParser;
  private pendingForcedSessionReparse = false;
  // What the cached session list was last enriched against (see loadSessions).
  private enrichedInputs: unknown[] | null = null;
  // The parser and replay_metadata revision the replay index was last loaded for.
  private replayIndexLoadedFor: [LmuParser, number] | null = null;
  private replayUpgradeRunner: ReplayUpgradeRunner | null = null;
  private replayFactsRunner: ReplayFactsBackfillRunner | null = null;
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
    this.populateReplayIndexFromDb();
  }

  public get sessionDb(): SessionDatabase { return this.options.sessionDb; }
  public get telemetryCatalog(): TelemetryCatalog { return this.options.telemetryCatalog; }
  public get replayCache(): ReplayCacheService { return this.options.replayCache; }
  public get resultsDir(): string { return this.currentResultsDir; }
  public get replaysDir(): string { return this.currentReplaysDir; }
  public get telemetryDir(): string { return this.currentTelemetryDir; }
  public get currentParser(): LmuParser { return this.parser; }

  /** Null when the database cannot run the upgrade (test doubles). */
  public get replayUpgrade(): ReplayUpgradeRunner | null {
    if (!this.replayUpgradeRunner && typeof this.sessionDb.upgradeReplaysAsyncIterator === 'function') {
      this.replayUpgradeRunner = new ReplayUpgradeRunner(this.sessionDb, () => this.startReplayFactsBackfillWhenIdle());
    }
    return this.replayUpgradeRunner;
  }

  /** Null when the database cannot run the backfill (test doubles). */
  public get replayFacts(): ReplayFactsBackfillRunner | null {
    if (!this.replayFactsRunner && typeof this.sessionDb.getDb === 'function') {
      this.replayFactsRunner = new ReplayFactsBackfillRunner(this.sessionDb.getDb());
    }
    return this.replayFactsRunner;
  }

  // The upgrade is the lowest-priority work: it runs only once no scan is running. The replay facts
  // backfill follows it (its onFinished), or runs straight away when the upgrade is turned off.
  public startReplayUpgradeWhenIdle(): boolean {
    if (this.sessionScanStatus.running || this.replayScanStatus.running) return false;
    const upgrade = this.replayUpgrade;
    const started = upgrade?.start(this.currentReplaysDir, this.parser.configuredPlayerName) ?? false;
    if (!started && !upgrade?.getStatus().running) this.startReplayFactsBackfillWhenIdle();
    return started;
  }

  public startReplayFactsBackfillWhenIdle(): boolean {
    if (this.sessionScanStatus.running || this.replayScanStatus.running) return false;
    return this.replayFacts?.start() ?? false;
  }

  /** Asks the background replay work (upgrade, facts backfill) to pause for a scan. */
  private stopBackgroundReplayWork(): void {
    this.replayUpgrade?.stop();
    this.replayFacts?.stop();
  }

  public configureDirectories(values: { resultsDir?: unknown; replaysDir?: unknown; telemetryDir?: unknown; playerName?: unknown }): boolean {
    if (this.hasActiveFileScan()) return false;
    this.stopBackgroundReplayWork();

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

    this.parser = new LmuParser(this.currentReplaysDir, this.currentResultsDir);
    if (typeof values.playerName === 'string' && values.playerName.trim()) {
      this.parser.configuredPlayerName = values.playerName.trim();
    }
    this.populateReplayIndexFromDb();
    return true;
  }

  public hasActiveFileScan(): boolean {
    const telemetryRunning = typeof this.telemetryCatalog?.getScanStatus === 'function'
      ? this.telemetryCatalog.getScanStatus().running
      : false;
    return this.sessionScanStatus.running || this.replayScanStatus.running || telemetryRunning;
  }

  public populateReplayIndexFromDb(): void {
    // Reading the stored replays decompresses every one's metadata (~20 ms for 325 replays), and
    // every session list, metadata and trajectory request asks: reload only when rows changed.
    const revision = typeof this.sessionDb.getReplayMetadataRevision === 'function' ? this.sessionDb.getReplayMetadataRevision() : NaN;
    if (this.replayIndexLoadedFor?.[0] === this.parser && this.replayIndexLoadedFor[1] === revision) return;
    try {
      const stored = this.sessionDb.getAllStoredReplayFiles();
      for (const r of stored) this.parser.addReplayEntry(replayIndexEntryFromStored(r));
      this.replayIndexLoadedFor = [this.parser, revision];
    } catch (err) {
      console.warn('[ServerContext] Error populating replay index from DB:', err);
    }
  }

  public enrichSessionsWithTelemetry(sessions: DetailedSession[]): void {
    try {
      this.populateReplayIndexFromDb();
      const replaysByName = new Map(this.parser.getReplaysList().map(r => [r.name, r] as const));
      this.replayLinks.linkSessions(sessions, this.parser, replaysByName);

      this.storeNewTelemetryLinks(sessions, [...replaysByName.values()]);
      const links = TelemetryLinks.load(this.sessionDb);
      for (const session of sessions) {
        const filename = links.forSession(session);
        session.hasDuckDbTelemetry = Boolean(filename);
        if (filename) session.duckdbFilename = filename;
        else delete session.duckdbFilename;
        const replayLink = session.matchingReplayFile;
        if (!replayLink) continue;
        const changed = Boolean(replayLink.hasDuckDbTelemetry) !== Boolean(filename) || replayLink.duckdbFilename !== filename;
        replayLink.hasDuckDbTelemetry = Boolean(filename);
        if (filename) replayLink.duckdbFilename = filename;
        else delete replayLink.duckdbFilename;
        if (changed) this.sessionDb.updateSessionMatchingReplay(session.id, replayLink);
      }
    } catch (error) {
      console.warn('[Telemetry Matcher] Error enriching sessions with DuckDB telemetry:', error);
    }
  }

  /**
   * Decides the DuckDB matches of files, sessions and replays that have none yet and stores them.
   * Matches are decided once: a stored match is only read afterwards.
   */
  private storeNewTelemetryLinks(sessions: DetailedSession[], replays: ReplayFileEntry[]): void {
    if (this.sessionDb.resetTelemetryLinksForRule(TELEMETRY_LINK_RULE)) {
      console.log('[Telemetry Matcher] Stored telemetry matches cleared to be decided again: each file goes to the session it was recorded in');
    }
    this.sessionDb.linkTelemetryFiles(decideTelemetryLinks({
      sessionEndMs: session => this.replayLinks.xmlMtime(session),
      files: this.sessionDb.getTelemetryFiles(),
      stored: this.sessionDb.getTelemetryMetadata(),
      sessions,
      replays,
      loadReplayMetadata: replayName => this.sessionDb.getStoredReplayMetadata(replayName),
    }));
  }

  public loadSessions(forceRefresh = false, forceReparse = false): DetailedSession[] {
    if (forceRefresh) {
      const started = this.runSessionSyncInBackground(forceReparse);
      if (!started && forceReparse) this.pendingForcedSessionReparse = true;
    }
    const sessions = this.sessionDb.getAllSessions();
    // getAllSessions returns the same cached objects until sessions change, and enrichment writes
    // its results into them: it only needs to run again when one of its inputs changed. It cost
    // ~340 ms, paid by every session list, metadata and trajectory request.
    this.populateReplayIndexFromDb();
    const inputs = this.enrichmentInputs(sessions);
    if (this.enrichedInputs && inputs.every((input, i) => input === this.enrichedInputs?.[i])) return sessions;
    this.enrichSessionsWithTelemetry(sessions);
    // Enrichment itself records the matches it finds; key on the state it leaves behind.
    this.enrichedInputs = this.enrichmentInputs(sessions);
    return sessions;
  }

  private enrichmentInputs(sessions: DetailedSession[]): unknown[] {
    return [
      sessions,
      this.parser,
      typeof this.parser.getReplayIndexRevision === 'function' ? this.parser.getReplayIndexRevision() : NaN,
      typeof this.telemetryCatalog?.getFiles === 'function' ? this.telemetryCatalog.getFiles() : NaN,
      typeof this.sessionDb.getTelemetryMetadataRevision === 'function' ? this.sessionDb.getTelemetryMetadataRevision() : NaN,
    ];
  }

  public parseAndCacheFile(filePath: string): DetailedSession | null {
    const parsed = this.parser.parseSessionXml(filePath);
    if (parsed) {
      try {
        const stats = fs.statSync(filePath);
        this.sessionDb.upsertSession(parsed, filePath, Math.floor(stats.mtimeMs), stats.size);
      } catch {
        // Ignore cache persistence failures for a direct session fallback.
      }
    }
    return parsed;
  }

  public runReplaySyncInBackground(): boolean {
    if (this.replayScanStatus.running) return false;
    this.stopBackgroundReplayWork();
    this.replayScanStatus = startedScanStatus();
    const replaysDir = this.currentReplaysDir;
    const iterator = this.sessionDb.syncReplaysAsyncIterator(replaysDir, { playerName: this.parser.configuredPlayerName });
    pumpScanInBackground(iterator, this.replayScanStatus, outcome => {
      if ('result' in outcome) {
        const { total, added, updated, skipped } = outcome.result;
        console.log(`[SQLite Cache] Cached ${total} replays (${added} new, ${updated} updated, ${skipped} skipped) from ${replaysDir}`);
        try {
          if (typeof this.sessionDb?.getAllSessions === 'function') {
            this.enrichSessionsWithTelemetry(this.sessionDb.getAllSessions());
          }
        } catch (err) {
          console.warn('[ServerContext] Error enriching sessions after replay sync:', err);
        }
      } else {
        console.warn('[SQLite Cache] Replay sync warning:', outcome.error);
      }
      this.runPendingForcedSessionReparse();
      this.startReplayUpgradeWhenIdle();
    });
    return true;
  }

  private runPendingForcedSessionReparse(): void {
    if (!this.pendingForcedSessionReparse) return;
    this.pendingForcedSessionReparse = false;
    if (!this.runSessionSyncInBackground(true)) this.pendingForcedSessionReparse = true;
  }

  public runSessionSyncInBackground(forceReparse = false): boolean {
    if (this.sessionScanStatus.running || this.replayScanStatus.running) return false;
    this.stopBackgroundReplayWork();
    const status: SessionScanStatus = startedScanStatus();
    this.sessionScanStatus = status;
    const resultsDir = this.currentResultsDir;
    const iterator = this.sessionDb.syncSessionsAsyncIterator(resultsDir, this.parser, forceReparse);
    pumpScanInBackground(iterator, status, outcome => {
      if ('result' in outcome) {
        const { total, added, updated } = outcome.result;
        status.processed = total;
        status.total = total;
        console.log(`[SQLite Cache] Loaded ${total} sessions (${added} new, ${updated} updated) from ${resultsDir}`);
      } else {
        console.warn('[SQLite Cache] Initial sync warning:', outcome.error);
      }
      // Replays are matched against the sessions: their sync always follows.
      this.runReplaySyncInBackground();
    });
    return true;
  }

  public runInitialSessionSyncInBackground(): void {
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
          this.referenceLaptimeRefreshStatus.running = false;
          this.referenceLaptimeRefreshStatus.checked = true;
          this.referenceLaptimeRefreshStatus.completedAt = new Date().toISOString();
        });
    });
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
    const allComplete = !this.replayScanStatus.running && !this.sessionScanStatus.running && !telemetryScan.running;
    const allCached = Boolean(
      allComplete &&
      (this.replayScanStatus.result?.added === 0 && this.replayScanStatus.result?.updated === 0) &&
      (this.sessionScanStatus.result?.added === 0 && this.sessionScanStatus.result?.updated === 0)
    );

    return {
      ...this.replayScanStatus,
      sessionScan: this.sessionScanStatus,
      replayUpgrade: this.replayUpgrade?.getStatus(),
      replayFacts: this.replayFacts?.getStatus(),
      telemetryScan,
      referenceLaptimes: this.referenceLaptimeRefreshStatus,
      allComplete,
      allCached,
    };
  }
}
