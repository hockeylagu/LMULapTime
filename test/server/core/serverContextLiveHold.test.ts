import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionDatabase } from '../../../server/core/db.js';
import { ServerContext } from '../../../server/core/serverContext.js';
import type { ReplayRecordingService } from '../../../server/replay/replayRecordingService.js';
import { LmuParser } from '../../../server/sessions/parser.js';
import type { TelemetryCatalog } from '../../../server/telemetry/telemetryCatalog.js';

function createContext() {
  const metadata = new Map<string, string>();
  const sessionDb = {
    getMetadata: vi.fn((key: string) => metadata.get(key) ?? null),
    setMetadata: vi.fn((key: string, value: string) => { metadata.set(key, value); }),
    invalidateUnresolvedReplayDefaults: vi.fn(),
    reconcileReplayPlayerOwnership: vi.fn(),
    getAllStoredReplayFiles: vi.fn(() => []),
    resetTelemetryLinksForRule: vi.fn(() => false),
    getTelemetryFiles: vi.fn(() => []),
    getTelemetryMetadata: vi.fn(() => []),
    getTelemetryOwnersWithoutFile: vi.fn(() => []),
    syncSessionsAsyncIterator: vi.fn(() => (async function* () {
      return { added: 0, updated: 0, total: 0, lastSyncedAt: 'now' };
    })()),
    syncReplaysAsyncIterator: vi.fn(() => (async function* () {
      return { added: 0, updated: 0, skipped: 0, total: 0, lastSyncedAt: 'now', interrupted: false };
    })()),
  };
  const telemetryCatalog = { getScanStatus: () => ({ running: false }), refresh: vi.fn(() => Promise.resolve(0)) };
  const context = new ServerContext({
    resultsDir: '', replaysDir: '', telemetryDir: '', parser: new LmuParser(),
    sessionDb: sessionDb as unknown as SessionDatabase,
    telemetryCatalog: telemetryCatalog as unknown as TelemetryCatalog,
    replayRecordings: {} as ReplayRecordingService,
  });
  return { context, sessionDb, telemetryCatalog };
}

describe('ServerContext while a game session is loaded', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts no scan, queues one refresh, and runs it when the session ends', async () => {
    const { context, sessionDb, telemetryCatalog } = createContext();
    context.setLiveSessionLoaded(true);

    context.runInitialSessionSyncInBackground();
    expect(context.runSessionSyncInBackground()).toBe(false);
    expect(context.runReplaySyncInBackground()).toBe(false);
    context.runTelemetryScanInBackground();
    expect(context.startReplayUpgradeWhenIdle()).toBe(false);
    await vi.runAllTimersAsync();

    expect(sessionDb.syncSessionsAsyncIterator).not.toHaveBeenCalled();
    expect(sessionDb.syncReplaysAsyncIterator).not.toHaveBeenCalled();
    expect(telemetryCatalog.refresh).not.toHaveBeenCalled();
    expect(context.getScanStatus()).toMatchObject({ heldForLiveSession: true, refreshQueued: true, allComplete: false });

    context.setLiveSessionLoaded(false);
    await vi.runAllTimersAsync();

    expect(sessionDb.syncSessionsAsyncIterator).toHaveBeenCalledTimes(1);
    expect(sessionDb.syncReplaysAsyncIterator).toHaveBeenCalledTimes(1);
    expect(telemetryCatalog.refresh).toHaveBeenCalledTimes(1);
    expect(context.getScanStatus()).toMatchObject({ heldForLiveSession: false, refreshQueued: false, allComplete: true });
  });

  it('carries a forced reparse through the hold', async () => {
    const { context, sessionDb } = createContext();
    context.setLiveSessionLoaded(true);
    context.requestSessionRefresh(true);
    context.setLiveSessionLoaded(false);
    await vi.runAllTimersAsync();
    expect(sessionDb.syncSessionsAsyncIterator).toHaveBeenCalledWith('', expect.anything(), true);
  });

  it('stops a running replay upgrade and starts it again when the session ends with nothing queued', () => {
    const { context } = createContext();
    const upgrade = { stop: vi.fn(), start: vi.fn(() => true), getStatus: () => ({ running: false }) };
    Object.assign(context, { replayUpgradeRunner: upgrade });
    context.setLiveSessionLoaded(true);
    expect(upgrade.stop).toHaveBeenCalled();
    context.setLiveSessionLoaded(false);
    expect(upgrade.start).toHaveBeenCalledTimes(1);
  });

  it('publishes scan-started and scan-finished once around a scan', async () => {
    const { context } = createContext();
    const seen: string[] = [];
    context.events.on('scan-started', () => seen.push('started'));
    context.events.on('scan-finished', () => seen.push('finished'));
    context.runInitialSessionSyncInBackground();
    expect(seen).toEqual(['started']);
    await vi.runAllTimersAsync();
    expect(seen).toEqual(['started', 'finished']);
  });
});
