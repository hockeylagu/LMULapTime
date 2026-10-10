import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { serverRetryDelay, useAppData } from '../../src/api/useAppData.js';
import type { ScanStatus } from '../../shared/types/index.js';
import { getCachedVehicleLogos, setCachedVehicleLogos } from '../../src/api/vehicleLogosApi.js';

const idle = (revision = 'server:0'): ScanStatus => ({ running: false, processed: 0, total: 0, currentFile: null,
  startedAt: null, finishedAt: null, result: null, error: null, dataRevision: revision,
  sessionScan: { running: false, startedAt: null, finishedAt: null, result: null, error: null },
  referenceLaptimes: { started: true, running: false, checked: true, completedAt: null, refreshed: false, updatedCount: 0, diff: null, error: null } });
const reply = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('app scan freshness', () => {
  let scan: ScanStatus;
  let count: number;

  let fetchMock: Mock<(url: string) => Promise<unknown>>;
  beforeEach(() => {
    vi.useFakeTimers(); scan = idle(); count = 0;
    fetchMock = vi.fn((url: string) => {
      if (url === '/api/scan/status') return reply(structuredClone(scan));
      if (url === '/api/status') return reply({ sessionsCount: count });
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
    expect(result.current.status?.sessionsCount).toBe(10);
    expect(result.current.status?.sessionsCount).toBe(10);
    scan.sessionScan.running = false; scan.sessionScan.finishedAt = 'xml-done'; scan.running = true;
    count = 12; scan.dataRevision = 'server:12'; await poll();
    expect(result.current.status?.sessionsCount).toBe(12);
    expect(result.current.loading).toBe(false);
    scan.running = false; scan.finishedAt = 'replay-done'; await poll();
    const calls = fetchMock.mock.calls.length; await poll(); expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it('shows a reference update once per completion, even across reloads', async () => {
    localStorage.removeItem('lmu.referenceUpdateSeen');
    scan.referenceLaptimes = { ...scan.referenceLaptimes!, completedAt: 'ref-1', updatedCount: 3 };
    const first = await mount();
    expect(first.result.current.referenceUpdateCount).toBe(3);
    first.unmount();
    const second = await mount();
    expect(second.result.current.referenceUpdateCount).toBeNull();
    scan.referenceLaptimes = { ...scan.referenceLaptimes!, completedAt: 'ref-2', updatedCount: 1 };
    second.unmount();
    const third = await mount();
    expect(third.result.current.referenceUpdateCount).toBe(1);
    third.unmount();
    localStorage.removeItem('lmu.referenceUpdateSeen');
  });

  it('reloads a refresh that starts and finishes before its first status poll', async () => {
    const { result } = await mount();
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/scan') { count = 2; scan = idle('server:2'); scan.finishedAt = 'fast-done'; return reply({ success: true }); }
      return answer(url);
    });
    await act(async () => { await result.current.fetchData(true); });
    expect(result.current.status?.sessionsCount).toBe(2);
    expect(result.current.status?.sessionsCount).toBe(2);
  });

  it('publishes a new revision when replay conditions change without adding a session', async () => {
    count = 1; scan.running = true;
    const { result } = await mount();
    const initialRevision=result.current.revision; scan.dataRevision = 'server:rain'; await poll();
    expect(result.current.status?.sessionsCount).toBe(1);
    expect(result.current.revision).toBeGreaterThan(initialRevision);
  });

  it('clears the browser logo cache when the server or data package changes', async () => {
    scan.running = true;
    let serverInstanceId = 'server-a';
    let packageRevision = 'package-a';
    fetchMock.mockImplementation((url: string) => url === '/api/status'
      ? reply({ serverInstanceId, dataPlugin: { revision: packageRevision }, sessionsCount: 1 })
      : url === '/api/scan/status' ? reply(structuredClone(scan)) : reply([]));
    const { unmount } = await mount();
    setCachedVehicleLogos({ Ferrari: '<svg/>' });
    expect(getCachedVehicleLogos()).toEqual({ Ferrari: '<svg/>' });
    serverInstanceId = 'server-b';
    scan.dataRevision = 'server-b:1';
    await poll();
    expect(getCachedVehicleLogos()).toBeNull();
    setCachedVehicleLogos({ Audi: '<svg/>' });
    packageRevision = 'package-b';
    scan.dataRevision = 'server-b:2';
    await poll();
    expect(getCachedVehicleLogos()).toBeNull();
    unmount();
  });

  it('ignores an old status response that resolves after Refresh has loaded new data', async () => {
    let resolveOld: ((value: unknown) => void) | undefined;
    const answer = fetchMock.getMockImplementation()!;
    let responses = 0;
    fetchMock.mockImplementation((url: string) => url === '/api/status' && ++responses === 1
      ? new Promise(resolve => { resolveOld = resolve; }) : answer(url));
    const { result } = await mount();
    count = 3;
    await act(async () => { await result.current.fetchData(true); });
    expect(result.current.status?.sessionsCount).toBe(3);
    await act(async () => { resolveOld?.({ ok: true, json: () => Promise.resolve({ sessionsCount:0 }) }); });
    expect(result.current.status?.sessionsCount).toBe(3);
  });

  it('retries a failed status response without marking its revision as loaded', async () => {
    count = 1; scan.running = true;
    const { result } = await mount();
    const answer = fetchMock.getMockImplementation()!;
    let fail = true; scan.dataRevision = 'server:changed'; count = 2;
    fetchMock.mockImplementation((url: string) => url === '/api/status' && fail ? Promise.reject(new Error('offline')) : answer(url));
    await poll(); expect(result.current.status?.sessionsCount).toBe(1); expect(result.current.error).toBe('offline');
    fail = false; await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.status?.sessionsCount).toBe(2); expect(result.current.error).toBeNull();
  });

  it('retries a Refresh request when the server is briefly unavailable', async () => {
    const { result } = await mount();
    const answer = fetchMock.getMockImplementation()!;
    let attempts = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/scan') {
        if (++attempts === 1) return Promise.reject(new Error('Server restarting'));
        count = 2; scan = idle('restarted:2'); return reply({ success: true });
      }
      return answer(url);
    });
    await act(async () => { await result.current.fetchData(true); });
    expect(result.current.error).toBe('Server restarting');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(attempts).toBe(2); expect(result.current.status?.sessionsCount).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('clears a recovered scan-status error without clearing a separate refresh error', async () => {
    let failStatus = false;
    let failRefresh = false;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/scan/status') return failStatus ? Promise.reject(new Error('transient status error')) : reply(idle());
      if (url === '/api/scan') return failRefresh ? Promise.reject(new Error('refresh data error')) : reply({ success: true });
      if (url === '/api/status') return reply({ sessionsCount: 1 });
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

  it('drops a stale running scan when the server stops answering, and backs off the retries', async () => {
    scan.running = true; scan.total = 10; scan.processed = 4;
    const { result } = await mount();
    expect(result.current.replayScanStatus?.running).toBe(true);

    fetchMock.mockImplementation((url: string) => url === '/api/scan/status' ? Promise.reject(new Error('fetch failed')) : reply([]));
    await poll();
    expect(result.current.replayScanStatus).toBeNull();
    expect(result.current.error).toBe('fetch failed');

    const statusCalls = () => fetchMock.mock.calls.filter(([url]) => url === '/api/scan/status').length;
    const afterFirstFailure = statusCalls();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(statusCalls()).toBe(afterFirstFailure + 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(statusCalls()).toBe(afterFirstFailure + 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(statusCalls()).toBe(afterFirstFailure + 2);
  });

  it('retries after 2 s, 4 s, 8 s and then every 15 s', () => {
    expect([1, 2, 3, 4, 5, 9].map(serverRetryDelay)).toEqual([2000, 4000, 8000, 15000, 15000, 15000]);
  });
});
