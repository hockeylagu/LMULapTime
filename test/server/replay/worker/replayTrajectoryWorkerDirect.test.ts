import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplayTrajectoryData } from '../../../../shared/types/index.js';
import type { ExtractReplayDriversOptions } from '../../../../server/replay/decode/replayTrajectory.js';
import type { ReplayDriverSave } from '../../../../server/core/replay/dbReplayDriverStore.js';
import { decompressTrajectory } from '../../../../server/core/replay/replayTrajectoryCodec.js';

const harness = vi.hoisted(() => ({
  hasPort: true,
  data: {} as Record<string, unknown>,
  journal: 'wal',
  openError: null as Error | null,
  post: vi.fn<(message: unknown) => void>(),
  open: vi.fn(),
  close: vi.fn(),
  pragma: vi.fn(),
  save: vi.fn<typeof import('../../../../server/core/replay/dbReplayDriverStore.js').replaceReplayDriverLaps>(),
  single: vi.fn<typeof import('../../../../server/replay/decode/replayTrajectory.js').extractReplayTrajectory>(),
  drivers: vi.fn<typeof import('../../../../server/replay/decode/replayTrajectory.js').extractReplayDriverTrajectories>(),
}));

vi.mock('node:worker_threads', () => ({
  get parentPort() { return harness.hasPort ? { postMessage: harness.post } : null; },
  get workerData() { return harness.data; },
}));
vi.mock('better-sqlite3', () => ({
  default: class {
    constructor(...args: unknown[]) {
      harness.open(...args);
      if (harness.openError) throw harness.openError;
    }
    pragma = harness.pragma;
    close = harness.close;
  },
}));
vi.mock('../../../../server/replay/decode/replayTrajectory.js', () => ({
  extractReplayTrajectory: harness.single,
  extractReplayDriverTrajectories: harness.drivers,
}));
vi.mock('../../../../server/core/replay/dbReplayDriverStore.js', () => ({ replaceReplayDriverLaps: harness.save }));

const trajectory = (driverSlot = 1, currentLap = 2): ReplayTrajectoryData => ({
  replayName: 'test.Vcr', driverSlot, currentLap, pointsCount: 3,
  points: [0, 1, 2].map(x => ({ x, y: 0, z: 0, timeSec: x, speedKmh: 100 })),
  bounds: { minX: 0, maxX: 2, minZ: 0, maxZ: 0, spanX: 2, spanZ: 0 },
});
const save: ReplayDriverSave & { dbPath: string } = {
  filename: 'test.Vcr', filePath: 'test.Vcr', mtimeMs: 1, fileSizeBytes: 100,
  isPrimary: true, dbPath: 'cache.db',
};
const batchInput = () => { harness.data.batch = { ...save, driverSlots: [1, 2], includePrimary: true }; };
const run = () => import('../../../../server/replay/worker/replayTrajectoryWorker.js');

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  harness.hasPort = true;
  harness.data = { filePath: 'test.Vcr', options: { allLaps: true } };
  harness.journal = 'wal';
  harness.openError = null;
  harness.pragma.mockImplementation(() => harness.journal);
  harness.single.mockImplementation((_filename, options) => {
    options?.onProgress?.({ stage: 'metadata', stageDescription: 'Metadata', percent: 10, driverSlot: 1 });
    return trajectory();
  });
  harness.drivers.mockImplementation(function* (_filename, options) {
    options?.onProgress?.({ stage: 'metadata', stageDescription: 'Metadata', percent: 10, driverSlot: 1 });
    const decoded = trajectory();
    const trimmed = options?.onLapResult?.(decoded) ?? decoded;
    yield { ...trimmed, allLapsData: [trimmed] };
  });
});

describe('replay trajectory worker in process', () => {
  it('forwards progress and returns a decoded trajectory without opening SQLite', async () => {
    await run();
    expect(harness.single).toHaveBeenCalledWith('test.Vcr', expect.objectContaining({ allLaps: true, silent: true }));
    expect(harness.post.mock.calls.map(([message]) => message)).toEqual([
      { type: 'progress', progress: { stage: 'metadata', stageDescription: 'Metadata', percent: 10, driverSlot: 1 } },
      { type: 'result', trajectory: trajectory() },
    ]);
    expect(harness.open).not.toHaveBeenCalled();
  });

  it('stores a single driver in an existing WAL database before posting its summary, and closes it', async () => {
    harness.data.save = save;
    await run();
    expect(harness.open).toHaveBeenCalledExactlyOnceWith('cache.db', { fileMustExist: true, timeout: 5000 });
    expect(harness.pragma).toHaveBeenCalledWith('journal_mode', { simple: true });
    expect(harness.pragma).toHaveBeenCalledWith('synchronous = NORMAL');
    expect(harness.save).toHaveBeenCalledWith(expect.anything(), save, trajectory(), true);
    expect(harness.close).toHaveBeenCalledOnce();
    expect(harness.post).toHaveBeenLastCalledWith({ type: 'stored', summary: { driverSlot: 1, currentLap: 2 } });
    expect(harness.save.mock.invocationCallOrder[0]).toBeLessThan(harness.close.mock.invocationCallOrder[0]);
    expect(harness.close.mock.invocationCallOrder[0]).toBeLessThan(harness.post.mock.invocationCallOrder.at(-1)!);
  });

  it.each([false, true])('rejects non-WAL databases and releases their connection (batch=%s)', async batch => {
    harness.journal = 'delete';
    if (batch) batchInput();
    else harness.data.save = save;
    await run();
    expect(harness.save).not.toHaveBeenCalled();
    expect(harness.close).toHaveBeenCalledOnce();
    expect(harness.post).toHaveBeenLastCalledWith({ type: 'error', message: 'Replay worker requires a WAL database', code: 'REPLAY_SAVE_FAILED' });
  });

  it('compresses full lap data before trimming, deduplicates the primary count and reports committed drivers', async () => {
    batchInput();
    await run();
    const call = harness.save.mock.calls[0];
    expect(call[1]).toMatchObject({ driverSlotKey: 1, isPrimary: true });
    expect(call[2].points).toHaveLength(2);
    expect(call[3]).toBe(true);
    expect(call[4]).toHaveLength(1);
    const encoded = call[4]![0];
    expect(encoded).toMatchObject({ lapKey: 2, pointsCount: 3 });
    expect(decompressTrajectory(encoded.blob).points).toEqual(trajectory().points);
    expect(harness.post).toHaveBeenCalledWith({ type: 'progress', progress: expect.objectContaining({
      stage: 'caching', driverStored: true, driversDone: 1, driversTotal: 2,
    }) as unknown });
    expect(harness.post).toHaveBeenLastCalledWith({ type: 'storedDrivers', summary: {
      drivers: [{ driverSlotKey: 1, isPrimary: true, driverSlot: 1, currentLap: 2 }], failures: [],
    } });
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it('continues after per-driver decoding and save failures without promoting a later driver to primary', async () => {
    batchInput();
    harness.drivers.mockImplementation(function* (_filename, options) {
      options?.onDriverError?.(undefined, Object.assign(new Error('source locked'), { code: 'EBUSY' }));
      yield trajectory(2);
      yield trajectory(3);
    });
    harness.save.mockImplementationOnce(() => { throw new Error('disk full'); });
    await run();
    expect(harness.save.mock.calls.map(call => call[1])).toEqual([
      expect.objectContaining({ driverSlotKey: 2, isPrimary: false }),
      expect.objectContaining({ driverSlotKey: 3, isPrimary: false }),
    ]);
    expect(harness.post).toHaveBeenLastCalledWith({ type: 'storedDrivers', summary: {
      drivers: [{ driverSlotKey: 3, isPrimary: false, driverSlot: 3, currentLap: 2 }], failures: [
        { driverSlotKey: -1, isPrimary: true, message: 'source locked', code: 'EBUSY' },
        { driverSlotKey: 2, isPrimary: false, message: 'disk full', code: 'REPLAY_SAVE_FAILED' },
      ],
    } });
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it('marks lap encoding errors as save failures and discards partial driver buffers', async () => {
    batchInput();
    harness.drivers.mockImplementation(function* (_filename, options: ExtractReplayDriversOptions = {}) {
      const lap = trajectory();
      options.onLapResult?.(lap);
      Object.defineProperty(lap, 'points', { get() { throw new Error('encoding failed'); } });
      try { options.onLapResult?.(lap); }
      catch (error: unknown) { options.onDriverError?.(1, error); }
      yield trajectory(2);
    });
    await run();
    expect(harness.post).toHaveBeenLastCalledWith({ type: 'storedDrivers', summary: {
      drivers: [{ driverSlotKey: 2, isPrimary: false, driverSlot: 2, currentLap: 2 }],
      failures: [{ driverSlotKey: 1, isPrimary: true, message: 'encoding failed', code: 'REPLAY_SAVE_FAILED' }],
    } });
    expect(harness.save.mock.calls[0][4]).toBeUndefined();
  });

  it.each([
    [new Error('bad replay'), { message: 'bad replay' }],
    [Object.assign(new Error('locked'), { code: 'EBUSY' }), { message: 'locked', code: 'EBUSY' }],
    ['unexpected failure', { message: 'unexpected failure' }],
  ])('preserves decoder failure details: %s', async (error, expected) => {
    // oxlint-disable-next-line typescript/only-throw-error -- The string case checks how the worker reports a decoder that throws a non-Error.
    harness.single.mockImplementation(() => { throw error; });
    await run();
    expect(harness.post).toHaveBeenLastCalledWith({ type: 'error', ...expected });
    expect(harness.open).not.toHaveBeenCalled();
  });

  it('labels a failed database open as a storage error without trying to close an unopened handle', async () => {
    harness.data.save = save;
    harness.openError = new Error('cannot open cache');
    await run();
    expect(harness.post).toHaveBeenLastCalledWith({ type: 'error', message: 'cannot open cache', code: 'REPLAY_SAVE_FAILED' });
    expect(harness.close).not.toHaveBeenCalled();
  });

  it('requires a parent port before decoding', async () => {
    harness.hasPort = false;
    await expect(run()).rejects.toThrow('requires a parent port');
    expect(harness.single).not.toHaveBeenCalled();
  });
});
