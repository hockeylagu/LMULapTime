import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppData } from '../../src/api/useAppData.js';
import { APP_EVENT_ERROR_GRACE_MS, APP_EVENT_SILENCE_MS } from '../../src/api/useAppEvents.js';
import { LIVE_HEARTBEAT_MS } from '../../shared/types/live.js';
import { FakeEventSource } from '../helpers/fakeEventSource.js';

const idleScan = {
  running: false, processed: 0, total: 0, currentFile: null, startedAt: null, finishedAt: null, result: null, error: null,
  dataRevision: 'server:0', sessionScan: { running: false, startedAt: null, finishedAt: null, result: null, error: null },
  referenceLaptimes: { started: true, running: false, checked: true, completedAt: null, refreshed: false, diff: null, error: null },
};
const reply = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('app event stream', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => url === path).length;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.install();
    fetchMock = vi.fn((url: string) => reply(url === '/api/scan/status' ? idleScan : { sessionsCount: 0 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('restarts the idle scan polling when the server starts a scan, and reloads data when it finishes', async () => {
    const { unmount } = renderHook(() => useAppData());
    await act(async () => {});
    expect(FakeEventSource.instances.map((s) => s.url)).toEqual(['/api/events']);
    const idlePolls = calls('/api/scan/status');
    const idleLoads = calls('/api/status');
    expect(idlePolls).toBe(1);

    await act(async () => { FakeEventSource.byUrl('/api/events').emit('scan-started', { at: 1 }); });
    expect(calls('/api/scan/status')).toBe(idlePolls + 1);
    expect(calls('/api/status')).toBe(idleLoads);

    await act(async () => { FakeEventSource.byUrl('/api/events').emit('scan-finished', { at: 2 }); });
    expect(calls('/api/scan/status')).toBe(idlePolls + 2);
    expect(calls('/api/status')).toBe(idleLoads + 1);

    unmount();
    expect(FakeEventSource.byUrl('/api/events').closed).toBe(true);
  });

  it('hands the game start to the page, which switches itself to the dashboard', async () => {
    const onGameStarted = vi.fn();
    renderHook(() => useAppData({ onGameStarted }));
    await act(async () => {});
    await act(async () => { FakeEventSource.byUrl('/api/events').emit('game-started', { at: 1 }); });
    expect(onGameStarted).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('honors auto-open=%s when the first status says LMU is already running', async autoOpen => {
    const onGameStarted = vi.fn();
    const { result } = renderHook(() => useAppData({ onGameStarted }));
    await act(async () => {});
    const source = FakeEventSource.byUrl('/api/events');
    act(() => source.emit('game-running', { running: true, autoOpen }));
    expect(result.current.gameRunning).toBe(true);
    expect(onGameStarted).toHaveBeenCalledTimes(autoOpen ? 1 : 0);
    act(() => source.emit('error'));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    act(() => FakeEventSource.byUrl('/api/events').emit('game-running', { running: true, autoOpen: true }));
    expect(onGameStarted).toHaveBeenCalledTimes(autoOpen ? 1 : 0);
  });

  it('keeps the game status through a stream error the reconnect answers, and clears it when none answers', async () => {
    const { result } = renderHook(() => useAppData());
    await act(async () => {});
    const source = FakeEventSource.byUrl('/api/events');
    act(() => source.emit('game-running', { running: true }));
    act(() => source.emit('error'));
    expect(result.current.gameRunning).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    const reconnected = FakeEventSource.byUrl('/api/events');
    act(() => reconnected.emit('game-running', { running: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(APP_EVENT_ERROR_GRACE_MS); });
    expect(result.current.gameRunning).toBe(true);
    act(() => reconnected.emit('error'));
    await act(async () => { await vi.advanceTimersByTimeAsync(APP_EVENT_ERROR_GRACE_MS); });
    expect(result.current.gameRunning).toBe(false);
  });

  it.each(['error', 'silence'])('clears stale game status after stream %s and restores it on reconnect', async reason => {
    const { result, unmount } = renderHook(() => useAppData());
    await act(async () => {});
    const source = FakeEventSource.byUrl('/api/events');
    act(() => source.emit('game-running', { running: true }));
    expect(result.current.gameRunning).toBe(true);
    await act(async () => {
      if (reason === 'error') { source.emit('error'); await vi.advanceTimersByTimeAsync(APP_EVENT_ERROR_GRACE_MS); }
      else await vi.advanceTimersByTimeAsync(APP_EVENT_SILENCE_MS);
    });
    expect(result.current.gameRunning).toBe(false);
    expect(source.closed).toBe(true);
    if (reason === 'silence') await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    const reconnected = FakeEventSource.byUrl('/api/events');
    expect(reconnected).not.toBe(source);
    act(() => reconnected.emit('game-running', { running: true }));
    expect(result.current.gameRunning).toBe(true);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(APP_EVENT_SILENCE_MS + 2000); });
    expect(FakeEventSource.byUrl('/api/events')).toBe(reconnected);
  });

  it('keeps a healthy game status while heartbeats continue', async () => {
    const { result } = renderHook(() => useAppData());
    await act(async () => {});
    const source = FakeEventSource.byUrl('/api/events');
    act(() => source.emit('game-running', { running: true }));
    for (let i = 0; i < 4; i += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(LIVE_HEARTBEAT_MS); source.emit('heartbeat'); });
    }
    expect(result.current.gameRunning).toBe(true);
    expect(source.closed).toBe(false);
  });

  it('keeps whether LMU is running, so the page can offer the dashboard', async () => {
    const { result } = renderHook(() => useAppData());
    await act(async () => {});
    expect(result.current.gameRunning).toBe(false);
    await act(async () => { FakeEventSource.byUrl('/api/events').emit('game-running', { running: true }); });
    expect(result.current.gameRunning).toBe(true);
    await act(async () => { FakeEventSource.byUrl('/api/events').emit('game-running', { running: false }); });
    expect(result.current.gameRunning).toBe(false);
  });
});
