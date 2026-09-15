import fs from 'fs';
import { LmuParser } from '../sessions/parser.js';
import { DetailedSession, ReplayScanStatus } from './types.js';
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

  public constructor(private readonly options: ServerContextOptions) {
    this.currentResultsDir = options.resultsDir;
    this.currentReplaysDir = options.replaysDir;
    this.currentTelemetryDir = options.telemetryDir;
    this.parser = options.parser;
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
  }

  public enrichSessionsWithTelemetry(sessions: DetailedSession[]): void {
    try {
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
    const step = (): void => {
      try {
        const { value, done } = iterator.next();
        if (done) {
          this.replayScanStatus.result = value;
          console.log(`[SQLite Cache] Cached ${value.total} replays (${value.added} new, ${value.updated} updated, ${value.skipped} skipped) from ${this.currentReplaysDir}`);
          this.replayScanStatus.running = false;
          this.replayScanStatus.finishedAt = new Date().toISOString();
          return;
        }
        this.replayScanStatus.processed = value.processed;
        this.replayScanStatus.total = value.total;
        this.replayScanStatus.currentFile = value.currentFile || null;
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

  public getReplayScanStatus(): ReplayScanStatus { return this.replayScanStatus; }
}
