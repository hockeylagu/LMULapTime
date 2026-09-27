import fs from 'fs';
import path from 'path';
import { LmuParser } from '../sessions/parser.js';
import type { ReplayFileEntry } from '../sessions/sessionXmlTypes.js';
import { pickReplayOwner, replayIndexEntryFromStored, replayLinkRejection, ReplayMatchTarget } from '../sessions/replayMatching.js';
import { DetailedSession, RejectedReplayLink, ReplayLinkRejectionReason, ReferenceBenchmarkDiff, ReferenceLaptimeRefreshStatus, ReplayScanStatus, ScanStatus, SessionScanStatus, TelemetryScanStatus } from './types.js';

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
  // What the cached session list was last enriched against (see loadSessions).
  private enrichedInputs: unknown[] | null = null;
  // The parser and replay_metadata revision the replay index was last loaded for.
  private replayIndexLoadedFor: [LmuParser, number] | null = null;
  // Session id -> replay index revision at which its stored replay match was last re-checked.
  private readonly replayMatchCheckedAt = new Map<string, number>();
  // Results XML path -> mtime; XMLs are written once, so one stat per process is enough.
  private readonly xmlMtimeCache = new Map<string, number | null>();
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

  private getXmlMtime(session: DetailedSession): number | undefined {
    if (!session.filePath) return undefined;
    let mtime = this.xmlMtimeCache.get(session.filePath);
    if (mtime === undefined) {
      try {
        mtime = fs.statSync(session.filePath).mtimeMs;
      } catch {
        mtime = null;
      }
      this.xmlMtimeCache.set(session.filePath, mtime);
    }
    return mtime ?? undefined;
  }

  private estimateSessionEndMs(session: DetailedSession): number {
    let maxElapsed = 0;
    for (const d of session.drivers ?? []) {
      for (const l of d.laps ?? []) {
        if (typeof l.elapsedSeconds === 'number' && l.elapsedSeconds > maxElapsed) {
          maxElapsed = l.elapsedSeconds;
        }
      }
    }
    return session.timestamp + Math.round(maxElapsed * 1000);
  }

  private toReplayLink(replay: ReplayFileEntry): NonNullable<DetailedSession['matchingReplayFile']> {
    return {
      name: replay.name,
      path: replay.path,
      sizeBytes: replay.sizeBytes,
      eventTitle: replay.eventTitle,
      splitNo: replay.splitNo,
      eventType: replay.eventType,
      durationSec: replay.durationSec,
    };
  }

  private relinkSession(session: DetailedSession, replay: ReplayFileEntry): void {
    console.log(`[ServerContext] Re-matched session ${session.id}: ${session.matchingReplayFile?.name} -> ${replay.name}`);
    session.matchingReplayFile = this.toReplayLink(replay);
    this.sessionDb.updateSessionMatchingReplay(session.id, session.matchingReplayFile);
  }

  /**
   * Re-validates a stored match against the current matching rules, which older builds did not
   * enforce (e.g. every session of a practice run linked to the one replay LMU saved at its end).
   * A match that fails them is replaced by the session's own replay when there is one, and withdrawn
   * otherwise (recorded in rejected_replay_links). A valid match is only replaced by a replay saved
   * within SAME_SAVE_WINDOW_MS of the XML: LMU saves both within about a second at session end, and
   * the stored match can predate that replay being cached (the replay sync runs after the session sync).
   */
  private recheckStoredReplayMatch(session: DetailedSession, replaysByName: Map<string, ReplayFileEntry>): void {
    const SAME_SAVE_WINDOW_MS = 60_000;
    const stored = session.matchingReplayFile;
    if (!stored) return;
    const revision = this.parser.getReplayIndexRevision();
    if (this.replayMatchCheckedAt.get(session.id) === revision) return;
    this.replayMatchCheckedAt.set(session.id, revision);

    // Without the replay's timing or the XML's mtime the match cannot be judged: keep it.
    const current = replaysByName.get(stored.name);
    const xmlMtime = this.getXmlMtime(session);
    if (!current || xmlMtime === undefined) return;

    const target = this.matchTarget(session, xmlMtime);
    const rejection = replayLinkRejection(current, target);
    if (!rejection && Math.abs(current.mtime - xmlMtime) <= SAME_SAVE_WINDOW_MS) return;

    const candidate = this.parser.findMatchingReplay(
      target.trackVenue, target.trackCourse, target.sessionCode, target.sessionTimestampMs, target.xmlFileMtimeMs
    );
    const isOwnReplay = candidate && candidate.name !== stored.name &&
      (rejection || Math.abs(candidate.mtime - xmlMtime) <= SAME_SAVE_WINDOW_MS);
    if (candidate && isOwnReplay) {
      this.relinkSession(session, candidate);
      return;
    }
    if (rejection) this.withdrawReplayLink(session, rejection);
  }

  private matchTarget(session: DetailedSession, xmlFileMtimeMs: number): ReplayMatchTarget {
    return {
      trackVenue: session.trackVenue,
      trackCourse: session.trackCourse,
      sessionCode: session.sessionName || session.sessionType,
      sessionTimestampMs: session.timestamp,
      xmlFileMtimeMs,
    };
  }

  private withdrawReplayLink(session: DetailedSession, reason: ReplayLinkRejectionReason): void {
    const stored = session.matchingReplayFile;
    if (!stored) return;
    console.log(`[ServerContext] Withdrew replay ${stored.name} from session ${session.id} (${reason})`);
    const rejected = this.sessionDb.rejectSessionReplayLink(session.id, stored, reason);
    delete session.matchingReplayFile;
    if (rejected) session.rejectedReplayLink = rejected;
  }

  /**
   * A replay records one session. LMU can save a single replay for a run of sessions (restarting a
   * practice keeps the file), so several sessions can each pass the matching rules against it: the
   * closest one keeps it and the others lose it. A replay the index does not know cannot be judged.
   */
  private enforceOneSessionPerReplay(sessions: DetailedSession[], replaysByName: Map<string, ReplayFileEntry>): void {
    const claimsByReplay = new Map<string, DetailedSession[]>();
    for (const session of sessions) {
      const name = session.matchingReplayFile?.name;
      if (!name) continue;
      const claims = claimsByReplay.get(name) ?? [];
      claims.push(session);
      claimsByReplay.set(name, claims);
    }
    for (const [name, claims] of claimsByReplay) {
      const replay = replaysByName.get(name);
      if (claims.length < 2 || !replay) continue;
      const ownerId = pickReplayOwner(replay, claims.map(session => ({
        id: session.id,
        target: this.matchTarget(session, this.getXmlMtime(session) ?? this.estimateSessionEndMs(session)),
      })));
      for (const session of claims) {
        if (session.id !== ownerId) this.withdrawReplayLink(session, 'owned-by-other-session');
      }
    }
  }

  public enrichSessionsWithTelemetry(sessions: DetailedSession[]): void {
    try {
      this.populateReplayIndexFromDb();
      const replaysByName = new Map(this.parser.getReplaysList().map(r => [r.name, r] as const));
      const rejectedLinks = typeof this.sessionDb.getRejectedReplayLinks === 'function'
        ? this.sessionDb.getRejectedReplayLinks()
        : new Map<string, RejectedReplayLink[]>();

      for (const session of sessions) {
        if (session.matchingReplayFile) {
          this.recheckStoredReplayMatch(session, replaysByName);
        } else {
          // Sessions parsed before their replay was cached (the replay sync runs after the
          // session sync) are linked here. The XML mtime is the real session end; the last-lap
          // estimate can be 15+ minutes early (post-race cool-down), outside the match window.
          const matchedReplay = this.parser.findMatchingReplay(
            session.trackVenue,
            session.trackCourse,
            session.sessionName || session.sessionType,
            session.timestamp,
            this.getXmlMtime(session) ?? this.estimateSessionEndMs(session)
          );
          // A replay withdrawn from this session is never linked to it again.
          const withdrawn = rejectedLinks.get(session.id)?.some(link => link.replayName === matchedReplay?.name);
          if (matchedReplay && !withdrawn) {
            session.matchingReplayFile = this.toReplayLink(matchedReplay);
            this.sessionDb.updateSessionMatchingReplay(session.id, session.matchingReplayFile);
          }
        }
      }
      this.enforceOneSessionPerReplay(sessions, replaysByName);
      // Tells the UI why a session has no replay when one was withdrawn from it.
      for (const session of sessions) {
        const withdrawals = rejectedLinks.get(session.id);
        // The session's own field holds a withdrawal made during this pass, newer than the table read.
        const rejected = session.matchingReplayFile
          ? undefined
          : session.rejectedReplayLink ?? withdrawals?.[withdrawals.length - 1];
        if (rejected) session.rejectedReplayLink = rejected;
        else delete session.rejectedReplayLink;
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
