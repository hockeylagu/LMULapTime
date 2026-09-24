import fs from 'fs';
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
  private replayScanStatus: ReplayScanStatus = {
    running: false,
    processed: 0,
    total: 0,
    currentFile: null,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
  };
  private sessionScanStatus: SessionScanStatus = {
    running: false,
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

  public configureDirectories(values: { resultsDir?: unknown; replaysDir?: unknown; telemetryDir?: unknown; playerName?: unknown }): void {
    if (typeof values.resultsDir === 'string' && fs.existsSync(values.resultsDir)) this.currentResultsDir = values.resultsDir;
    if (typeof values.replaysDir === 'string' && fs.existsSync(values.replaysDir)) this.currentReplaysDir = values.replaysDir;
    if (typeof values.telemetryDir === 'string' && fs.existsSync(values.telemetryDir)) {
      this.currentTelemetryDir = values.telemetryDir;
      this.sessionDb.setMetadata('telemetry_dir', this.currentTelemetryDir);
    }

    this.parser = new LmuParser(this.currentReplaysDir, this.currentResultsDir);
    if (typeof values.playerName === 'string' && values.playerName.trim()) {
      this.parser.configuredPlayerName = values.playerName.trim();
    }
    this.populateReplayIndexFromDb();
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
      this.sessionDb.syncSessionsFromDir(this.currentResultsDir, this.parser, forceReparse);
      this.runReplaySyncInBackground();
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

  public runReplaySyncInBackground(): void {
    if (this.replayScanStatus.running) return;
    this.replayScanStatus = {
      running: true,
      processed: 0,
      total: 0,
      currentFile: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
    };

    const iterator = this.sessionDb.syncReplaysIterator(this.currentReplaysDir, { playerName: this.parser.configuredPlayerName });
    const BATCH_SIZE = 15;
    const step = (): void => {
      try {
        let iterations = 0;
        let lastValue: { processed: number; total: number; currentFile: string } | undefined;
        while (iterations < BATCH_SIZE) {
          const { value, done } = iterator.next();
          if (done) {
            this.replayScanStatus.result = value;
            console.log(`[SQLite Cache] Cached ${value.total} replays (${value.added} new, ${value.updated} updated, ${value.skipped} skipped) from ${this.currentReplaysDir}`);
            this.replayScanStatus.running = false;
            this.replayScanStatus.finishedAt = new Date().toISOString();
            try {
              if (typeof this.sessionDb?.getAllSessions === 'function') {
                this.enrichSessionsWithTelemetry(this.sessionDb.getAllSessions());
              }
            } catch (err) {
              console.warn('[ServerContext] Error enriching sessions after replay sync:', err);
            }
            return;
          }
          lastValue = value;
          iterations++;
          if (value.currentFile && (this.replayScanStatus.processed === 0 || value.processed % BATCH_SIZE === 0)) {
            break;
          }
        }
        if (lastValue) {
          this.replayScanStatus.processed = lastValue.processed;
          this.replayScanStatus.total = lastValue.total;
          this.replayScanStatus.currentFile = lastValue.currentFile || null;
        }
        setImmediate(step);
      } catch (error) {
        this.replayScanStatus.error = error instanceof Error ? error.message : String(error);
        console.warn('[SQLite Cache] Replay sync warning:', error);
        this.replayScanStatus.running = false;
        this.replayScanStatus.finishedAt = new Date().toISOString();
      }
    };
    setImmediate(step);
  }

  public runInitialSessionSyncInBackground(): void {
    if (this.sessionScanStatus.running) return;
    this.sessionScanStatus = {
      running: true,
      processed: 0,
      total: 0,
      currentFile: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
    };

    setImmediate(() => {
      try {
        const result = this.sessionDb.syncSessionsFromDir(this.currentResultsDir, this.parser, false, (progress) => {
          this.sessionScanStatus.processed = progress.processed;
          this.sessionScanStatus.total = progress.total;
          this.sessionScanStatus.currentFile = progress.currentFile;
        });
        this.sessionScanStatus.result = result;
        this.sessionScanStatus.processed = result.total;
        this.sessionScanStatus.total = result.total;
        console.log(`[SQLite Cache] Loaded ${result.total} sessions (${result.added} new, ${result.updated} updated) from ${this.currentResultsDir}`);
      } catch (error: unknown) {
        this.sessionScanStatus.error = error instanceof Error ? error.message : String(error);
        console.warn('[SQLite Cache] Initial sync warning:', error);
      } finally {
        this.sessionScanStatus.running = false;
        this.sessionScanStatus.finishedAt = new Date().toISOString();
        this.runReplaySyncInBackground();
      }
    });
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
