import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveReader, STARTUP_GRACE_MS } from '../../../server/live/liveReader.js';
import type { GameProbe, LiveReaderMessage } from '../../../server/live/liveReader.js';
import { SCORING, SCORING_MAPPING_NAME, TELEMETRY, TELEMETRY_MAPPING_NAME } from '../../../server/live/rf2Layout.js';
import type { MappedBuffer } from '../../../server/live/sharedMemory.js';
import { scoringBuffer, source, telemetryBuffer } from './rf2Fixtures.js';

const PLAYER = { id: 12, isPlayer: true, place: 4, totalLaps: 8, name: 'Ferrari 296 GT3', className: 'GT3' };

function setup(probe: () => Promise<GameProbe> = () => Promise.resolve('session')) {
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
  const reader = new LiveReader({ openMapping, probeGame: vi.fn(probe), post: message => posted.push(message) });
  return {
    reader, posted, openMapping, closes, available,
    setScoring: (buffer: Buffer) => { scoring = buffer; },
    setTelemetry: (buffer: Buffer) => { telemetry = buffer; },
  };
}

describe('LiveReader', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

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

  it('asks the game once the counters stand still, and unmaps when it is gone', async () => {
    const answers: GameProbe[] = ['session', 'gone'];
    const probe = vi.fn(() => Promise.resolve(answers.shift() ?? 'gone'));
    const t = setup(probe);
    t.available.value = true;
    t.reader.start();
    await vi.advanceTimersByTimeAsync(4900);
    expect(probe).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(t.closes.scoring).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
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

  it('stays open while a paused game still answers, asking again no sooner than every 5 s', async () => {
    const probe = vi.fn(() => Promise.resolve<GameProbe>('session'));
    const t = setup(probe);
    t.available.value = true;
    t.reader.start();
    await vi.advanceTimersByTimeAsync(5100);
    expect(probe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(probe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1100);
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

  it('asks a game that keeps its counters moving until it answers once, then only when they stand still', async () => {
    const probe = vi.fn(() => Promise.resolve<GameProbe>('session'));
    const t = setup(probe);
    t.available.value = true;
    t.reader.start();
    for (let version = 3; version < 23; version += 1) {
      t.setScoring(scoringBuffer(version, [PLAYER]));
      await vi.advanceTimersByTimeAsync(1000);
    }
    // One question at 5 s (no answer seen yet), none after it while the counters move.
    expect(probe).toHaveBeenCalledTimes(1);
    // The game closes: the counters stand still and the refusal now counts.
    probe.mockImplementation(() => Promise.resolve<GameProbe>('gone'));
    await vi.advanceTimersByTimeAsync(5100);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(t.posted).toContainEqual({ type: 'closed' });
    t.reader.stop();
  });

  it('says when LMU loads a session, asks every second for the progress, and when the session is there', async () => {
    const answers: GameProbe[] = ['menu', { loading: 0.25 }, { loading: 0.8 }, 'session'];
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
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.posted[t.posted.length - 1]).toEqual({ type: 'navigation', screen: 'session', loadingProgress: null });
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
