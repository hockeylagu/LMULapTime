import fs from 'fs';
import path from 'path';
import { LmuParser } from '../sessions/parser.js';
import { DetailedSession, ReferenceBenchmarkDiff, ReferenceLaptimeRefreshStatus, ReplayScanStatus, ScanStatus, SessionScanStatus, TelemetryScanStatus } from './types.js';

import { SessionDatabase } from './db.js';
import { matchDuckDbToSession } from '../telemetry/telemetryMatcher.js';
import { TelemetryCatalog } from '../telemetry/telemetryCatalog.js';
import { ReplayCacheService } from '../replay/replayCacheService.js';

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
    this.populateReplayIndexFromDb();
  }

  public get sessionDb(): SessionDatabase { return this.options.sessionDb; }
  public get telemetryCatalog(): TelemetryCatalog { return this.options.telemetryCatalog; }
  public get replayCache(): ReplayCacheService { return this.options.replayCache; }
  public get resultsDir(): string { return this.currentResultsDir; }
  public get replaysDir(): string { return this.currentReplaysDir; }
  public get telemetryDir(): string { return this.currentTelemetryDir; }
  public get currentParser(): LmuParser { return this.parser; }

  public configureDirectories(values: { resultsDir?: unknown; replaysDir?: unknown; telemetryDir?: unknown; playerName?: unknown }): boolean {
    if (this.hasActiveFileScan()) return false;

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
    try {
      const stored = this.sessionDb.getAllStoredReplayFiles();
      for (const r of stored) {
        const match = r.filename.match(/^(.+?)\s+([PQR]\d+)\b/i);
        const trackName = match ? match[1].trim() : (r.metadata.trackVenue || r.metadata.trackCourse || r.metadata.trackName || r.filename.replace(/\.vcr$/i, ''));
        const sessionCode = match ? match[2].toUpperCase() : (r.metadata.sessionType || '');
        this.parser.addReplayEntry({
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
    } catch (err) {
      console.warn('[ServerContext] Error populating replay index from DB:', err);
    }
  }

  public enrichSessionsWithTelemetry(sessions: DetailedSession[]): void {
    try {
      this.populateReplayIndexFromDb();

      for (const session of sessions) {
        if (!session.matchingReplayFile) {
          let estimatedEndMs = session.timestamp;
          if (session.drivers && session.drivers.length > 0) {
            let maxElapsed = 0;
            for (const d of session.drivers) {
              if (d.laps) {
                for (const l of d.laps) {
                  if (typeof l.elapsedSeconds === 'number' && l.elapsedSeconds > maxElapsed) {
                    maxElapsed = l.elapsedSeconds;
                  }
                }
              }
            }
            if (maxElapsed > 0) {
              estimatedEndMs = session.timestamp + Math.round(maxElapsed * 1000);
            }
          }

          const matchedReplay = this.parser.findMatchingReplay(
            session.trackVenue,
            session.trackCourse,
            session.sessionName || session.sessionType,
            session.timestamp,
            estimatedEndMs
          );
          if (matchedReplay) {
            session.matchingReplayFile = {
              name: matchedReplay.name,
              path: matchedReplay.path,
              sizeBytes: matchedReplay.sizeBytes,
              eventTitle: matchedReplay.eventTitle,
              splitNo: matchedReplay.splitNo,
              eventType: matchedReplay.eventType,
              durationSec: matchedReplay.durationSec,
            };
            this.sessionDb.updateSessionMatchingReplay(session.id, session.matchingReplayFile);
          }
        }
      }

      const duckFiles = this.telemetryCatalog.getFiles();
      const telemetryMeta = this.sessionDb.getTelemetryMetadata();
      const telemetryBySessionId = new Map<string, string>();
      const telemetryByReplay = new Map<string, string>();

      for (const metadata of telemetryMeta) {
        if (metadata.matchedSessionId) telemetryBySessionId.set(metadata.matchedSessionId, metadata.filename);
        if (metadata.matchedReplayFilename) telemetryByReplay.set(metadata.matchedReplayFilename, metadata.filename);
      }

      for (const session of sessions) {
        session.hasDuckDbTelemetry = false;
        delete session.duckdbFilename;
        if (session.matchingReplayFile) {
          session.matchingReplayFile.hasDuckDbTelemetry = false;
          delete session.matchingReplayFile.duckdbFilename;
        }
        const replayName = session.matchingReplayFile?.name;
        const matched = duckFiles.length > 0 ? matchDuckDbToSession(duckFiles, session) : null;
        let matchedDuckFilename = matched?.filename;
        if (matched) {
          this.sessionDb.upsertTelemetryMetadata(matched, session.id, replayName);
        } else {
          matchedDuckFilename = telemetryBySessionId.get(session.id) ||
            (replayName ? telemetryByReplay.get(replayName) : undefined);
        }

        if (matchedDuckFilename) {
          session.hasDuckDbTelemetry = true;
          session.duckdbFilename = matchedDuckFilename;
          if (session.matchingReplayFile) {
            session.matchingReplayFile.hasDuckDbTelemetry = true;
            session.matchingReplayFile.duckdbFilename = matchedDuckFilename;
            this.sessionDb.updateSessionMatchingReplay(session.id, session.matchingReplayFile);
          }
        }
      }
    } catch (error) {
      console.warn('[Telemetry Matcher] Error enriching sessions with DuckDB telemetry:', error);
    }
  }

  public loadSessions(forceRefresh = false, forceReparse = false): DetailedSession[] {
    if (forceRefresh) {
      const started = this.runSessionSyncInBackground(forceReparse);
      if (!started && forceReparse) this.pendingForcedSessionReparse = true;
    }
    const sessions = this.sessionDb.getAllSessions();
    this.enrichSessionsWithTelemetry(sessions);
    return sessions;
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
    this.replayScanStatus = {
      running: true,
      processed: 0,
      total: 0,
      currentFile: null,
      currentStage: null,
      filePercent: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
    };

    const iterator = this.sessionDb.syncReplaysAsyncIterator(this.currentReplaysDir, { playerName: this.parser.configuredPlayerName });
    const step = async (): Promise<void> => {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          this.replayScanStatus.result = value;
          console.log(`[SQLite Cache] Cached ${value.total} replays (${value.added} new, ${value.updated} updated, ${value.skipped} skipped) from ${this.currentReplaysDir}`);
          this.replayScanStatus.running = false;
          this.replayScanStatus.finishedAt = new Date().toISOString();
          this.replayScanStatus.currentStage = null;
          this.replayScanStatus.filePercent = null;
          try {
            if (typeof this.sessionDb?.getAllSessions === 'function') {
              this.enrichSessionsWithTelemetry(this.sessionDb.getAllSessions());
            }
          } catch (err) {
            console.warn('[ServerContext] Error enriching sessions after replay sync:', err);
          }
          this.runPendingForcedSessionReparse();
          return;
        }
        this.replayScanStatus.processed = value.processed;
        this.replayScanStatus.total = value.total;
        this.replayScanStatus.currentFile = value.currentFile || null;
        this.replayScanStatus.currentStage = value.stage || null;
        this.replayScanStatus.filePercent = value.filePercent ?? null;
        setImmediate(() => { void step(); });
      } catch (error) {
        this.replayScanStatus.error = error instanceof Error ? error.message : String(error);
        console.warn('[SQLite Cache] Replay sync warning:', error);
        this.replayScanStatus.running = false;
        this.replayScanStatus.finishedAt = new Date().toISOString();
        this.replayScanStatus.currentStage = null;
        this.replayScanStatus.filePercent = null;
        this.runPendingForcedSessionReparse();
      }
    };
    setImmediate(() => { void step(); });
    return true;
  }

  private runPendingForcedSessionReparse(): void {
    if (!this.pendingForcedSessionReparse) return;
    this.pendingForcedSessionReparse = false;
    if (!this.runSessionSyncInBackground(true)) this.pendingForcedSessionReparse = true;
  }

  public runSessionSyncInBackground(forceReparse = false): boolean {
    if (this.sessionScanStatus.running || this.replayScanStatus.running) return false;
    this.sessionScanStatus = {
      running: true,
      processed: 0,
      total: 0,
      currentFile: null,
      currentStage: null,
      filePercent: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
    };

    const iterator = this.sessionDb.syncSessionsAsyncIterator(this.currentResultsDir, this.parser, forceReparse);
    let lastLoggedStage: string | null = null;
    const step = async (): Promise<void> => {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          this.sessionScanStatus.result = value;
          this.sessionScanStatus.processed = value.total;
          this.sessionScanStatus.total = value.total;
          console.log(`[SQLite Cache] Loaded ${value.total} sessions (${value.added} new, ${value.updated} updated) from ${this.currentResultsDir}`);
          this.sessionScanStatus.running = false;
          this.sessionScanStatus.finishedAt = new Date().toISOString();
          this.sessionScanStatus.currentStage = null;
          this.sessionScanStatus.filePercent = null;
          this.runReplaySyncInBackground();
          return;
        }
        this.sessionScanStatus.processed = value.processed;
        this.sessionScanStatus.total = value.total;
        this.sessionScanStatus.currentFile = value.currentFile || null;
        this.sessionScanStatus.currentStage = value.stage || null;
        this.sessionScanStatus.filePercent = value.filePercent ?? null;
        const shouldLogProgress = value.stage !== lastLoggedStage || value.processed === 0 || value.processed % 25 === 0;
        if (shouldLogProgress) {
          lastLoggedStage = value.stage || null;
          const progress = value.total > 0 ? `${value.processed}/${value.total}` : 'starting';
          const file = value.currentFile ? ` (${value.currentFile})` : '';
          console.log(`[SQLite Cache] [XML] ${value.stage || 'Processing'}: ${progress}${file}`);
        }
        setImmediate(() => { void step(); });
      } catch (error: unknown) {
        this.sessionScanStatus.error = error instanceof Error ? error.message : String(error);
        console.warn('[SQLite Cache] Initial sync warning:', error);
        this.sessionScanStatus.running = false;
        this.sessionScanStatus.finishedAt = new Date().toISOString();
        this.sessionScanStatus.currentStage = null;
        this.sessionScanStatus.filePercent = null;
        this.runReplaySyncInBackground();
      }
    };
    setImmediate(() => { void step(); });
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
      telemetryScan,
      referenceLaptimes: this.referenceLaptimeRefreshStatus,
      allComplete,
      allCached,
    };
  }
}
