import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LMU_NAVIGATION_URL, NAVIGATION_TIMEOUT_MS, parseNavigationState, readNavigationState } from '../../../server/live/lmuNavigation.js';
import type { NavigationFetch } from '../../../server/live/lmuNavigation.js';
import { NAVIGATION_STATE_LE_MANS } from '../../fixtures/live/navigationState.js';

const answer = (status: number, body: unknown) => Promise.resolve({ status, json: () => Promise.resolve(body) });

describe('LMU navigation state', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reads the exact layout and the car classes from the loading data (a JSON string)', () => {
    expect(parseNavigationState(NAVIGATION_STATE_LE_MANS)).toEqual({ sceneDesc: 'LEMANSWEC', classes: ['ELMS2025', 'Ginetta_G61LTP3_Evo', 'LMP3'] });
  });

  it('falls back to the track record of the loading status, and rejects what it cannot read', () => {
    const noLoadingData = { loadingStatus: { loadingData: null, track: { sceneDesc: 'LAGUNASECA' } } };
    expect(parseNavigationState(noLoadingData)).toEqual({ sceneDesc: 'LAGUNASECA', classes: [] });
    for (const body of [null, 'text', [], {}, { loadingStatus: {} }, { loadingStatus: { loadingData: '{broken' } }]) {
      expect(parseNavigationState(body)).toBeNull();
    }
  });

  it('asks 127.0.0.1:6397/navigation/state and nothing else, with an abort signal', async () => {
    const fetchState = vi.fn<NavigationFetch>(() => answer(200, NAVIGATION_STATE_LE_MANS));
    await expect(readNavigationState(fetchState)).resolves.toMatchObject({ ok: true, navigation: { sceneDesc: 'LEMANSWEC' } });
    expect(fetchState).toHaveBeenCalledTimes(1);
    expect(fetchState).toHaveBeenCalledWith('http://127.0.0.1:6397/navigation/state', { signal: expect.any(AbortSignal) });
    expect(LMU_NAVIGATION_URL).toBe('http://127.0.0.1:6397/navigation/state');
  });

  it('fails quietly on a non-200 answer, an unreadable body or a network error', async () => {
    await expect(readNavigationState(() => answer(503, NAVIGATION_STATE_LE_MANS))).resolves.toEqual({ ok: false });
    await expect(readNavigationState(() => answer(200, { nothing: true }))).resolves.toEqual({ ok: false });
    await expect(readNavigationState(() => Promise.reject(new Error('ECONNREFUSED')))).resolves.toEqual({ ok: false });
    await expect(readNavigationState(() => { throw new Error('sync'); })).resolves.toEqual({ ok: false });
  });

  it('gives up after 2 s and aborts the request', async () => {
    let signal: AbortSignal | undefined;
    const pending = readNavigationState((_url, init) => { signal = init.signal; return new Promise(() => undefined); });
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: false });
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
