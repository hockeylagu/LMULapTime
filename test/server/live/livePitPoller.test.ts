import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LivePitPoller, REPLAY_UNSAFE_CHECK_MS, PIT_POLL_TICK_MS, SLOW_PAUSE_MS } from '../../../server/live/livePitPoller.js';
import type { RestAnswer } from '../../../server/live/lmuPitRest.js';

const STATE = '/navigation/state';
const navState = (replay: boolean) => ({ state: { navigationState: 'NAV_EVENT', settingMode: replay ? 'SETTING_REPLAY_PLAYBACK' : 'SETTING_GRANDPRIX' } });
const STANDINGS = [{ player: true, veFraction: 0.5, fuelFraction: 0.4, pitState: 'NONE', penalties: 0 }];

function setup(replay: boolean | null = false, answer: (path: string) => RestAnswer | null = () => null) {
  const paths: string[] = [];
  const get = vi.fn((path: string): Promise<RestAnswer> => {
    paths.push(path);
    const custom = answer(path);
    if (custom) return Promise.resolve(custom);
    if (path === STATE) {
      return Promise.resolve(replay === null ? { ok: false, reason: 'status' } : { ok: true, body: navState(replay) });
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
    expect(t.paths[0]).toBe(STATE);
    expect(t.paths[1]).toBe('/rest/watch/standings');
    expect(t.get.mock.calls.length).toBeLessThanOrEqual(11);
    expect(t.onUpdate).toHaveBeenCalledWith({ type: 'standings', veFraction: 0.5, fuelFraction: 0.4, pitState: 'none', penalties: 0 });
    expect(t.paths).toContain('/rest/garage/getVehicleCondition');
    t.poller.stop();
  });

  it('reads nothing but the state check while a replay plays, and says so', async () => {
    const t = setup(true);
    t.poller.setMode('track');
    await vi.advanceTimersByTimeAsync(40 * PIT_POLL_TICK_MS);
    expect(new Set(t.paths)).toEqual(new Set([STATE]));
    expect(t.onReplay).toHaveBeenCalledWith(true);
    t.poller.stop();
  });

  it('keeps the replay-safe reads while the state is unknown, but never getVehicleCondition', async () => {
    const t = setup(null);
    t.poller.setMode('track');
    await vi.advanceTimersByTimeAsync(60 * PIT_POLL_TICK_MS);
    expect(t.paths).toContain('/rest/watch/standings');
    expect(t.paths).toContain('/rest/garage/PitMenu/receivePitMenu');
    expect(t.paths).not.toContain('/rest/garage/getVehicleCondition');
    t.poller.stop();
  });

  it('checks for a replay right before every getVehicleCondition, and stops every read once one starts', async () => {
    let replay = false;
    const t = setup(false, path => (path === STATE ? { ok: true, body: navState(replay) } : null));
    t.poller.setMode('track');
    await vi.advanceTimersByTimeAsync(60 * PIT_POLL_TICK_MS);
    const condition = t.paths.map((path, i) => ({ path, i })).filter(({ path }) => path === '/rest/garage/getVehicleCondition');
    expect(condition.length).toBeGreaterThan(2);
    // Every one comes straight after a state check (one tick, under REPLAY_UNSAFE_CHECK_MS).
    for (const { i } of condition) expect(t.paths[i - 1]).toBe(STATE);
    expect(PIT_POLL_TICK_MS).toBeLessThan(REPLAY_UNSAFE_CHECK_MS);
    // The replay-safe garage reads go out without a check of their own.
    const menu = t.paths.map((path, i) => ({ path, i })).filter(({ path }) => path === '/rest/garage/PitMenu/receivePitMenu');
    expect(menu.some(({ i }) => t.paths[i - 1] !== STATE)).toBe(true);
    // A replay starts (from the main menu or a session's monitor): the next check sees it and nothing else is read.
    replay = true;
    await vi.advanceTimersByTimeAsync(11 * PIT_POLL_TICK_MS);
    const count = t.paths.length;
    await vi.advanceTimersByTimeAsync(30 * PIT_POLL_TICK_MS);
    expect(new Set(t.paths.slice(count))).toEqual(new Set([STATE]));
    expect(t.onReplay).toHaveBeenLastCalledWith(true);
    t.poller.stop();
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
