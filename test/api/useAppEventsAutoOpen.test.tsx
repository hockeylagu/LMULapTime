import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppData } from '../../src/api/useAppData.js';
import { FakeEventSource } from '../helpers/fakeEventSource.js';

const reply = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

// A file of its own: auto-open answers the first game status of a page load, which this file's module state is.
describe('auto-open on page load', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.install();
    vi.stubGlobal('fetch', vi.fn(() => reply({ running: false, sessionsCount: 0 })));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('opens the dashboard once per page load: not again on a reconnect or when the app mounts again', async () => {
    const onGameStarted = vi.fn();
    const first = renderHook(() => useAppData({ onGameStarted }));
    await act(async () => {});
    const source = FakeEventSource.byUrl('/api/events');
    act(() => source.emit('game-running', { running: true, autoOpen: true }));
    expect(onGameStarted).toHaveBeenCalledTimes(1);

    act(() => source.emit('error'));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    act(() => FakeEventSource.instances.at(-1)!.emit('game-running', { running: true, autoOpen: true }));
    expect(onGameStarted).toHaveBeenCalledTimes(1);

    // Back from the live page: the app mounts again while LMU runs and no dashboard is connected.
    first.unmount();
    renderHook(() => useAppData({ onGameStarted }));
    await act(async () => {});
    act(() => FakeEventSource.instances.at(-1)!.emit('game-running', { running: true, autoOpen: true }));
    expect(onGameStarted).toHaveBeenCalledTimes(1);
  });
});
