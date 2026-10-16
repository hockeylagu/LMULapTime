import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveScoringReading } from '../../../shared/domain/live/liveLifecycle.js';
import { LIVE_HEARTBEAT_MS } from '../../../shared/types/live.js';
import type { LiveLifecycle } from '../../../shared/types/live.js';
import { LiveService, PEDAL_FLUSH_MS } from '../../../server/live/liveService.js';
import type { LiveWorker } from '../../../server/live/liveService.js';

class FakeWorker extends EventEmitter {
  public postMessage = vi.fn();
  public terminate = vi.fn(() => Promise.resolve(0));
  public unref = vi.fn();
}

class FakeSink extends EventEmitter {
  public chunks: string[] = [];
  public accepting = true;
  public write(chunk: string): boolean { this.chunks.push(chunk); return this.accepting; }
  public events(): string[] { return this.chunks.map(chunk => chunk.split('\n')[0].replace('event: ', '')); }
  public data(index: number): unknown { return JSON.parse(this.chunks[index].split('\n')[1].replace('data: ', '')); }
}

function reading(overrides: Partial<LiveScoringReading> = {}): LiveScoringReading {
  return {
    trackName: 'Spa', sessionCode: 10, currentEt: 10, endEt: 1800, maxLaps: 2147483647, numVehicles: 10,
    inRealtime: true, gamePhase: 5, player: { id: 1, place: 2, totalLaps: 3, vehicleName: 'Car', vehicleClass: 'GT3' },
    ...overrides,
  };
}

function setup() {
  const worker = new FakeWorker();
  const service = new LiveService({ createWorker: () => worker as unknown as LiveWorker });
  const lifecycles: LiveLifecycle[] = [];
  const loaded: boolean[] = [];
  service.events.on('lifecycle', value => lifecycles.push(value));
  service.events.on('session-loaded', value => loaded.push(value));
  service.start();
  const frame = (scoring?: LiveScoringReading, pedal?: { t: number; throttle: number; brake: number }) =>
    worker.emit('message', { type: 'frame', scoring, pedal });
  return { worker, service, lifecycles, loaded, frame };
}

describe('LiveService', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sends the snapshot on connect and on every change, not for a moving clock alone', () => {
    const { service, frame } = setup();
    const sink = new FakeSink();
    service.addClient(sink);
    expect(sink.events()).toEqual(['snapshot']);
    expect(sink.data(0)).toMatchObject({ sequence: 0, lifecycle: 'offline', session: null });

    frame(reading());
    frame(reading({ currentEt: 11 }));
    expect(sink.events()).toEqual(['snapshot', 'snapshot']);
    expect(sink.data(1)).toMatchObject({ sequence: 1, lifecycle: 'driving', paused: false, session: { kind: 'race', trackName: 'Spa' } });
    expect(service.getSnapshot().session?.elapsedSeconds).toBe(11);

    frame(reading({ player: { id: 1, place: 1, totalLaps: 3, vehicleName: 'Car', vehicleClass: 'GT3' } }));
    expect(sink.events()).toHaveLength(3);
    expect(sink.data(2)).toMatchObject({ sequence: 2, session: { playerPlace: 1 } });
  });

  it('reports lifecycle and session-loaded changes, and offline when the reader closes or dies', () => {
    const { service, worker, lifecycles, loaded, frame } = setup();
    frame(reading({ inRealtime: false }));
    expect(service.isSessionLoaded()).toBe(true);
    frame(reading({ gamePhase: 5 }));
    worker.emit('message', { type: 'closed' });
    expect(lifecycles).toEqual(['garage', 'driving', 'offline']);
    expect(loaded).toEqual([true, false]);
    frame(reading());
    worker.emit('exit', 1);
    expect(service.getSnapshot().lifecycle).toBe('offline');
    expect(loaded).toEqual([true, false, true, false]);
  });

  it('settles firstReading on the reader\'s first answer, game found or not', async () => {
    const { service, worker } = setup();
    let settled = false;
    void service.firstReading.then(() => { settled = true; });
    worker.emit('message', { 'watch:import': ['file.ts'] });
    await Promise.resolve();
    expect(settled).toBe(false);
    worker.emit('message', { type: 'closed' });
    await Promise.resolve();
    expect(settled).toBe(true);
  });

  it('ignores messages that are not the reader\'s (tsx posts watch:import)', () => {
    const { service, worker } = setup();
    worker.emit('message', { 'watch:import': ['file.ts'] });
    expect(service.getSnapshot().sequence).toBe(0);
  });

  it('batches pedals every 40 ms only while on track', () => {
    const { service, frame } = setup();
    const sink = new FakeSink();
    service.addClient(sink);
    frame(reading({ inRealtime: false }));
    frame(undefined, { t: 1, throttle: 1, brake: 0 });
    vi.advanceTimersByTime(PEDAL_FLUSH_MS);
    expect(sink.events()).toEqual(['snapshot', 'snapshot']);

    frame(reading());
    frame(undefined, { t: 2, throttle: 0.5, brake: 0 });
    frame(undefined, { t: 2.02, throttle: 0.6, brake: 0 });
    expect(sink.events()).toHaveLength(3);
    vi.advanceTimersByTime(PEDAL_FLUSH_MS);
    expect(sink.events()[sink.events().length - 1]).toBe('pedals');
    expect(sink.data(sink.chunks.length - 1)).toEqual({ samples: [{ t: 2, throttle: 0.5, brake: 0 }, { t: 2.02, throttle: 0.6, brake: 0 }] });
    vi.advanceTimersByTime(PEDAL_FLUSH_MS);
    expect(sink.events().filter(name => name === 'pedals')).toHaveLength(1);
  });

  it('keeps no pedals while no page is connected', () => {
    const { service, frame } = setup();
    frame(reading());
    frame(undefined, { t: 1, throttle: 1, brake: 0 });
    const sink = new FakeSink();
    service.addClient(sink);
    vi.advanceTimersByTime(PEDAL_FLUSH_MS);
    expect(sink.events()).toEqual(['snapshot']);
  });

  it('sends a heartbeat to every page and stops its timers with the last one', () => {
    const { service } = setup();
    const sink = new FakeSink();
    const remove = service.addClient(sink);
    vi.advanceTimersByTime(LIVE_HEARTBEAT_MS);
    expect(sink.events()).toEqual(['snapshot', 'heartbeat']);
    expect(sink.data(1)).toEqual({ at: Date.now() });
    remove();
    expect(service.hasClients()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drops batches for a page whose buffer is full and catches it up when it drains', () => {
    const { service, frame } = setup();
    const slow = new FakeSink();
    const fast = new FakeSink();
    service.addClient(slow);
    service.addClient(fast);
    frame(reading());
    slow.accepting = false;
    frame(undefined, { t: 1, throttle: 1, brake: 0 });
    vi.advanceTimersByTime(PEDAL_FLUSH_MS);
    const writtenToSlow = slow.chunks.length;
    expect(fast.events()[fast.events().length - 1]).toBe('pedals');

    frame(undefined, { t: 2, throttle: 1, brake: 0 });
    vi.advanceTimersByTime(PEDAL_FLUSH_MS);
    frame(reading({ gamePhase: 8 }));
    expect(slow.chunks).toHaveLength(writtenToSlow);

    slow.accepting = true;
    slow.emit('drain');
    expect(slow.chunks).toHaveLength(writtenToSlow + 1);
    expect(slow.data(writtenToSlow)).toMatchObject({ lifecycle: 'finished' });
  });

  it('terminates the worker on stop and does not restart it', () => {
    const { service, worker } = setup();
    service.stop();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stop' });
    expect(worker.terminate).toHaveBeenCalled();
    worker.emit('exit', 0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
