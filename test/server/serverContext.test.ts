import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SessionDatabase } from '../../server/core/db.js';
import { ServerContext } from '../../server/core/serverContext.js';
import type { DetailedSession, ReferenceBenchmarkDiff } from '../../server/core/types.js';
import { ReplayCacheService } from '../../server/replay/replayCacheService.js';
import { LmuParser } from '../../server/sessions/parser.js';
import { TelemetryCatalog } from '../../server/telemetry/telemetryCatalog.js';

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
  return (function* () {
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
      syncSessionsFromDir: vi.fn(() => ({
        added: 4,
        updated: 1,
        total: 5,
        lastSyncedAt: '2026-09-23T00:00:00.000Z',
      })),
      syncReplaysIterator: vi.fn(createCompletedReplayIterator),
    } as unknown as SessionDatabase;
    const context = createContext(sessionDb);

    context.runInitialSessionSyncInBackground();
    context.runInitialSessionSyncInBackground();

    expect(context.getScanStatus().sessionScan).toMatchObject({ running: true, result: null, error: null });

    await vi.runAllTimersAsync();

    expect(sessionDb.syncSessionsFromDir).toHaveBeenCalledTimes(1);
    expect(sessionDb.syncReplaysIterator).toHaveBeenCalledTimes(1);
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
      syncSessionsFromDir: vi.fn(() => { throw new Error('Results directory unavailable'); }),
      syncReplaysIterator: vi.fn(createCompletedReplayIterator),
    } as unknown as SessionDatabase;
    const context = createContext(sessionDb);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    context.runInitialSessionSyncInBackground();
    await vi.runAllTimersAsync();

    expect(sessionDb.syncReplaysIterator).toHaveBeenCalledTimes(1);
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
});

describe('ServerContext configuration and telemetry enrichment', () => {
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
    } as unknown as SessionDatabase;
    const context = createContext(sessionDb);

    try {
      context.configureDirectories({ resultsDir, replaysDir, telemetryDir, playerName: ' Test Driver ' });

      expect(context.resultsDir).toBe(resultsDir);
      expect(context.replaysDir).toBe(replaysDir);
      expect(context.telemetryDir).toBe(telemetryDir);
      expect(context.currentParser.configuredPlayerName).toBe('Test Driver');
      expect(sessionDb.setMetadata).toHaveBeenCalledWith('telemetry_dir', telemetryDir);
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