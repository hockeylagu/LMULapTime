import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fetchLiveSettings, LIVE_SILENCE_MS, saveLiveSettings, useLiveStream } from '../../src/api/liveStream.js';
import type { LiveSnapshot } from '../../shared/types/live.js';
import { FakeEventSource } from '../helpers/fakeEventSource.js';

const snapshot = (sequence: number): LiveSnapshot => ({ sequence, receivedAt: 0, lifecycle: 'menu', paused: false, session: null });

describe('useLiveStream', () => {
  beforeEach(() => { vi.useFakeTimers(); FakeEventSource.install(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('opens one stream, goes live on a snapshot and closes on unmount', () => {
    const { result, unmount } = renderHook(() => useLiveStream());
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(result.current.connection).toBe('connecting');
    act(() => FakeEventSource.byUrl('/api/live/stream').emit('snapshot', snapshot(1)));
    expect(result.current).toMatchObject({ connection: 'live', snapshot: { sequence: 1 } });
    unmount();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it('is disconnected on an error and live again with the snapshot that follows the reconnect', () => {
    const { result } = renderHook(() => useLiveStream());
    const source = FakeEventSource.byUrl('/api/live/stream');
    act(() => source.emit('snapshot', snapshot(1)));
    act(() => source.emit('error'));
    expect(result.current.connection).toBe('disconnected');
    act(() => source.emit('snapshot', snapshot(7)));
    expect(result.current).toMatchObject({ connection: 'live', snapshot: { sequence: 7 } });
  });

  it('is disconnected after 2.5 heartbeats of silence, and any message resets the clock', () => {
    const { result } = renderHook(() => useLiveStream());
    const source = FakeEventSource.byUrl('/api/live/stream');
    act(() => source.emit('snapshot', snapshot(1)));
    act(() => { vi.advanceTimersByTime(LIVE_SILENCE_MS - 1000); });
    act(() => source.emit('heartbeat', { at: 1 }));
    act(() => { vi.advanceTimersByTime(LIVE_SILENCE_MS - 1000); });
    expect(result.current.connection).toBe('live');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.connection).toBe('disconnected');
  });

  it('hands pedal batches to the callback without rendering', () => {
    const onPedals = vi.fn();
    let renders = 0;
    renderHook(() => { renders += 1; return useLiveStream({ onPedals }); });
    const source = FakeEventSource.byUrl('/api/live/stream');
    act(() => source.emit('snapshot', snapshot(1)));
    const before = renders;
    act(() => { for (let i = 0; i < 50; i += 1) source.emit('pedals', { samples: [{ t: i, throttle: 1, brake: 0 }] }); });
    expect(onPedals).toHaveBeenCalledTimes(50);
    expect(renders).toBe(before);
  });
});

describe('live settings requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads and saves through the API client', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ autoOpen: false }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchLiveSettings()).resolves.toEqual({ autoOpen: false });
    await saveLiveSettings({ autoOpen: false });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/live/settings', expect.objectContaining({ method: 'POST', body: '{"autoOpen":false}' }));
  });
});
