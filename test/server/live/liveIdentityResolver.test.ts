import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveIdentityResolver, NAVIGATION_POLL_MS } from '../../../server/live/liveIdentityResolver.js';
import type { NavigationRead } from '../../../server/live/lmuNavigation.js';
import type { LiveSessionInfo } from '../../../shared/types/live.js';

function session(overrides: Partial<LiveSessionInfo> = {}): LiveSessionInfo {
  return {
    kind: 'practice', sessionCode: 1, gamePhase: 5, inRealtime: true, trackName: 'Circuit de la Sarthe',
    vehicleName: 'DKR Engineering #4:ELMS25 1.09', vehicleClass: 'LMP3', elapsedSeconds: 10, endSeconds: null,
    playerLapsCompleted: 0, playerPlace: 1, ...overrides,
  };
}

const LE_MANS: NavigationRead = { ok: true, navigation: { sceneDesc: 'LEMANSWEC', classes: ['LMP3'], vehFile: null } };
const MULSANNE: NavigationRead = { ok: true, navigation: { sceneDesc: 'LEMANSWEC_MULSANNE', classes: ['LMP3'], vehFile: null } };
const FAILED: NavigationRead = { ok: false };

function setup(answers: NavigationRead[]) {
  const reads = vi.fn<() => Promise<NavigationRead>>();
  for (const answer of answers) reads.mockResolvedValueOnce(answer);
  reads.mockResolvedValue(LE_MANS);
  const onChange = vi.fn();
  const personalBest = vi.fn((layoutKey: string) => (layoutKey === 'sarthe_full' ? 228.4 : null));
  const resolver = new LiveIdentityResolver({ readNavigation: reads, onChange, personalBest, now: () => Date.now() });
  return { resolver, reads, onChange, personalBest };
}

describe('LiveIdentityResolver', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('resolves at once from the names the game reports, then exactly from LMU when the session loads', async () => {
    const t = setup([LE_MANS]);
    t.resolver.update(session());
    expect(t.resolver.identity).toMatchObject({ layoutKey: null, carClass: 'LMP3', personalBestSeconds: null });
    expect(t.reads).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.reads).toHaveBeenCalledTimes(1);
    expect(t.resolver.identity).toMatchObject({ layoutKey: 'sarthe_full', carClass: 'LMP3', personalBestSeconds: 228.4 });
    expect(t.onChange).toHaveBeenCalledTimes(1);
  });

  it('asks again every 30 s while loaded, and reports only a changed identity', async () => {
    const t = setup([LE_MANS, LE_MANS, MULSANNE]);
    t.resolver.update(session());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(NAVIGATION_POLL_MS);
    expect(t.reads).toHaveBeenCalledTimes(2);
    expect(t.onChange).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(NAVIGATION_POLL_MS);
    expect(t.resolver.identity?.layoutKey).toBe('sarthe_mulsanne');
    expect(t.onChange).toHaveBeenCalledTimes(2);
  });

  it('asks nothing while shared, takes the offered answers, and asks again 30 s after the last one when unshared', async () => {
    const t = setup([]);
    t.resolver.setShared(true);
    t.resolver.update(session());
    await vi.advanceTimersByTimeAsync(NAVIGATION_POLL_MS * 3);
    expect(t.reads).not.toHaveBeenCalled();
    t.resolver.offerNavigation({ sceneDesc: 'LEMANSWEC_MULSANNE', classes: ['LMP3'], vehFile: null });
    expect(t.resolver.identity?.layoutKey).toBe('sarthe_mulsanne');
    expect(t.onChange).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    t.resolver.setShared(false);
    await vi.advanceTimersByTimeAsync(NAVIGATION_POLL_MS - 10_001);
    expect(t.reads).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.reads).toHaveBeenCalledTimes(1);
    expect(t.resolver.identity?.layoutKey).toBe('sarthe_full');
  });

  it('ignores an offered answer while no session is loaded', () => {
    const t = setup([]);
    t.resolver.offerNavigation({ sceneDesc: 'LEMANSWEC', classes: ['LMP3'], vehFile: null });
    expect(t.resolver.identity).toBeNull();
    expect(t.onChange).not.toHaveBeenCalled();
  });

  it('stays quiet while no session is loaded and stops asking when it unloads', async () => {
    const t = setup([]);
    t.resolver.update(null);
    await vi.advanceTimersByTimeAsync(NAVIGATION_POLL_MS * 3);
    expect(t.reads).not.toHaveBeenCalled();
    t.resolver.update(session());
    await vi.advanceTimersByTimeAsync(0);
    t.resolver.update(null);
    expect(t.resolver.identity).toBeNull();
    await vi.advanceTimersByTimeAsync(NAVIGATION_POLL_MS * 3);
    expect(t.reads).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('backs off 30 s after a failed or slow read, a new session included', async () => {
    const t = setup([FAILED, LE_MANS]);
    t.resolver.update(session());
    await vi.advanceTimersByTimeAsync(0);
    expect(t.resolver.identity?.layoutKey).toBeNull();
    t.resolver.update(session({ sessionCode: 5 }));
    await vi.advanceTimersByTimeAsync(NAVIGATION_POLL_MS - 1);
    expect(t.reads).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.reads).toHaveBeenCalledTimes(2);
    expect(t.resolver.identity?.layoutKey).toBe('sarthe_full');
  });

  it('survives a read that throws', async () => {
    const reads = vi.fn<() => Promise<NavigationRead>>(() => Promise.reject(new Error('boom')));
    const resolver = new LiveIdentityResolver({ readNavigation: reads, onChange: vi.fn(), personalBest: () => null });
    resolver.update(session());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(NAVIGATION_POLL_MS);
    expect(reads).toHaveBeenCalledTimes(2);
    expect(resolver.identity?.layoutKey).toBeNull();
  });

  it('asks again for a new session, one request at a time, and drops an answer that belongs to the old one', async () => {
    let release: (read: NavigationRead) => void = () => undefined;
    const reads = vi.fn<() => Promise<NavigationRead>>();
    reads.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    reads.mockResolvedValue(MULSANNE);
    const onChange = vi.fn();
    const resolver = new LiveIdentityResolver({ readNavigation: reads, onChange, personalBest: () => null });
    resolver.update(session());
    await vi.advanceTimersByTimeAsync(0);
    resolver.update(session({ sessionCode: 5 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toHaveBeenCalledTimes(1);
    release(LE_MANS);
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toHaveBeenCalledTimes(2);
    expect(resolver.identity?.layoutKey).toBe('sarthe_mulsanne');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('asks nothing after stop', async () => {
    const t = setup([]);
    t.resolver.update(session());
    t.resolver.stop();
    await vi.advanceTimersByTimeAsync(NAVIGATION_POLL_MS);
    expect(t.reads).not.toHaveBeenCalled();
  });
});
