import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUE_PROBE_MS, LiveReader, PROBE_MS, STARTUP_GRACE_MS } from '../../../server/live/liveReader.js';
import type { GameProbe, LiveReaderMessage } from '../../../server/live/liveReader.js';
import { SCORING, SCORING_MAPPING_NAME, TELEMETRY, TELEMETRY_MAPPING_NAME } from '../../../server/live/rf2Layout.js';
import type { MappedBuffer } from '../../../server/live/sharedMemory.js';
import { scoringBuffer, source, telemetryBuffer } from './rf2Fixtures.js';
import type { GameProcessProbe } from '../../../server/live/gameProcess.js';

const PLAYER = { id: 12, isPlayer: true, place: 4, totalLaps: 8, name: 'Ferrari 296 GT3', className: 'GT3' };

function setup(probe: () => Promise<GameProbe> = () => Promise.resolve('session'), process?: GameProcessProbe, capture = false) {
  let scoring = scoringBuffer(2, [PLAYER]);
  let telemetry = telemetryBuffer(4, [{ id: 12, et: 100, throttle: 0.5, brake: 0 }]);
  const closes = { scoring: vi.fn(), telemetry: vi.fn() };
  const available = { value: false };
  const posted: LiveReaderMessage[] = [];
  const mappingOf = (buffer: () => Buffer, close: () => void): MappedBuffer => ({ ...source(buffer), size: buffer().length, close });
  const openMapping = vi.fn((name: string): MappedBuffer | null => {
    if (!available.value) return null;
    return name === SCORING_MAPPING_NAME ? mappingOf(() => scoring, closes.scoring) : mappingOf(() => telemetry, closes.telemetry);
  });
  const reader = new LiveReader({ openMapping, probeGame: vi.fn(probe), process, capture, post: message => posted.push(message) });
  return {
    reader, posted, openMapping, closes, available,
    setScoring: (buffer: Buffer) => { scoring = buffer; },
    setTelemetry: (buffer: Buffer) => { telemetry = buffer; },
  };
}

const lastNavigation = (posted: LiveReaderMessage[]): LiveReaderMessage | undefined =>
  posted.filter(message => message.type === 'navigation').pop();

describe('LiveReader', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('withholds durable capture until navigation confirms live play and after an inconclusive replay cue', async () => {
    let answer: GameProbe = 'busy';
    const t = setup(async () => answer, undefined, true);
    t.available.value = true;
    t.reader.start();
    await vi.advanceTimersByTimeAsync(PROBE_MS + 50);
    expect(t.posted.filter(m => m.type === 'frame').every(m => m.type === 'frame' && !m.capture)).toBe(true);
    answer = 'session';
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    t.setTelemetry(telemetryBuffer(6, [{ id: 12, et: 101, throttle: 0, brake: 0 }]));
    await vi.advanceTimersByTimeAsync(40);
    expect(t.posted.some(m => m.type === 'frame' && m.capture?.elapsedSeconds === 101)).toBe(true);
    t.posted.length = 0;
    answer = 'busy';
    t.setScoring(scoringBuffer(4, [PLAYER], { currentEt: 10 }));
    await vi.advanceTimersByTimeAsync(CUE_PROBE_MS + 100);
    t.setTelemetry(telemetryBuffer(8, [{ id: 12, et: 10, throttle: 0, brake: 0 }]));
    await vi.advanceTimersByTimeAsync(40);
    expect(t.posted.filter(m => m.type === 'frame').every(m => m.type === 'frame' && !m.capture)).toBe(true);
    t.reader.stop();
  });

  it('keeps dashboard frames flowing while capture waits, and a busy answer keeps a confirmed session', async () => {
    let answer: GameProbe = 'busy';
    const t = setup(async () => answer, undefined, true);
    t.available.value = true;
    t.reader.start();
    await vi.advanceTimersByTimeAsync(PROBE_MS + 50);
    expect(t.posted.some(m => m.type === 'frame' && m.scoring && m.capture === null)).toBe(true);
    answer = 'session';
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    answer = 'busy';
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    t.setTelemetry(telemetryBuffer(6, [{ id: 12, et: 101, throttle: 0, brake: 0 }]));
    await vi.advanceTimersByTimeAsync(40);
    expect(t.posted.some(m => m.type === 'frame' && m.capture?.elapsedSeconds === 101)).toBe(true);
    t.reader.stop();
  });

  it('detects startup before telemetry and closes stale mappings within 500 ms of exit', async () => {
    let running = false;
    const close = vi.fn();
    const t = setup(() => Promise.resolve('gone'), { read: () => running, close });
    t.reader.start();
    expect(t.openMapping).not.toHaveBeenCalled();
    running = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(t.posted).toContainEqual({ type: 'process', running: true });
    expect(t.openMapping).toHaveBeenCalled();
    // The plugin becomes available after startup. A refused REST port cannot disconnect a live process.
    t.available.value = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.posted.some(message => message.type === 'frame')).toBe(true);
    expect(t.closes.scoring).not.toHaveBeenCalled();
    running = false;
    await vi.advanceTimersByTimeAsync(500);
    expect(t.posted.slice(-2)).toEqual([{ type: 'process', running: false }, { type: 'closed' }]);
    expect(t.closes.scoring).toHaveBeenCalledTimes(1);
    expect(t.closes.telemetry).toHaveBeenCalledTimes(1);
    const count = t.posted.length;
    t.reader.stop();
    await vi.advanceTimersByTimeAsync(4000);
    expect(t.posted).toHaveLength(count);
    expect(close).toHaveBeenCalledOnce();
  });

  it('uses REST exit detection when the process query is unavailable', async () => {
    const t = setup(() => Promise.resolve('gone'), { read: () => null, close: vi.fn() });
    t.available.value = true;
    t.reader.start();
    expect(t.posted).toContainEqual({ type: 'process', running: null });
    await vi.advanceTimersByTimeAsync(STARTUP_GRACE_MS + PROBE_MS);
    expect(t.closes.scoring).toHaveBeenCalled();
    t.reader.stop();
  });

  it('ignores a pending navigation response from a process that already exited', async () => {
    let running = true;
    let resolve: (answer: GameProbe) => void = () => {};
    const t = setup(() => new Promise<GameProbe>(done => { resolve = done; }), { read: () => running, close: vi.fn() });
    t.available.value = true;
    t.reader.start();
    await vi.advanceTimersByTimeAsync(PROBE_MS + 100);
    running = false;
    await vi.advanceTimersByTimeAsync(500);
    running = true;
    await vi.advanceTimersByTimeAsync(500);
    t.posted.length = 0;
    resolve('menu');
    await Promise.resolve();
    expect(t.posted).toEqual([]);
    t.reader.stop();
  });

  it('answers closed at once without the game, tries every 3 s, then posts the first scoring and pedal frame', () => {
    const t = setup();
    t.reader.start();
    expect(t.openMapping).toHaveBeenCalledWith(SCORING_MAPPING_NAME, expect.any(Number));
    expect(t.posted).toEqual([{ type: 'closed' }]);
    t.posted.length = 0;
    t.openMapping.mockClear();
    vi.advanceTimersByTime(2999);
    expect(t.openMapping).not.toHaveBeenCalled();
    t.available.value = true;
    vi.advanceTimersByTime(1);
    expect(t.openMapping).toHaveBeenCalledWith(TELEMETRY_MAPPING_NAME, expect.any(Number));
    expect(t.posted).toEqual([{
      type: 'frame',
      scoring: expect.objectContaining({ numVehicles: 1, inRealtime: true, player: expect.objectContaining({ id: 12 }) }),
      pedal: { t: 100, throttle: 0.5, brake: 0 },
      tyreSurfaceAvgC: null,
      car: expect.objectContaining({ fuelLiters: 0, compound: '' }),
    }]);
    t.reader.stop();
  });

  it('reads at 50 Hz in realtime and posts only frames whose counter moved', () => {
    const t = setup();
    t.available.value = true;
    t.reader.start();
    t.posted.length = 0;
    vi.advanceTimersByTime(60);
    expect(t.posted).toEqual([]);
    t.setTelemetry(telemetryBuffer(5, [{ id: 12, et: 100.02, throttle: 1, brake: 0 }]));
    vi.advanceTimersByTime(20);
    expect(t.posted).toEqual([{ type: 'frame', scoring: undefined, pedal: { t: 100.02, throttle: 1, brake: 0 }, tyreSurfaceAvgC: null }]);
    t.reader.stop();
  });

  it('slows to 1 Hz outside realtime and posts no pedals', () => {
    const t = setup();
    t.setScoring(scoringBuffer(2, [PLAYER], { inRealtime: false }));
    t.available.value = true;
    t.reader.start();
    t.posted.length = 0;
    t.setScoring(scoringBuffer(3, [PLAYER], { inRealtime: false }));
    t.setTelemetry(telemetryBuffer(5, [{ id: 12, et: 101, throttle: 1, brake: 0 }]));
    vi.advanceTimersByTime(999);
    expect(t.posted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(t.posted).toHaveLength(1);
    expect(t.posted[0]).toMatchObject({ type: 'frame', pedal: undefined });
    t.reader.stop();
  });

  it('asks the game every 2 s, and unmaps when it is gone', async () => {
    const answers: GameProbe[] = ['session', 'gone'];
    const probe = vi.fn(() => Promise.resolve(answers.shift() ?? 'gone'));
    const t = setup(probe);
    t.available.value = true;
    t.reader.start();
    await vi.advanceTimersByTimeAsync(PROBE_MS - 100);
    expect(probe).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(t.closes.scoring).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(t.posted[t.posted.length - 1]).toEqual({ type: 'closed' });
    expect(t.closes.scoring).toHaveBeenCalled();
    expect(t.closes.telemetry).toHaveBeenCalled();
    // Back to the 3 s check, and a game that starts again is picked up.
    t.posted.length = 0;
    await vi.advanceTimersByTimeAsync(3000);
    expect(t.posted).toEqual([expect.objectContaining({ type: 'frame' })]);
    t.reader.stop();
  });

  it.each(['scoring', 'telemetry'])('detects exit with a frozen half-written %s buffer', async buffer => {
    const probe = vi.fn(() => Promise.resolve<GameProbe>('session'));
    const t = setup(probe);
    t.available.value = true;
    t.reader.start();
    await vi.advanceTimersByTimeAsync(5100);
    if (buffer === 'scoring') {
      const torn = scoringBuffer(3, [PLAYER]);
      torn.writeUInt32LE(2, SCORING.versionEnd);
      t.setScoring(torn);
    } else {
      const torn = telemetryBuffer(5, [{ id: 12, et: 101, throttle: 1, brake: 0 }]);
      torn.writeUInt32LE(4, TELEMETRY.versionEnd);
      t.setTelemetry(torn);
    }
    probe.mockImplementation(() => Promise.resolve<GameProbe>('gone'));
    await vi.advanceTimersByTimeAsync(5100);
    expect(t.posted).toContainEqual({ type: 'closed' });
    expect(t.closes.scoring).toHaveBeenCalledOnce();
    expect(t.closes.telemetry).toHaveBeenCalledOnce();
    t.reader.stop();
  });

  it('stays open while a paused game still answers, asking again no sooner than every 2 s', async () => {
    const probe = vi.fn(() => Promise.resolve<GameProbe>('session'));
    const t = setup(probe);
    t.available.value = true;
    t.reader.start();
    await vi.advanceTimersByTimeAsync(PROBE_MS + 100);
    expect(probe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PROBE_MS - 300);
    expect(probe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(t.closes.scoring).not.toHaveBeenCalled();
    t.reader.stop();
    expect(t.closes.scoring).toHaveBeenCalledTimes(1);
  });

  it('keeps a loading game (mapping there, REST port not yet) until it answers once, or for the start-up grace', async () => {
    const probe = vi.fn(() => Promise.resolve<GameProbe>('gone'));
    const t = setup(probe);
    t.available.value = true;
    t.reader.start();
    await vi.advanceTimersByTimeAsync(STARTUP_GRACE_MS - 1000);
    expect(probe.mock.calls.length).toBeGreaterThan(10);
    expect(t.closes.scoring).not.toHaveBeenCalled();
    expect(t.posted).not.toContainEqual({ type: 'closed' });
    await vi.advanceTimersByTimeAsync(6000);
    expect(t.closes.scoring).toHaveBeenCalledTimes(1);
    expect(t.posted).toContainEqual({ type: 'closed' });
    t.reader.stop();
  });

  it('keeps asking every 2 s while the counters move, and unmaps on a refusal once the game has answered', async () => {
    const probe = vi.fn(() => Promise.resolve<GameProbe>('session'));
    const t = setup(probe);
    t.available.value = true;
    t.reader.start();
    for (let version = 3; version < 23; version += 1) {
      t.setScoring(scoringBuffer(version, [PLAYER]));
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(probe).toHaveBeenCalledTimes(10);
    probe.mockImplementation(() => Promise.resolve<GameProbe>('gone'));
    await vi.advanceTimersByTimeAsync(PROBE_MS + 100);
    expect(t.posted).toContainEqual({ type: 'closed' });
    t.reader.stop();
  });

  it('holds the frames after the clock jumps back until the game answers, and says when it is a replay', async () => {
    const probe = vi.fn(() => Promise.resolve<GameProbe>('session'));
    const t = setup(probe);
    t.available.value = true;
    t.reader.start();
    await vi.advanceTimersByTimeAsync(PROBE_MS + 100);
    const asked = probe.mock.calls.length;
    probe.mockImplementation(() => Promise.resolve<GameProbe>('replay'));
    t.posted.length = 0;
    // A replay starts from the monitor: the clock goes back to the start of the session.
    t.setScoring(scoringBuffer(3, [PLAYER], { currentEt: 0 }));
    await vi.advanceTimersByTimeAsync(CUE_PROBE_MS - 200);
    expect(t.posted).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(probe.mock.calls.length).toBe(asked + 1);
    expect(t.posted).toEqual([{ type: 'navigation', screen: 'replay', loadingProgress: null }]);
    // The answer clears the hold: the next frame goes out again.
    t.setScoring(scoringBuffer(4, [PLAYER], { currentEt: 0.2 }));
    await vi.advanceTimersByTimeAsync(40);
    expect(t.posted).toContainEqual(expect.objectContaining({ type: 'frame' }));
    t.reader.stop();
  });

  it('says when LMU loads a session, asks every second for the progress, and when the session is there', async () => {
    const answers: GameProbe[] = ['menu', { loading: 0.25 }, { loading: 0.8 }, { loading: null }, 'session'];
    const probe = vi.fn(() => Promise.resolve(answers.length > 1 ? answers.shift() as GameProbe : answers[0]));
    const t = setup(probe);
    t.available.value = true;
    t.reader.start();
    await vi.advanceTimersByTimeAsync(5100);
    expect(t.posted).toContainEqual({ type: 'navigation', screen: 'menu', loadingProgress: null });
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.posted).toContainEqual({ type: 'navigation', screen: 'loading', loadingProgress: 0.25 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.posted).toContainEqual({ type: 'navigation', screen: 'loading', loadingProgress: 0.8 });
    // The last frozen seconds of the load have no progress: the last one stays.
    const before = t.posted.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.posted.slice(before).filter(message => message.type === 'navigation')).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.posted[t.posted.length - 1]).toEqual({ type: 'navigation', screen: 'session', loadingProgress: null });
    t.reader.stop();
  });

  it('on the menu takes a scoring change as a cue to ask the game, not as a session back', async () => {
    const answers: GameProbe[] = ['menu'];
    const probe = vi.fn(() => Promise.resolve(answers[answers.length - 1]));
    const t = setup(probe);
    t.available.value = true;
    t.reader.start();
    await vi.advanceTimersByTimeAsync(5100);
    expect(t.posted).toContainEqual({ type: 'navigation', screen: 'menu', loadingProgress: null });
    const asked = probe.mock.calls.length;
    // LMU exiting writes the last session once more: the game is asked within a second and still says menu.
    t.setScoring(scoringBuffer(3, [PLAYER]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(probe.mock.calls.length).toBeGreaterThan(asked);
    expect(lastNavigation(t.posted)).toEqual({ type: 'navigation', screen: 'menu', loadingProgress: null });
    // A session really back: the next change is asked about and the answer switches the screen.
    answers.push('session');
    t.setScoring(scoringBuffer(4, [PLAYER]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(lastNavigation(t.posted)).toEqual({ type: 'navigation', screen: 'session', loadingProgress: null });
    t.reader.stop();
  });

  it('closes a half-open pair when only one mapping exists', () => {
    const t = setup();
    const scoringOnly = { size: 1, readU32: () => 0, read: () => Buffer.alloc(0), close: vi.fn() };
    t.openMapping.mockImplementation(name => (name === SCORING_MAPPING_NAME ? scoringOnly : null));
    t.reader.start();
    expect(scoringOnly.close).toHaveBeenCalledTimes(1);
    expect(t.posted).toEqual([{ type: 'closed' }]);
    t.reader.stop();
  });
});
