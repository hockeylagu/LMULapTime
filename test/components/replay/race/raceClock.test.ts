import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRaceClock } from '../../../../src/components/replay/race/raceClock.js';
import { createRacePoseCache } from '../../../../src/components/replay/race/racePoseCache.js';
import type { RacePoseWindow } from '../../../../shared/domain/raceReplay/poseWindow.js';

describe('createRaceClock', () => {
  let frames: Array<(time: number) => void>;
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
  });
  afterEach(() => vi.unstubAllGlobals());
  const frame = (time: number) => { const next = frames.shift(); next?.(time); };

  it('runs the session clock at the playback speed and stops at the end', () => {
    const clock = createRaceClock(10, 20, 12);
    const listener = vi.fn();
    clock.subscribe(listener);
    clock.setSpeed(4);
    clock.setPlaying(true);
    frame(1000);
    frame(1200);
    expect(clock.getState().timeSec).toBeCloseTo(12.8);
    frame(3200); // a long frame counts as 0.25 s at most
    expect(clock.getState().timeSec).toBeCloseTo(13.8);
    clock.seek(19.9);
    frame(3300);
    expect(clock.getState()).toMatchObject({ timeSec: 20, playing: false });
    expect(listener).toHaveBeenCalled();
  });

  it('restarts from the start when played at the end, and keeps seeks inside the session', () => {
    const clock = createRaceClock(10, 20, 30);
    expect(clock.getState().timeSec).toBe(20);
    clock.setPlaying(true);
    expect(clock.getState()).toMatchObject({ timeSec: 10, playing: true });
    clock.setPlaying(true);
    clock.seek(-4);
    expect(clock.getState().timeSec).toBe(10);
    clock.setPlaying(false);
    clock.dispose();
    expect(frames).toHaveLength(0);
  });
});

describe('createRacePoseCache', () => {
  const window = (index: number) => ({ fromSec: index * 60, hz: 10, count: 601, slots: [], data: new Float32Array(0) }) as RacePoseWindow;

  it('loads the window under the clock, fetches the next past half way and drops far windows', async () => {
    const fetchWindow = vi.fn((index: number) => Promise.resolve(window(index)));
    const onChange = vi.fn();
    const cache = createRacePoseCache(60, fetchWindow, onChange);

    expect(cache.windowAt(10)).toBeNull();
    expect(cache.isLoading(10)).toBe(true);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(cache.windowAt(10)?.fromSec).toBe(0);
    expect(fetchWindow).toHaveBeenCalledTimes(1);

    cache.windowAt(40);
    expect(fetchWindow).toHaveBeenLastCalledWith(1, expect.any(AbortSignal));
    for (let i = 2; i < 10; i++) cache.windowAt(i * 60);
    await vi.waitFor(() => expect(cache.windowAt(9 * 60)).not.toBeNull());
    expect(cache.windowAt(9 * 60 + 1)).not.toBeNull();
    cache.dispose();
  });

  it('remembers a failed window until retried', async () => {
    const fetchWindow = vi.fn(() => Promise.reject(new Error('gone')));
    const onChange = vi.fn();
    const cache = createRacePoseCache(60, fetchWindow, onChange);
    cache.windowAt(5);
    await vi.waitFor(() => expect(cache.errorAt(5)).toBe('gone'));
    cache.windowAt(5);
    expect(fetchWindow).toHaveBeenCalledTimes(1);
    cache.retry();
    cache.windowAt(5);
    expect(fetchWindow).toHaveBeenCalledTimes(2);
  });
});
