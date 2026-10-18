import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scoringReading, vehicleReading } from '../../../helpers/liveReadings.js';
import { LiveCaptureController } from '../../../../server/live/capture/controller.js';
import type { CaptureWorker } from '../../../../server/live/capture/controller.js';
import { LiveService } from '../../../../server/live/liveService.js';
import type { LiveWorker } from '../../../../server/live/liveService.js';
import type { LiveCaptureBatch, LiveCaptureSample } from '../../../../shared/types/liveCapture.js';
import type { RestAnswer } from '../../../../server/live/lmuPitRest.js';
import type { SseSink } from '../../../../server/live/sse.js';

class FakeWorker extends EventEmitter {
  public readonly posted: unknown[] = [];
  public readonly unref = vi.fn();
  public readonly terminate = vi.fn(() => Promise.resolve(0));
  public postMessage(message: unknown): void { this.posted.push(message); }
}

class FakeCaptureWriter extends EventEmitter {
  public readonly posted: unknown[] = [];
  public readonly unref = vi.fn();
  public readonly terminate = vi.fn(() => Promise.resolve(0));
  public postMessage(message: unknown): void { this.posted.push(message); }
  public batches(): LiveCaptureBatch[] {
    return this.posted.filter((message): message is LiveCaptureBatch => typeof message === 'object'
      && message !== null && 'type' in message && message.type === 'batch');
  }
}

function sample(elapsedSeconds: number): LiveCaptureSample {
  return { elapsedSeconds, lapNumber: 8, lapStartSeconds: 100, values: new Float64Array(30).fill(1) };
}

describe('LiveService capture integration', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps polling and recording without a dashboard, ignores replay frames, then stops polling', async () => {
    const reader = new FakeWorker();
    const writer = new FakeCaptureWriter();
    const get = vi.fn(async (path: string): Promise<RestAnswer> => path === '/navigation/state'
      ? { ok: true, body: { state: { navigationState: 'NAV_EVENT', settingMode: 'SETTING_GRANDPRIX' } } }
      : { ok: true, body: {} });
    const capture = new LiveCaptureController({ directory: 'unused-test-directory', onPersist: vi.fn(),
      createWorker: () => writer as unknown as CaptureWorker });
    const service = new LiveService({ capture, createWorker: () => reader as unknown as LiveWorker,
      pit: { get } });

    service.start();
    reader.emit('message', { type: 'frame', scoring: scoringReading({
      trackName: 'Circuit de la Sarthe', sessionCode: 10, currentEt: 120,
      player: vehicleReading({ id: 4, driverName: 'Driver', vehicleName: 'Ferrari 296 GT3', totalLaps: 7, lapStartEt: 100 }),
    }), capture: sample(120) });
    expect(service.hasClients()).toBe(false);
    expect(capture.status().state).toBe('recording');
    expect(capture.status().samples).toBe(1);
    await vi.advanceTimersByTimeAsync(5);
    expect(get).toHaveBeenCalledWith('/navigation/state');

    const sink: SseSink = { write: () => true, once: () => undefined };
    const disconnect = service.addClient(sink);
    disconnect();
    expect(service.hasClients()).toBe(false);
    expect(capture.status().state).toBe('recording');

    reader.emit('message', { type: 'navigation', screen: 'replay', loadingProgress: null });
    reader.emit('message', { type: 'frame', scoring: scoringReading({ currentEt: 121 }), capture: sample(121) });
    expect(capture.status().samples).toBe(1);

    const stopping = service.stop();
    let stopResolved = false;
    void stopping.then(() => { stopResolved = true; });
    await Promise.resolve();
    expect(stopResolved).toBe(false);
    const dataBatch = writer.batches().find(batch => batch.samples.length > 0);
    expect(dataBatch?.samples).toHaveLength(33);
    expect(Array.from(dataBatch!.samples.slice(0, 4))).toEqual([120, 8, 100, 1]);
    for (const batch of writer.batches()) {
      writer.emit('message', { type: 'persisted', sequence: batch.sequence, manifest: batch.manifest, bytes: 1 });
    }
    writer.emit('message', { type: 'closed' });
    await Promise.resolve();
    expect(stopResolved).toBe(false);
    writer.emit('exit', 0);
    await stopping;
    const pollCountAtStop = get.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(get).toHaveBeenCalledTimes(pollCountAtStop);
    expect(reader.posted).toContainEqual({ type: 'stop' });
  });

  it('invalidates an outstanding REST state request when a new session starts in the same garage mode', async () => {
    const reader = new FakeWorker();
    const writer = new FakeCaptureWriter();
    const firstRequest: { release?: (answer: RestAnswer) => void } = {};
    const get = vi.fn((path: string): Promise<RestAnswer> => {
      if (path === '/navigation/state' && !firstRequest.release) {
        return new Promise(resolve => { firstRequest.release = resolve; });
      }
      return Promise.resolve(path === '/navigation/state'
        ? { ok: true, body: { state: { navigationState: 'NAV_EVENT', settingMode: 'SETTING_GRANDPRIX' } } }
        : { ok: true, body: {} });
    });
    const capture = new LiveCaptureController({ directory: 'unused-test-directory', onPersist: vi.fn(),
      createWorker: () => writer as unknown as CaptureWorker });
    const service = new LiveService({ capture, createWorker: () => reader as unknown as LiveWorker, pit: { get } });
    const makeGarageReading = (sessionCode: number, currentEt: number) => scoringReading({
      trackName: 'Circuit de la Sarthe', sessionCode, currentEt, inRealtime: false,
      player: vehicleReading({ id: 4, driverName: 'Driver', vehicleName: 'Ferrari 296 GT3', totalLaps: 7, lapStartEt: 100 }),
    });

    service.start();
    reader.emit('message', { type: 'frame', scoring: makeGarageReading(10, 120), capture: null });
    await vi.advanceTimersByTimeAsync(1);
    expect(get).toHaveBeenCalledTimes(1);
    const firstRecording = capture.status().recordingId;
    expect(service.getSnapshot().lifecycle).toBe('garage');

    reader.emit('message', { type: 'frame', scoring: makeGarageReading(1, 121), capture: sample(121) });
    const secondRecording = capture.status().recordingId;
    expect(secondRecording).not.toBe(firstRecording);
    expect(service.getSnapshot().lifecycle).toBe('garage');
    expect(firstRequest.release).toBeTypeOf('function');
    firstRequest.release?.({ ok: true, body: { state: { navigationState: 'NAV_EVENT', settingMode: 'SETTING_REPLAY_PLAYBACK' } } });
    await vi.advanceTimersByTimeAsync(1);

    reader.emit('message', { type: 'frame', scoring: scoringReading({
      trackName: 'Circuit de la Sarthe', sessionCode: 1, currentEt: 121.2,
      player: vehicleReading({ id: 4, driverName: 'Driver', vehicleName: 'Ferrari 296 GT3', totalLaps: 7, lapStartEt: 100 }),
    }), capture: sample(121.2) });
    expect(capture.status()).toMatchObject({ state: 'recording', recordingId: secondRecording, samples: 1 });

    const stopping = service.stop();
    writer.emit('exit', 0);
    await stopping;
  });
});
