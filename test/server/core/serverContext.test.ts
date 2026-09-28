import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SessionDatabase } from '../../../server/core/db.js';
import { ServerContext } from '../../../server/core/serverContext.js';
import type { DetailedSession, ReferenceBenchmarkDiff, ReplayTrajectoryData } from '../../../server/core/types.js';
import { ReplayCacheService } from '../../../server/replay/replayCacheService.js';
import { LmuParser } from '../../../server/sessions/parser.js';
import { TelemetryCatalog } from '../../../server/telemetry/telemetryCatalog.js';

const benchmarkDiff: ReferenceBenchmarkDiff = {
  timestamp: '2026-09-23T00:00:00.000Z',
  hasChanges: true,
  addedCount: 0,
  updatedCount: 2,
  removedCount: 0,
  totalEntries: 12,
  added: [],
  updated: [],
  removed: [],
};

// The SessionDatabase members telemetry enrichment uses to decide and read the stored matches.
const storedTelemetryLinks = {
  resetTelemetryLinksForRule: vi.fn(() => false),
  getTelemetryFiles: vi.fn(() => []),
  getStoredReplayMetadata: vi.fn(() => null),
  linkTelemetryFiles: vi.fn(),
  getTelemetryLapCacheFilenames: vi.fn(() => new Set<string>()),
};

function createContext(sessionDb: SessionDatabase = {
    getAllStoredReplayFiles: vi.fn(() => []),
  } as unknown as SessionDatabase): ServerContext {

  return new ServerContext({
    resultsDir: '',
    replaysDir: '',
    telemetryDir: '',
    parser: new LmuParser(),
    sessionDb,
    telemetryCatalog: {} as TelemetryCatalog,
    replayCache: {} as ReplayCacheService,
  });
}

function createCompletedReplayIterator() {
  return (async function* () {
    return {
      added: 2,
      updated: 1,
      skipped: 3,
      total: 6,
      lastSyncedAt: '2026-09-23T00:00:00.000Z',
      interrupted: false,
    };
  })();
}

function createCompletedSessionIterator() {
  return (async function* () {
    return {
      added: 4,
      updated: 1,
      total: 5,
      lastSyncedAt: '2026-09-23T00:00:00.000Z',
    };
  })();
}

function createFailingSessionIterator() {
  return (async function* () {
    throw new Error('Results directory unavailable');
  })();
}

function createProgressingReplayIterator() {
  return (async function* () {
    yield { processed: 0, total: 1, currentFile: 'Spa P1.Vcr', stage: 'Decoding telemetry and events', filePercent: 50 };
    return {
      added: 1,
      updated: 0,
      skipped: 0,
      total: 1,
      lastSyncedAt: '2026-09-23T00:00:00.000Z',
      interrupted: false,
    };
  })();
}

function createProgressingSessionIterator() {
  return (async function* () {
    yield { processed: 2, total: 5, currentFile: '2026_09_25_12_00_00-01R1.xml', stage: 'Reading XML session log', filePercent: 5 };
    return {
      added: 1,
      updated: 0,
      total: 5,
      lastSyncedAt: '2026-09-25T00:00:00.000Z',
    };
  })();
}

describe('ServerContext background session sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records the completed session scan and starts replay indexing once', async () => {
    const sessionDb = {
      getAllStoredReplayFiles: vi.fn(() => []),
      syncSessionsAsyncIterator: vi.fn(createCompletedSessionIterator),
      syncReplaysAsyncIterator: vi.fn(createCompletedReplayIterator),
    } as unknown as SessionDatabase;
    const context = createContext(sessionDb);

    context.runInitialSessionSyncInBackground();
    context.runInitialSessionSyncInBackground();

    expect(context.getScanStatus().sessionScan).toMatchObject({ running: true, result: null, error: null });

    await vi.runAllTimersAsync();

    expect(sessionDb.syncSessionsAsyncIterator).toHaveBeenCalledTimes(1);
    expect(sessionDb.syncReplaysAsyncIterator).toHaveBeenCalledTimes(1);
    expect(context.getScanStatus()).toMatchObject({
      running: false,
      processed: 0,
      total: 0,
      result: { added: 2, updated: 1, skipped: 3, total: 6, interrupted: false },
      error: null,
      sessionScan: {
        running: false,
        result: { added: 4, updated: 1, total: 5 },
        error: null,
      },
    });
    expect(context.getScanStatus().sessionScan.finishedAt).not.toBeNull();
    expect(context.getScanStatus().finishedAt).not.toBeNull();
  });

  it('reports a session scan error and still runs replay indexing', async () => {
    const sessionDb = {
      getAllStoredReplayFiles: vi.fn(() => []),
      syncSessionsAsyncIterator: vi.fn(createFailingSessionIterator),
      syncReplaysAsyncIterator: vi.fn(createCompletedReplayIterator),
    } as unknown as SessionDatabase;
    const context = createContext(sessionDb);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    context.runInitialSessionSyncInBackground();
    await vi.runAllTimersAsync();

    expect(sessionDb.syncReplaysAsyncIterator).toHaveBeenCalledTimes(1);
    expect(context.getScanStatus()).toMatchObject({
      running: false,
      sessionScan: {
        running: false,
        result: null,
        error: 'Results directory unavailable',
      },
    });
    expect(warn).toHaveBeenCalledWith('[SQLite Cache] Initial sync warning:', expect.any(Error));
  });

  it('publishes XML file and stage progress before session scanning completes', async () => {
    const sessionDb = {
      getAllStoredReplayFiles: vi.fn(() => []),
      syncSessionsAsyncIterator: vi.fn(createProgressingSessionIterator),
      syncReplaysAsyncIterator: vi.fn(createCompletedReplayIterator),
    } as unknown as SessionDatabase;
    const context = createContext(sessionDb);

    context.runSessionSyncInBackground();
    await vi.runOnlyPendingTimersAsync();

    expect(context.getScanStatus().sessionScan).toMatchObject({
      running: true,
      processed: 2,
      total: 5,
      currentFile: '2026_09_25_12_00_00-01R1.xml',
      currentStage: 'Reading XML session log',
      filePercent: 5,
    });
  });

  it('refuses directory reconfiguration while a session scan is active', () => {
    const sessionDb = {
      getAllStoredReplayFiles: vi.fn(() => []),
      syncSessionsAsyncIterator: vi.fn(createProgressingSessionIterator),
    } as unknown as SessionDatabase;
    const context = createContext(sessionDb);

    expect(context.runSessionSyncInBackground()).toBe(true);
    expect(context.configureDirectories({ resultsDir: process.cwd() })).toBe(false);
    expect(context.resultsDir).toBe('');
  });

  it('routes forced reparsing through the guarded background iterator', () => {
    const sessionDb = {
      getAllStoredReplayFiles: vi.fn(() => []),
      getAllSessions: vi.fn(() => []),
      getTelemetryMetadata: vi.fn(() => []),
      syncSessionsFromDir: vi.fn(),
      syncSessionsAsyncIterator: vi.fn(createCompletedSessionIterator),
    } as unknown as SessionDatabase;
    const context = createContext(sessionDb);

    expect(context.loadSessions(true, true)).toEqual([]);

    expect(sessionDb.syncSessionsFromDir).not.toHaveBeenCalled();
    expect(sessionDb.syncSessionsAsyncIterator).toHaveBeenCalledWith('', expect.any(LmuParser), true);
  });

  it('queues a forced session reparse until replay indexing finishes', async () => {
    const sessionDb = {
      getAllStoredReplayFiles: vi.fn(() => []),
      getAllSessions: vi.fn(() => []),
      getTelemetryMetadata: vi.fn(() => []),
      syncReplaysAsyncIterator: vi.fn(createProgressingReplayIterator),
      syncSessionsAsyncIterator: vi.fn(createCompletedSessionIterator),
    } as unknown as SessionDatabase;
    const context = createContext(sessionDb);

    expect(context.runReplaySyncInBackground()).toBe(true);
    context.loadSessions(true, true);
    expect(sessionDb.syncSessionsAsyncIterator).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(sessionDb.syncSessionsAsyncIterator).toHaveBeenCalledTimes(1);
    expect(sessionDb.syncSessionsAsyncIterator).toHaveBeenCalledWith('', expect.any(LmuParser), true);
  });
});

describe('ServerContext configuration and telemetry enrichment', () => {
  it('enriches the cached session list again only when one of its inputs changed', () => {
    const sessions: DetailedSession[] = [];
    let telemetryRevision = 0;
    let files: unknown[] = [];
    const sessionDb = {
      getAllStoredReplayFiles: vi.fn(() => []),
      getAllSessions: vi.fn(() => sessions),
      getTelemetryMetadata: vi.fn(() => []),
      getTelemetryMetadataRevision: vi.fn(() => telemetryRevision),
    } as unknown as SessionDatabase;
    const context = new ServerContext({
      resultsDir: '', replaysDir: '', telemetryDir: '', parser: new LmuParser(), sessionDb,
      telemetryCatalog: { getFiles: vi.fn(() => files) } as unknown as TelemetryCatalog,
      replayCache: {} as ReplayCacheService,
    });
    const enrich = vi.spyOn(context, 'enrichSessionsWithTelemetry');

    context.loadSessions();
    context.loadSessions();
    expect(enrich).toHaveBeenCalledTimes(1);

    telemetryRevision++;
    context.loadSessions();
    files = [];
    context.loadSessions();
    context.currentParser.addReplayEntry({ name: 'Spa P1.Vcr', path: 'C:\replays\Spa P1.Vcr', sizeBytes: 1, sessionCode: 'P1', trackName: 'Spa', mtime: 1 });
    context.loadSessions();
    expect(enrich).toHaveBeenCalledTimes(4);
    context.loadSessions();
    expect(enrich).toHaveBeenCalledTimes(4);
  });

  it('reloads the replay index from the database only when replay rows changed', () => {
    let replayRevision = 0;
    const sessionDb = {
      getAllStoredReplayFiles: vi.fn(() => []),
      getAllSessions: vi.fn(() => []),
      getTelemetryMetadata: vi.fn(() => []),
      getReplayMetadataRevision: vi.fn(() => replayRevision),
    } as unknown as SessionDatabase;
    const context = createContext(sessionDb);
    const reads = vi.mocked(sessionDb.getAllStoredReplayFiles);
    expect(reads).toHaveBeenCalledTimes(1);

    context.loadSessions();
    context.loadSessions();
    expect(reads).toHaveBeenCalledTimes(1);

    replayRevision++;
    context.loadSessions();
    context.loadSessions();
    expect(reads).toHaveBeenCalledTimes(2);

    // A new parser (directories reconfigured) starts from an empty index.
    context.configureDirectories({});
    expect(reads).toHaveBeenCalledTimes(3);
  });

  it('uses valid configured directories and persists the telemetry directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-context-'));
    const resultsDir = path.join(root, 'results');
    const replaysDir = path.join(root, 'replays');
    const telemetryDir = path.join(root, 'telemetry');
    fs.mkdirSync(resultsDir);
    fs.mkdirSync(replaysDir);
    fs.mkdirSync(telemetryDir);
    const sessionDb = {
      getAllStoredReplayFiles: vi.fn(() => []),
      setMetadata: vi.fn(),
      clearTelemetryCache: vi.fn(),
    } as unknown as SessionDatabase;
    const telemetryCatalog = { clear: vi.fn() } as unknown as TelemetryCatalog;
    const context = new ServerContext({
      resultsDir: '',
      replaysDir: '',
      telemetryDir: '',
      parser: new LmuParser(),
      sessionDb,
      telemetryCatalog,
      replayCache: {} as ReplayCacheService,
    });

    try {
      context.configureDirectories({ resultsDir, replaysDir, telemetryDir, playerName: ' Test Driver ' });

      expect(context.resultsDir).toBe(resultsDir);
      expect(context.replaysDir).toBe(replaysDir);
      expect(context.telemetryDir).toBe(telemetryDir);
      expect(context.currentParser.configuredPlayerName).toBe('Test Driver');
      expect(sessionDb.setMetadata).toHaveBeenCalledWith('telemetry_dir', telemetryDir);
      expect(sessionDb.clearTelemetryCache).toHaveBeenCalledTimes(1);
      expect(telemetryCatalog.clear).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('matches a replay and restores cached telemetry metadata for a session', () => {
    const sessionDb = {
      getAllStoredReplayFiles: vi.fn(() => []),
      getTelemetryMetadata: vi.fn(() => [{
        filename: 'Spa_P1.duckdb',
        filePath: 'C:\\telemetry\\Spa_P1.duckdb',
        matchedSessionId: null,
        matchedReplayFilename: 'Spa P1.Vcr',
      }]),
      ...storedTelemetryLinks,
      // Not on disk: its cached laps keep serving it.
      getTelemetryLapCacheFilenames: vi.fn(() => new Set(['Spa_P1.duckdb'])),
      updateSessionMatchingReplay: vi.fn(),
    } as unknown as SessionDatabase;
    const telemetryCatalog = {
      getFiles: vi.fn(() => []),
    } as unknown as TelemetryCatalog;
    const context = new ServerContext({
      resultsDir: '',
      replaysDir: '',
      telemetryDir: '',
      parser: new LmuParser(),
      sessionDb,
      telemetryCatalog,
      replayCache: {} as ReplayCacheService,
    });
    vi.spyOn(context.currentParser, 'findMatchingReplay').mockReturnValue({
      name: 'Spa P1.Vcr',
      path: 'C:\\replays\\Spa P1.Vcr',
      sizeBytes: 200,
      sessionCode: 'P1',
      trackName: 'Spa',
      mtime: 1,
    });
    const session = {
      id: 'session-1',
      timestamp: 1000,
      trackVenue: 'Spa',
      trackCourse: 'GP',
      sessionType: 'Practice',
      drivers: [],
    } as unknown as DetailedSession;

    context.enrichSessionsWithTelemetry([session]);

    expect(session.matchingReplayFile).toMatchObject({ name: 'Spa P1.Vcr', hasDuckDbTelemetry: true });
    expect(session.duckdbFilename).toBe('Spa_P1.duckdb');
    expect(sessionDb.updateSessionMatchingReplay).toHaveBeenCalledTimes(2);
  });

  it('removes stale telemetry links when the active directory has no match', () => {
    const sessionDb = {
      getAllStoredReplayFiles: vi.fn(() => []),
      getTelemetryMetadata: vi.fn(() => []),
      ...storedTelemetryLinks,
      updateSessionMatchingReplay: vi.fn(),
    } as unknown as SessionDatabase;
    const telemetryCatalog = { getFiles: vi.fn(() => []) } as unknown as TelemetryCatalog;
    const context = new ServerContext({
      resultsDir: '',
      replaysDir: '',
      telemetryDir: '',
      parser: new LmuParser(),
      sessionDb,
      telemetryCatalog,
      replayCache: {} as ReplayCacheService,
    });
    const session = {
      id: 'session-1',
      timestamp: 1000,
      trackVenue: 'Spa',
      trackCourse: 'GP',
      sessionType: 'Practice',
      drivers: [],
      hasDuckDbTelemetry: true,
      duckdbFilename: 'old-directory.duckdb',
      matchingReplayFile: {
        name: 'Spa P1.Vcr',
        path: 'C:\\replays\\Spa P1.Vcr',
        sizeBytes: 200,
        hasDuckDbTelemetry: true,
        duckdbFilename: 'old-directory.duckdb',
      },
    } as unknown as DetailedSession;

    context.enrichSessionsWithTelemetry([session]);

    expect(session.hasDuckDbTelemetry).toBe(false);
    expect(session.duckdbFilename).toBeUndefined();
    expect(session.matchingReplayFile).toMatchObject({ hasDuckDbTelemetry: false });
    expect(session.matchingReplayFile?.duckdbFilename).toBeUndefined();
  });

  it('stores one session per DuckDB file and shows its telemetry on that session only', () => {
    const sessionDb = new SessionDatabase(':memory:');
    const telemetryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-telemetry-links-'));
    try {
      const filename = 'Circuit de la Sarthe_P_2026-09-14T18_37_49Z.duckdb';
      const filePath = path.join(telemetryDir, filename);
      fs.writeFileSync(filePath, '');
      const recordedAt = Date.parse('2026-09-14T18:37:49Z');
      sessionDb.upsertTelemetryMetadata({
        filename, filePath, fileMtimeMs: recordedAt, fileSizeBytes: 1024, trackName: 'Circuit de la Sarthe',
        sessionType: 'P', timestampStr: '2026-09-14T18:37:49Z', timestampEpochMs: recordedAt,
      });
      const context = createContext(sessionDb);
      const practice = (id: string, iso: string) => ({
        id, timestamp: Date.parse(iso), trackVenue: 'Circuit de la Sarthe', trackCourse: 'Circuit de la Sarthe',
        sessionType: 'Practice', sessionName: 'P1', drivers: [],
      } as unknown as DetailedSession);
      // The practice the file records, and a 0-lap session LMU saved 9 minutes later.
      const recorded = practice('14_46_14-22P1', '2026-09-14T18:37:31Z');
      const empty = practice('14_48_31-61P1', '2026-09-14T18:46:32Z');

      context.enrichSessionsWithTelemetry([empty, recorded]);

      expect(recorded).toMatchObject({ hasDuckDbTelemetry: true, duckdbFilename: filename });
      expect(empty.hasDuckDbTelemetry).toBe(false);
      expect(sessionDb.getTelemetryMetadata()[0].matchedSessionId).toBe('14_46_14-22P1');

      // Decided once: reading again with the sessions in another order changes nothing.
      context.enrichSessionsWithTelemetry([recorded, empty]);
      expect(empty.hasDuckDbTelemetry).toBe(false);
      expect(sessionDb.getTelemetryMetadata()[0].matchedSessionId).toBe('14_46_14-22P1');
    } finally {
      sessionDb.close();
      fs.rmSync(telemetryDir, { recursive: true, force: true });
    }
  });
});

describe('ServerContext reference laptime refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records a successful refresh and ignores duplicate startup requests', async () => {
    const context = createContext();
    const refresh = vi.fn().mockResolvedValue({ refreshed: true, diff: benchmarkDiff });

    context.runReferenceLaptimeRefreshInBackground(refresh);
    context.runReferenceLaptimeRefreshInBackground(refresh);

    expect(context.getScanStatus().referenceLaptimes).toMatchObject({
      started: true,
      running: true,
      checked: false,
      completedAt: null,
    });

    await vi.runAllTimersAsync();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(context.getScanStatus().referenceLaptimes).toMatchObject({
      started: true,
      running: false,
      checked: true,
      refreshed: true,
      updatedCount: 2,
      diff: benchmarkDiff,
      error: null,
    });
    expect(context.getScanStatus().referenceLaptimes.completedAt).not.toBeNull();
  });

  it('records a refresh failure without leaving the scan running', async () => {
    const context = createContext();
    const refresh = vi.fn().mockRejectedValue(new Error('Google Sheets unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    context.runReferenceLaptimeRefreshInBackground(refresh);
    await vi.runAllTimersAsync();

    expect(context.getScanStatus().referenceLaptimes).toMatchObject({
      started: true,
      running: false,
      checked: true,
      refreshed: false,
      updatedCount: 0,
      diff: null,
      error: 'Google Sheets unavailable',
    });
    expect(warn).toHaveBeenCalledWith(
      '[Reference Laptimes] Startup refresh warning:',
      expect.any(Error)
    );
  });
});

describe('ServerContext replay facts backfill', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    const lap: ReplayTrajectoryData = {
      replayName: 'A.Vcr', pointsCount: 1, currentLap: 1, driverSlot: 1, points: [{ x: 0, y: 0, z: 0, timeSec: 5 }],
      bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
    };
    db.upsertReplayTrajectoryCache('A.Vcr', 1, 1, 1, 1, lap, 'C:/gone/A.Vcr');
  });

  afterEach(() => {
    db.close();
  });

  const backfilled = (context: ServerContext) => vi.waitFor(() => expect(context.replayFacts?.getStatus().result?.replays).toBe(1));

  it('runs once the replay upgrade has finished', async () => {
    const context = createContext(db);

    expect(context.startReplayUpgradeWhenIdle()).toBe(true);

    await backfilled(context);
    expect(context.replayUpgrade?.getStatus().running).toBe(false);
  });

  it('runs straight away when the upgrade is turned off', async () => {
    const context = createContext(db);
    context.replayUpgrade?.setEnabled(false);

    expect(context.startReplayUpgradeWhenIdle()).toBe(false);

    await backfilled(context);
  });
});

describe('ServerContext replay scan progress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes worker decoding progress before the scan completes', async () => {
    const sessionDb = {
      getAllStoredReplayFiles: vi.fn(() => []),
      syncReplaysAsyncIterator: vi.fn(createProgressingReplayIterator),
    } as unknown as SessionDatabase;
    const context = createContext(sessionDb);

    context.runReplaySyncInBackground();
    await vi.runOnlyPendingTimersAsync();

    expect(context.getScanStatus()).toMatchObject({
      running: true,
      processed: 0,
      total: 1,
      currentFile: 'Spa P1.Vcr',
      currentStage: 'Decoding telemetry and events',
      filePercent: 50,
    });
  });

  describe('stored replay match re-check', () => {
    const xmlMtimeMs = Date.parse('2026-09-03T18:41:14.451Z');
    const replayRow = (filename: string, mtime: number, durationSec: number) => ({
      filename,
      file_path: 'C:\\replays\\' + filename,
      file_size: 100,
      file_mtime: mtime,
      metadata: { durationSec },
    });
    const previousRace = replayRow('Circuit de la Sarthe R1 27.Vcr', Date.parse('2026-09-03T17:41:39.560Z'), 2206);
    const ownRace = replayRow('Circuit de la Sarthe R1 28.Vcr', Date.parse('2026-09-03T18:41:14.416Z'), 2166);

    function setup(storedReplays: ReturnType<typeof replayRow>[], linkedReplay: string) {
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: xmlMtimeMs } as unknown as fs.Stats);
      const sessionDb = {
        getAllStoredReplayFiles: vi.fn(() => storedReplays),
        getTelemetryMetadata: vi.fn(() => []),
        updateSessionMatchingReplay: vi.fn(),
        rejectSessionReplayLink: vi.fn((_id: string, link: { name: string }, reason: string) => ({ replayName: link.name, reason, rejectedAt: 1 })),
        getRejectedReplayLinks: vi.fn(() => new Map()),
      } as unknown as SessionDatabase;
      const context = new ServerContext({
        resultsDir: '',
        replaysDir: '',
        telemetryDir: '',
        parser: new LmuParser(),
        sessionDb,
        telemetryCatalog: { getFiles: vi.fn(() => []) } as unknown as TelemetryCatalog,
        replayCache: {} as ReplayCacheService,
      });
      const session = {
        id: '2026_09_03_14_41_14-69R1',
        filePath: 'C:\\results\\2026_09_03_14_41_14-69R1.xml',
        timestamp: Date.parse('2026-09-03T17:51:01.301Z'),
        trackVenue: 'Circuit de la Sarthe',
        trackCourse: '',
        sessionType: 'Race',
        sessionName: 'R1',
        drivers: [],
        matchingReplayFile: { name: linkedReplay, path: 'C:\\replays\\' + linkedReplay, sizeBytes: 100 },
      } as unknown as DetailedSession;
      return { context, sessionDb, session };
    }

    it('replaces a stale match with the replay saved alongside the session XML', () => {
      const { context, sessionDb, session } = setup([previousRace, ownRace], previousRace.filename);

      context.enrichSessionsWithTelemetry([session]);

      expect(session.matchingReplayFile?.name).toBe(ownRace.filename);
      expect(sessionDb.updateSessionMatchingReplay).toHaveBeenCalledWith(
        '2026_09_03_14_41_14-69R1',
        expect.objectContaining({ name: ownRace.filename })
      );
    });

    it('withdraws a match to the previous race when the session has no replay of its own', () => {
      // The previous race ended ~50 minutes before this race's XML: outside the match window.
      const { context, sessionDb, session } = setup([previousRace], previousRace.filename);

      context.enrichSessionsWithTelemetry([session]);

      expect(session.matchingReplayFile).toBeUndefined();
      expect(sessionDb.rejectSessionReplayLink).toHaveBeenCalledWith(
        '2026_09_03_14_41_14-69R1',
        expect.objectContaining({ name: previousRace.filename }),
        'time-window'
      );
      expect(sessionDb.updateSessionMatchingReplay).not.toHaveBeenCalled();
    });

    it('keeps a match to a replay that is no longer in the index: it cannot be judged', () => {
      const { context, sessionDb, session } = setup([ownRace], 'Circuit de la Sarthe R1 26.Vcr');

      context.enrichSessionsWithTelemetry([session]);

      expect(session.matchingReplayFile?.name).toBe('Circuit de la Sarthe R1 26.Vcr');
      expect(sessionDb.rejectSessionReplayLink).not.toHaveBeenCalled();
    });

    it('gives a replay claimed by two sessions to the one saved with it', () => {
      // Both XMLs are within the match window of the replay; the earlier one loses it.
      const { context, sessionDb, session } = setup([ownRace], ownRace.filename);
      const earlier = {
        ...session,
        id: '2026_09_03_14_36_00-11R1',
        filePath: 'C:\\results\\2026_09_03_14_36_00-11R1.xml',
        matchingReplayFile: { ...session.matchingReplayFile },
      } as DetailedSession;
      vi.mocked(fs.statSync).mockImplementation(((file: string) => ({
        mtimeMs: file === earlier.filePath ? xmlMtimeMs - 5 * 60_000 : xmlMtimeMs,
      })) as unknown as typeof fs.statSync);

      context.enrichSessionsWithTelemetry([earlier, session]);

      expect(session.matchingReplayFile?.name).toBe(ownRace.filename);
      expect(earlier.matchingReplayFile).toBeUndefined();
      expect(sessionDb.rejectSessionReplayLink).toHaveBeenCalledWith(earlier.id, expect.anything(), 'owned-by-other-session');
      expect(sessionDb.rejectSessionReplayLink).toHaveBeenCalledTimes(1);
    });

    it('never links a session again to a replay withdrawn from it', () => {
      const { context, sessionDb, session } = setup([ownRace], '');
      Object.assign(session, { matchingReplayFile: undefined });
      const withdrawal = { replayName: ownRace.filename, reason: 'owned-by-other-session', rejectedAt: 5 };
      vi.mocked(sessionDb.getRejectedReplayLinks).mockReturnValue(new Map([[session.id, [withdrawal]]]) as never);

      context.enrichSessionsWithTelemetry([session]);

      expect(session.matchingReplayFile).toBeUndefined();
      expect(sessionDb.updateSessionMatchingReplay).not.toHaveBeenCalled();
    });

    it('keeps a match saved alongside the session XML without searching again', () => {
      const { context, sessionDb, session } = setup([previousRace, ownRace], ownRace.filename);
      const findSpy = vi.spyOn(context.currentParser, 'findMatchingReplay');

      context.enrichSessionsWithTelemetry([session]);

      expect(session.matchingReplayFile?.name).toBe(ownRace.filename);
      expect(findSpy).not.toHaveBeenCalled();
      expect(sessionDb.updateSessionMatchingReplay).not.toHaveBeenCalled();
    });

    it('links an unmatched session once the replay sync has cached its replay, using the XML mtime', () => {
      // Session sync runs first: the new VCR is not cached yet, so the session stays unlinked.
      const storedReplays = [previousRace];
      const { context, sessionDb, session } = setup(storedReplays, '');
      Object.assign(session, { matchingReplayFile: undefined });
      // Last lap ends at 18:23:02, 18 minutes before the XML (and VCR) were written at 18:41:14;
      // an end-time estimate from laps alone would fall outside the match window.
      session.drivers = [{ laps: [{ elapsedSeconds: 1921.16 }] }] as unknown as DetailedSession['drivers'];

      context.enrichSessionsWithTelemetry([session]);
      expect(session.matchingReplayFile).toBeUndefined();

      // Replay sync completes and caches the session's own VCR, then enriches again.
      storedReplays.push(ownRace);
      context.enrichSessionsWithTelemetry([session]);

      expect(session.matchingReplayFile?.name).toBe(ownRace.filename);
      expect(sessionDb.updateSessionMatchingReplay).toHaveBeenCalledWith(
        '2026_09_03_14_41_14-69R1',
        expect.objectContaining({ name: ownRace.filename })
      );
    });
  });
});