import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LivePitPoller, PIT_POLL_TICK_MS, SLOW_PAUSE_MS } from '../../../server/live/livePitPoller.js';
import type { RestAnswer } from '../../../server/live/lmuPitRest.js';

const STANDINGS = [{ player: true, veFraction: 0.5, fuelFraction: 0.4, pitState: 'NONE', penalties: 0 }];

function setup(replay: boolean | null = false, answer: (path: string) => RestAnswer | null = () => null) {
  const paths: string[] = [];
  const get = vi.fn((path: string): Promise<RestAnswer> => {
    paths.push(path);
    const custom = answer(path);
    if (custom) return Promise.resolve(custom);
    if (path === '/rest/sessions/GetGameState') {
      return Promise.resolve(replay === null ? { ok: false, reason: 'status' } : { ok: true, body: { isReplayActive: replay } });
    }
    if (path === '/rest/watch/standings') return Promise.resolve({ ok: true, body: STANDINGS });
    return Promise.resolve({ ok: true, body: {} });
  });
  const onUpdate = vi.fn();
  const onReplay = vi.fn();
  const poller = new LivePitPoller({ get, onUpdate, onReplay });
  return { poller, paths, get, onUpdate, onReplay };
}

describe('LivePitPoller', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('asks nothing while off, then one request a second, the game state first', async () => {
    const t = setup();
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.get).not.toHaveBeenCalled();
    t.poller.setMode('track');
    await vi.advanceTimersByTimeAsync(10 * PIT_POLL_TICK_MS);
    expect(t.paths[0]).toBe('/rest/sessions/GetGameState');
    expect(t.paths[1]).toBe('/rest/watch/standings');
    expect(t.get.mock.calls.length).toBeLessThanOrEqual(11);
    expect(t.onUpdate).toHaveBeenCalledWith({ type: 'standings', veFraction: 0.5, fuelFraction: 0.4, pitState: 'none', penalties: 0 });
    expect(t.paths).toContain('/rest/garage/getVehicleCondition');
    t.poller.stop();
  });

  it('never reads a garage path while a replay plays or the game state is unknown, and says so', async () => {
    for (const replay of [true, null]) {
      const t = setup(replay);
      t.poller.setMode('track');
      await vi.advanceTimersByTimeAsync(40 * PIT_POLL_TICK_MS);
      expect(t.paths.some(path => path.startsWith('/rest/garage/'))).toBe(false);
      if (replay) {
        // A replay: nothing but the game state.
        expect(new Set(t.paths)).toEqual(new Set(['/rest/sessions/GetGameState']));
        expect(t.onReplay).toHaveBeenCalledWith(true);
      }
      t.poller.stop();
    }
  });

  it('reads the garage set in the garage, and pauses everything for 10 s after a slow answer', async () => {
    let slow = true;
    const t = setup(false, path => (path === '/rest/garage/getPlayerGarageData' && slow ? { ok: false, reason: 'timeout' } : null));
    t.poller.setMode('garage');
    await vi.advanceTimersByTimeAsync(3 * PIT_POLL_TICK_MS);
    expect(t.paths).toContain('/rest/garage/getPlayerGarageData');
    expect(t.paths).not.toContain('/rest/watch/standings');
    slow = false;
    const count = t.paths.length;
    // The slow answer came at 1 s: nothing until 11 s.
    await vi.advanceTimersByTimeAsync(SLOW_PAUSE_MS - 3 * PIT_POLL_TICK_MS);
    expect(t.paths.length).toBe(count);
    await vi.advanceTimersByTimeAsync(3 * PIT_POLL_TICK_MS);
    expect(t.paths.length).toBeGreaterThan(count);
    t.poller.stop();
  });
});
