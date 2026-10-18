import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveScoringReading } from '../../../../shared/domain/live/liveLifecycle.js';
import type { LiveSnapshot } from '../../../../shared/types/live.js';
import { scoringReading, vehicleReading } from '../../../helpers/liveReadings.js';
import { LiveCaptureController } from '../../../../server/live/capture/controller.js';
import type { CaptureWorker } from '../../../../server/live/capture/controller.js';
import type {
  LiveCaptureBatch, LiveCaptureManifest, LiveCaptureSample,
} from '../../../../shared/types/liveCapture.js';

interface PostedMessage { message: unknown; transfer?: readonly ArrayBuffer[] }

class FakeCaptureWriter extends EventEmitter {
  public readonly posted: PostedMessage[] = [];
  public readonly unref = vi.fn();
  public readonly terminate = vi.fn(() => Promise.resolve(0));

  public postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void {
    this.posted.push({ message, transfer });
  }

  public batches(): LiveCaptureBatch[] {
    return this.posted.map(item => item.message).filter((value): value is LiveCaptureBatch =>
      typeof value === 'object' && value !== null && 'type' in value && value.type === 'batch');
  }

  public acknowledge(batch: LiveCaptureBatch): void {
    this.emit('message', { type: 'persisted', sequence: batch.sequence, manifest: batch.manifest, bytes: 128 });
  }
}

function snapshot(kind: NonNullable<LiveSnapshot['session']>['kind'] = 'race',
  layoutKey: string | null = 'sarthe:full', lifecycle: LiveSnapshot['lifecycle'] = 'driving'): LiveSnapshot {
  return {
    sequence: 1, receivedAt: Date.now(), lifecycle, paused: false,
    session: {
      kind, sessionCode: kind === 'race' ? 10 : kind === 'practice' ? 1 : 10, gamePhase: 5, inRealtime: true,
      trackName: 'Circuit de la Sarthe', vehicleName: 'Ferrari 296 GT3', vehicleClass: 'GT3', elapsedSeconds: 100,
      endSeconds: 3600, playerLapsCompleted: 7, playerPlace: 1,
    },
    identity: { layoutKey, layoutName: 'Le Mans', carClass: 'GT3', personalBestSeconds: null },
    lapsLeft: null, weather: null, recentLaps: [], sessionBest: null, loadingProgress: null, strategy: null,
  };
}

function reading(currentEt: number, overrides: Partial<LiveScoringReading> = {}): LiveScoringReading {
  return scoringReading({
    trackName: 'Circuit de la Sarthe', sessionCode: 10, currentEt,
    player: vehicleReading({ id: 4, driverName: 'Driver', vehicleName: 'Ferrari 296 GT3', totalLaps: 7, lapStartEt: 100 }),
    ...overrides,
  });
}

function sample(elapsedSeconds: number, value = 2): LiveCaptureSample {
  return {
    elapsedSeconds, lapNumber: 8, lapStartSeconds: 100,
    values: Float64Array.from({ length: 30 }, (_, index) => value + index),
  };
}

function last<T>(values: readonly T[]): T | undefined { return values[values.length - 1]; }

function makeController(options: { existing?: LiveCaptureManifest[]; now?: () => number } = {}) {
  const writer = new FakeCaptureWriter();
  const onPersist = vi.fn();
  const controller = new LiveCaptureController({
    directory: 'unused-test-directory', onPersist, createWorker: () => writer as unknown as CaptureWorker,
    existing: options.existing ? () => options.existing ?? [] : undefined,
    now: options.now,
  });
  return { controller, writer, onPersist };
}

function start(controller: LiveCaptureController, et = 100, game = snapshot()): void {
  controller.update(reading(et, { sessionCode: game.session?.sessionCode ?? 10 }), game);
}

function priorManifest(overrides: Partial<LiveCaptureManifest> = {}, now = Date.now()): LiveCaptureManifest {
  return {
    recordingId: 'previous-recording', source: 'live-capture', schemaVersion: 1, normalizationVersion: 1, signConvention: 'iso8855',
    filename: 'prior.live.duckdb', layoutKey: 'sarthe:full', trackName: 'Circuit de la Sarthe', driverName: 'Driver',
    vehicleName: 'Ferrari 296 GT3', vehicleModel: null, carClass: 'GT3', sessionCode: 10, sessionKind: 'race',
    startedAt: now - 30_000, updatedAt: now - 10_000, firstElapsedSeconds: 90, lastElapsedSeconds: 100, endedAt: null,
    status: 'interrupted', samples: 5, droppedSamples: 0, anchors: [{ lapNumber: 8, startSeconds: 100, lapSeconds: null }],
    sessionId: null, gameVersion: null,
    ...overrides,
  };
}

describe('LiveCaptureController', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts independently of dashboard clients and batches ISO samples with the schema stride and metadata', () => {
    const { controller, writer } = makeController();
    start(controller);
    expect(controller.status()).toMatchObject({ state: 'recording', samples: 0 });
    expect(writer.unref).toHaveBeenCalledOnce();
    expect(writer.batches()[0].manifest).toMatchObject({
      source: 'live-capture', schemaVersion: 1, normalizationVersion: 1, signConvention: 'iso8855',
      layoutKey: 'sarthe:full', sessionKind: 'race', driverName: 'Driver', vehicleName: 'Ferrari 296 GT3',
    });

    const values = sample(100.02);
    values.values[6] = Number.NaN;
    controller.sample(values);
    vi.advanceTimersByTime(1000);

    const batch = last(writer.batches());
    expect(batch?.samples).toHaveLength(33);
    expect(Array.from(batch!.samples.slice(0, 3))).toEqual([100.02, 8, 100]);
    expect(Array.from(batch!.samples.slice(3, 6))).toEqual([2, 3, 4]);
    expect(Number.isNaN(batch!.samples[9])).toBe(true);
    expect(batch?.manifest).toMatchObject({ layoutKey: 'sarthe:full', sessionCode: 10, samples: 1 });
  });

  it('starts a new recording when session kind, elapsed clock or resolved layout changes but not on garage updates', () => {
    const { controller, writer } = makeController();
    start(controller, 100);
    const firstId = controller.status().recordingId;

    start(controller, 101, snapshot('race', 'sarthe:full', 'garage'));
    expect(controller.status().recordingId).toBe(firstId);

    start(controller, 102, snapshot('practice', 'sarthe:full'));
    const secondId = controller.status().recordingId;
    expect(secondId).not.toBe(firstId);

    start(controller, 99, snapshot('practice', 'sarthe:full'));
    const thirdId = controller.status().recordingId;
    expect(thirdId).not.toBe(secondId);

    start(controller, 100, snapshot('practice', 'sarthe:outer'));
    expect(controller.status().recordingId).not.toBe(thirdId);
    expect(writer.batches().some(batch => batch.manifest.status === 'completed' && batch.manifest.recordingId === firstId)).toBe(true);
  });

  it('resumes only one recent interrupted recording with matching known layout, identity and lap anchor', () => {
    const now = Date.now();
    const matches = priorManifest({}, now);
    const cases: Array<{ name: string; candidate: LiveCaptureManifest; resumes: boolean }> = [
      { name: 'exact identity', candidate: matches, resumes: true },
      { name: 'unresolved layout', candidate: priorManifest({ layoutKey: null }, now), resumes: false },
      { name: 'different layout', candidate: priorManifest({ layoutKey: 'sarthe:outer' }, now), resumes: false },
      { name: 'different driver', candidate: priorManifest({ driverName: 'Other' }, now), resumes: false },
      { name: 'different car', candidate: priorManifest({ vehicleName: 'Other car' }, now), resumes: false },
      { name: 'different lap start', candidate: priorManifest({ anchors: [{ lapNumber: 8, startSeconds: 99, lapSeconds: null }] }, now), resumes: false },
      { name: 'stale wall time', candidate: priorManifest({ updatedAt: now - 120_000 }, now), resumes: false },
      { name: 'completed recording', candidate: priorManifest({ status: 'completed' }, now), resumes: false },
    ];

    for (const item of cases) {
      const { controller } = makeController({ existing: [item.candidate], now: () => now });
      start(controller, 101);
      expect(controller.status().recordingId === matches.recordingId, item.name).toBe(item.resumes);
    }
  });

  it('waits for layout resolution before resuming and retains the initial clock proof across a line crossing', () => {
    const prior = priorManifest();
    const { controller, writer } = makeController({ existing: [prior] });
    start(controller, 101, snapshot('race', null));
    controller.sample(sample(101.1));
    expect(controller.status()).toMatchObject({ state: 'idle', recordingId: null });
    expect(writer.batches()).toHaveLength(0);

    controller.update(reading(201, { player: vehicleReading({ driverName: 'Driver', totalLaps: 8,
      lapStartEt: 200, lastLapTime: 100 }) }), snapshot());
    expect(controller.status().recordingId).toBe(prior.recordingId);
    expect(writer.batches().every(batch => batch.manifest.recordingId === prior.recordingId)).toBe(true);
    expect(writer.batches()[0].manifest.samples).toBe(prior.samples);
    controller.sample(sample(201.1));
    controller.pause();
    expect(last(writer.batches())?.manifest.anchors).toEqual([
      { lapNumber: 8, startSeconds: 100, lapSeconds: 100 },
      { lapNumber: 9, startSeconds: 200, lapSeconds: null },
    ]);
  });

  it('does not reuse pending recovery proof after a clock reset or a different resolved layout', () => {
    for (const change of ['clock', 'layout', 'identity', 'offline'] as const) {
      const { controller } = makeController({ existing: [priorManifest()] });
      start(controller, 101, snapshot('race', null));
      if (change === 'clock') start(controller, 99);
      else if (change === 'layout') start(controller, 102, snapshot('race', 'sarthe:outer'));
      else if (change === 'identity') controller.update(reading(102, {
        player: vehicleReading({ driverName: 'Other', totalLaps: 7, lapStartEt: 100 }),
      }), snapshot());
      else {
        controller.update(null, { ...snapshot(), session: null, lifecycle: 'offline' });
        controller.update(reading(201, { player: vehicleReading({ driverName: 'Driver', totalLaps: 8, lapStartEt: 200 }) }), snapshot());
      }
      expect(controller.status().recordingId).not.toBe('previous-recording');
      expect(controller.status().recordingId).not.toBeNull();
    }
  });

  it('pauses replay capture by flushing while keeping the recording open', () => {
    const { controller, writer } = makeController();
    start(controller);
    controller.sample(sample(100.1));
    controller.pause();
    expect(controller.status().state).toBe('recording');
    expect(last(writer.batches())?.manifest.status).toBe('recording');
    expect(last(writer.batches())?.samples).toHaveLength(33);
  });

  it('rejects duplicate and nonfinite sample times without hiding the next valid gap', () => {
    const { controller, writer } = makeController();
    start(controller);
    controller.sample(sample(100.02));
    controller.sample(sample(100.02));
    controller.sample(sample(Number.NaN));
    controller.sample(sample(Number.POSITIVE_INFINITY));
    controller.sample(sample(100.01));
    controller.sample(sample(100.08));
    controller.pause();

    expect(controller.status().samples).toBe(2);
    const batch = last(writer.batches());
    expect(batch?.samples).toHaveLength(66);
    expect([batch?.samples[0], batch?.samples[33]]).toEqual([100.02, 100.08]);
  });

  it('bounds outstanding batches and counts samples dropped under writer backpressure', () => {
    const { controller, writer } = makeController();
    start(controller);
    writer.acknowledge(writer.batches()[0]);
    for (let index = 1; index <= 200; index++) controller.sample(sample(index));
    expect(controller.status()).toMatchObject({ pendingBatches: 4, samples: 200, droppedSamples: 0 });
    controller.sample(sample(201));
    expect(controller.status()).toMatchObject({ pendingBatches: 4, samples: 200, droppedSamples: 1 });

    const dataBatches = writer.batches().filter(batch => batch.samples.length > 0);
    writer.acknowledge(dataBatches[0]);
    controller.sample(sample(201));
    controller.pause();
    expect(controller.status()).toMatchObject({ pendingBatches: 4, samples: 201, droppedSamples: 1 });
  });

  it('delivers final interrupted metadata within the two control-batch allowance at queue capacity', () => {
    const { controller, writer } = makeController();
    start(controller);
    writer.acknowledge(writer.batches()[0]);
    for (let index = 1; index <= 200; index++) controller.sample(sample(index));
    expect(controller.status().pendingBatches).toBe(4);

    controller.update(null, snapshot('race', 'sarthe:full', 'offline'));
    expect(controller.status().state).toBe('idle');
    expect(controller.status().pendingBatches).toBe(5);
    expect(last(writer.batches())?.manifest).toMatchObject({ status: 'interrupted', endedAt: null });
  });

  it('buffers the next session while the old writer closes and flushes it after worker exit', () => {
    const firstWriter = new FakeCaptureWriter();
    const secondWriter = new FakeCaptureWriter();
    const createWorker = vi.fn().mockReturnValueOnce(firstWriter).mockReturnValueOnce(secondWriter);
    const controller = new LiveCaptureController({ directory: 'unused-test-directory', onPersist: vi.fn(), createWorker });
    start(controller);
    controller.update(null, snapshot('race', 'sarthe:full', 'offline'));
    for (const batch of firstWriter.batches()) firstWriter.acknowledge(batch);
    expect(last(firstWriter.posted)?.message).toEqual({ type: 'close' });

    start(controller, 101, snapshot('practice', 'sarthe:outer'));
    controller.sample(sample(101.1));
    expect(createWorker).toHaveBeenCalledOnce();
    firstWriter.emit('exit', 0);

    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(last(secondWriter.batches())).toMatchObject({
      manifest: { sessionKind: 'practice', layoutKey: 'sarthe:outer' },
    });
    expect(last(secondWriter.batches())?.samples).toHaveLength(33);
  });

  it('flushes on stop, waits for worker exit after the close message, and ignores new samples', async () => {
    const { controller, writer } = makeController();
    start(controller);
    writer.acknowledge(writer.batches()[0]);
    controller.sample(sample(100.1));
    const stopping = controller.stop();
    let resolved = false;
    void stopping.then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(last(writer.batches())).toMatchObject({ manifest: { status: 'interrupted', endedAt: null }, samples: expect.any(Float64Array) });
    expect(last(writer.batches())?.samples).toHaveLength(33);
    expect(last(writer.posted)?.message).toEqual({ type: 'close' });
    const priorCount = controller.status().samples;
    controller.sample(sample(100.2));
    expect(controller.status().samples).toBe(priorCount);

    writer.emit('message', { type: 'closed' });
    await Promise.resolve();
    expect(resolved).toBe(false);
    writer.emit('exit', 0);
    await Promise.resolve();
    expect(resolved).toBe(true);
    await stopping;
  });

  it('reports writer errors as unavailable and stops accepting samples', () => {
    const { controller, writer } = makeController();
    start(controller);
    writer.emit('error', new Error('disk full'));
    controller.sample(sample(100.2));
    expect(controller.status()).toMatchObject({ state: 'unavailable', error: 'disk full', samples: 0, pendingBatches: 0 });
  });
});
