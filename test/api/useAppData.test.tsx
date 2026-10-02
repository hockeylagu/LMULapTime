import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppData } from '../../src/api/useAppData.js';
import type { ScanStatus } from '../../shared/types/index.js';

const idle = (revision = 'server:0'): ScanStatus => ({ running: false, processed: 0, total: 0, currentFile: null,
  startedAt: null, finishedAt: null, result: null, error: null, dataRevision: revision,
  sessionScan: { running: false, startedAt: null, finishedAt: null, result: null, error: null },
  referenceLaptimes: { started: true, running: false, checked: true, completedAt: null, refreshed: false, updatedCount: 0, diff: null, error: null } });
const reply = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('app scan freshness', () => {
  let scan: ScanStatus;
  let count: number;
  let lap: number;
  let fetchMock: Mock<(url: string) => Promise<unknown>>;
  beforeEach(() => {
    vi.useFakeTimers(); scan = idle(); count = 0; lap = 120;
    fetchMock = vi.fn((url: string) => {
      if (url === '/api/scan/status') return reply(structuredClone(scan));
      if (url === '/api/status') return reply({ sessionsCount: 999 });
      if (url === '/api/session-snapshot') return reply({ sessions: Array.from({ length: count }, (_, i) => ({ id: String(i) })), progression: [{ bestLapTime: lap }] });
      return reply([]);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.useRealTimers());
  async function mount() {
    const hook = renderHook(() => useAppData());
    await act(async () => {});
    return hook;
  }
  async function poll() { await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); }

  it('publishes XML batches while scanning, keeps all sessions visible during replay decoding, then stops idle polling', async () => {
    scan.sessionScan.running = true;
    const { result } = await mount();
    expect(result.current.loading).toBe(false);
    count = 10; scan.dataRevision = 'server:10'; await poll();
    expect(result.current.sessions).toHaveLength(10);
    expect(result.current.status?.sessionsCount).toBe(10);
    scan.sessionScan.running = false; scan.sessionScan.finishedAt = 'xml-done'; scan.running = true;
    count = 12; scan.dataRevision = 'server:12'; await poll();
    expect(result.current.sessions).toHaveLength(12);
    expect(result.current.loading).toBe(false);
    scan.running = false; scan.finishedAt = 'replay-done'; await poll();
    const calls = fetchMock.mock.calls.length; await poll(); expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it('reloads a refresh that starts and finishes before its first status poll', async () => {
    const { result } = await mount();
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('?refresh=true')) { count = 2; scan = idle('server:2'); scan.finishedAt = 'fast-done'; return reply([]); }
      return answer(url);
    });
    await act(async () => { await result.current.fetchData(true); });
    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.status?.sessionsCount).toBe(2);
  });

  it('updates progression when replay conditions change without adding a session', async () => {
    count = 1; scan.running = true;
    const { result } = await mount();
    lap = 125; scan.dataRevision = 'server:rain'; await poll();
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.progression[0].bestLapTime).toBe(125);
  });

  it('ignores an old snapshot that resolves after Refresh has loaded new data', async () => {
    let resolveOld: ((value: unknown) => void) | undefined;
    const answer = fetchMock.getMockImplementation()!;
    let snapshots = 0;
    fetchMock.mockImplementation((url: string) => url === '/api/session-snapshot' && ++snapshots === 1
      ? new Promise(resolve => { resolveOld = resolve; }) : answer(url));
    const { result } = await mount();
    count = 3;
    await act(async () => { await result.current.fetchData(true); });
    expect(result.current.sessions).toHaveLength(3);
    await act(async () => { resolveOld?.({ ok: true, json: () => Promise.resolve({ sessions: [], progression: [] }) }); });
    expect(result.current.sessions).toHaveLength(3);
  });

  it('retries a failed snapshot without marking its revision as loaded', async () => {
    count = 1; scan.running = true;
    const { result } = await mount();
    const answer = fetchMock.getMockImplementation()!;
    let fail = true; scan.dataRevision = 'server:changed'; count = 2;
    fetchMock.mockImplementation((url: string) => url === '/api/session-snapshot' && fail ? Promise.reject(new Error('offline')) : answer(url));
    await poll(); expect(result.current.sessions).toHaveLength(1); expect(result.current.error).toBe('offline');
    fail = false; await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.sessions).toHaveLength(2); expect(result.current.error).toBeNull();
  });

  it('retries a Refresh request when the server is briefly unavailable', async () => {
    const { result } = await mount();
    const answer = fetchMock.getMockImplementation()!;
    let attempts = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('?refresh=true')) {
        if (++attempts === 1) return Promise.reject(new Error('Server restarting'));
        count = 2; scan = idle('restarted:2'); return reply([]);
      }
      return answer(url);
    });
    await act(async () => { await result.current.fetchData(true); });
    expect(result.current.error).toBe('Server restarting');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(attempts).toBe(2); expect(result.current.sessions).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('clears a recovered scan-status error without clearing a separate refresh error', async () => {
    let failStatus = false;
    let failRefresh = false;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/scan/status') return failStatus ? Promise.reject(new Error('transient status error')) : reply(idle());
      if (url === '/api/sessions?refresh=true') return failRefresh ? Promise.reject(new Error('refresh data error')) : reply([]);
      if (url === '/api/status') return reply({ sessionsCount: 1 });
      if (url === '/api/session-snapshot') return reply({ sessions: [{ id: 'A' }], progression: [] });
      return reply([]);
    });
    const { result } = await mount();

    failStatus = true;
    await act(async () => { result.current.refreshReplayScanStatus(); await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.error).toBe('transient status error');
    failStatus = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.error).toBeNull();

    failRefresh = true;
    await act(async () => { await result.current.fetchData(true); });
    expect(result.current.error).toBe('refresh data error');
    await act(async () => { result.current.refreshReplayScanStatus(); await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.error).toBe('refresh data error');
  });

  it('keeps polling during replay upgrades and cancels scheduled work on unmount', async () => {
    scan.replayUpgrade = { enabled: true, running: true, processed: 0, total: 1, currentFile: 'x.Vcr', currentStage: null,
      filePercent: 25, driversDone: 0, driversTotal: 1, startedAt: 'start', finishedAt: null, result: null, error: null };
    const { unmount } = await mount();
    await poll(); expect(fetchMock.mock.calls.filter(([url]) => url === '/api/scan/status')).toHaveLength(2);
    unmount(); const calls = fetchMock.mock.calls.length; await poll(); expect(fetchMock).toHaveBeenCalledTimes(calls);
  });
});
