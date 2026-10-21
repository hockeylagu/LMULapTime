import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveScoringReading, LiveVehicleReading } from '../../../shared/domain/live/liveLifecycle.js';
import { LIVE_HEARTBEAT_MS } from '../../../shared/types/live.js';
import type { LiveLifecycle } from '../../../shared/types/live.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';
import { LiveCaptureController } from '../../../server/live/capture/controller.js';
import type { CaptureWorker } from '../../../server/live/capture/controller.js';
import { LiveService, PEDAL_FLUSH_MS, TIMING_MIN_INTERVAL_MS } from '../../../server/live/liveService.js';
import type { LiveServiceOptions, LiveWorker } from '../../../server/live/liveService.js';
import type { RestAnswer } from '../../../server/live/lmuPitRest.js';
import { LiveDiagnostics } from '../../../server/live/capture/diagnostics.js';

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
  return scoringReading({
    trackName: 'Spa', currentEt: 10, endEt: 1800, numVehicles: 10,
    player: vehicleReading({ id: 1, place: 2, totalLaps: 3, vehicleName: 'Car', vehicleClass: 'GT3' }),
    ...overrides,
  });
}

/** LMU's REST API is never reached from tests: every pit read fails unless a test answers it. */
const NO_GAME = { get: () => Promise.resolve<RestAnswer>({ ok: false, reason: 'error' }) };

function setup(options: LiveServiceOptions = {}) {
  const worker = new FakeWorker();
  const service = new LiveService({ createWorker: () => worker as unknown as LiveWorker, pit: NO_GAME, ...options });
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

  it('recovers live frames after the game closes during replay playback', async () => {
    const { worker, service, frame } = setup();
    frame(reading());
    worker.emit('message', { type: 'navigation', screen: 'replay', loadingProgress: null });
    worker.emit('message', { type: 'closed' });
    frame(reading({ currentEt: 20 }));
    expect(service.isSessionLoaded()).toBe(true);
    expect(service.getSnapshot().session?.elapsedSeconds).toBe(20);
    await service.stop();
  });

  it('reports process presence independently of telemetry, falling back when detection is unavailable', () => {
    const { worker, service, frame } = setup();
    const running: boolean[] = [];
    service.events.on('game-running', value => running.push(value));
    worker.emit('message', { type: 'process', running: true });
    expect(service.isGameRunning()).toBe(true);
    expect(service.getSnapshot().lifecycle).toBe('offline');
    worker.emit('message', { type: 'closed' });
    expect(service.isGameRunning()).toBe(true);
    frame(reading());
    worker.emit('message', { type: 'process', running: false });
    worker.emit('message', { type: 'closed' });
    expect(service.isGameRunning()).toBe(false);
    worker.emit('message', { type: 'process', running: null });
    frame(reading());
    expect(service.isGameRunning()).toBe(true);
    expect(running).toEqual([true, false, true]);
    void service.stop();
    worker.emit('message', { type: 'process', running: false });
    expect(running).toEqual([true, false, true]);
  });

  it('records audit history independently of dashboard subscribers', async () => {
    const writer = new FakeWorker();
    const capture = new LiveCaptureController({ directory: 'unused', onPersist: () => {}, createWorker: () => writer as unknown as CaptureWorker });
    const get = vi.fn(() => Promise.resolve<RestAnswer>({ ok: false, reason: 'error' }));
    const { service, frame } = setup({ capture, pit: { get } });
    frame(reading());
    await vi.advanceTimersByTimeAsync(1100);
    expect(get).toHaveBeenCalled();
    expect(service.getSnapshot().audit).toMatchObject({ status: 'recording', runId: capture.status().recordingId });
    expect(writer.postMessage.mock.calls.some(([batch]) => batch.observations?.some(
      (item: { kind: string }) => item.kind === 'strategy-audit-v1'))).toBe(true);
    const remove = service.addClient(new FakeSink()); remove();
    frame(reading({ currentEt: 30 }));
    expect(service.getSnapshot().audit?.runId).toBe(capture.status().recordingId);
    void service.stop();
  });

  it('asks for the condition after a line crossing, an impact or a stop, and for the tyre screen after a stop', async () => {
    const paths: string[] = [];
    const get = vi.fn((path: string) => {
      paths.push(path);
      return Promise.resolve<RestAnswer>(path === '/navigation/state'
        ? { ok: true, body: { state: { settingMode: 'SETTING_GRANDPRIX' } } } : { ok: false, reason: 'status' });
    });
    const { service, worker, frame } = setup({ pit: { get } });
    const count = (path: string) => paths.filter(item => item === path).length;
    const CONDITION = '/rest/garage/getVehicleCondition';
    const TYRES = '/rest/garage/UIScreen/TireManagement';
    const player = (totalLaps: number, inPits = false) => vehicleReading({ id: 1, place: 2, totalLaps, inPits, vehicleName: 'Car', vehicleClass: 'GT3' });
    const car = (lastImpactEt: number) => worker.emit('message', { type: 'frame', car: {
      fuelLiters: 40, fuelCapacityLiters: 117, dentSeverity: [0, 0, 0, 0, 0, 0, 0, 0], detached: false,
      wheels: Array(4).fill({ flat: false, detached: false }), lastImpactEt, compound: 'Medium' } });
    service.addClient(new FakeSink());
    frame(reading({ player: player(3) }));
    car(0);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(count(CONDITION)).toBe(1);
    frame(reading({ currentEt: 50, player: player(4) }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(count(CONDITION)).toBe(2);
    car(55);
    await vi.advanceTimersByTimeAsync(5000);
    expect(count(CONDITION)).toBe(3);
    const tyres = count(TYRES);
    frame(reading({ currentEt: 70, player: player(4, true) }));
    frame(reading({ currentEt: 90, player: player(4, false) }));
    await vi.advanceTimersByTimeAsync(6000);
    expect(count(CONDITION)).toBe(4);
    expect(count(TYRES)).toBe(tyres + 1);
    void service.stop();
  });

  it('stops reading the game when the last page fails a write', async () => {
    const get = vi.fn(() => Promise.resolve<RestAnswer>({ ok: false, reason: 'error' }));
    const { service, frame } = setup({ pit: { get } });
    frame(reading());
    const sink = new FakeSink();
    service.addClient(sink);
    await vi.advanceTimersByTimeAsync(2000);
    expect(get).toHaveBeenCalled();
    sink.write = () => { throw new Error('socket closed'); };
    frame(reading({ currentEt: 30, player: vehicleReading({ id: 1, place: 1, totalLaps: 4, vehicleName: 'Car', vehicleClass: 'GT3' }) }));
    expect(service.hasClients()).toBe(false);
    get.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(get).not.toHaveBeenCalled();
    void service.stop();
  });

  it('reports asynchronous capture failure without stopping live driving', () => {
    const writer = new FakeWorker();
    const capture = new LiveCaptureController({ directory: 'unused', onPersist: () => {}, createWorker: () => writer as unknown as CaptureWorker });
    const { service, frame } = setup({ capture });
    frame(reading());
    expect(service.getSnapshot().audit?.status).toBe('recording');
    writer.emit('message', { type: 'failed', error: 'disk full' });
    frame(reading({ currentEt: 30 }));
    expect(service.getSnapshot()).toMatchObject({ lifecycle: 'driving', audit: { status: 'unavailable' } });
    void service.stop();
  });

  it('keeps the dashboard live when a recording step throws, showing the recording as stopped', () => {
    const writer = new FakeWorker();
    const capture = new LiveCaptureController({ directory: 'unused', onPersist: () => {}, createWorker: () => writer as unknown as CaptureWorker });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { service, frame } = setup({ capture });
    frame(reading());
    const observe = vi.spyOn(capture, 'observe').mockImplementation(() => { throw new Error('bad observation'); });
    expect(() => frame(reading({ currentEt: 30 }))).not.toThrow();
    expect(service.getSnapshot()).toMatchObject({ lifecycle: 'driving', session: { elapsedSeconds: 30 }, audit: { status: 'unavailable' } });
    expect(capture.status().error).toMatch(/bad observation/);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    observe.mockRestore();
    void service.stop();
  });

  it('sends the snapshot on connect and on every change, not for a moving clock alone', () => {
    const { service, frame } = setup();
    const sink = new FakeSink();
    service.addClient(sink);
    expect(sink.events()).toEqual(['snapshot']);
    expect(sink.data(0)).toMatchObject({ sequence: 0, lifecycle: 'offline', session: null });

    frame(reading());
    frame(reading({ currentEt: 11 }));
    expect(sink.events()).toEqual(['snapshot', 'snapshot']);
    expect(sink.data(1)).toMatchObject({ sequence: 1, lifecycle: 'driving', session: { kind: 'race', trackName: 'Spa' } });
    expect(service.getSnapshot().session?.elapsedSeconds).toBe(11);

    frame(reading({ player: vehicleReading({ id: 1, place: 1, totalLaps: 3, vehicleName: 'Car', vehicleClass: 'GT3' }) }));
    expect(sink.events()).toHaveLength(3);
    expect(sink.data(2)).toMatchObject({ sequence: 2, session: { playerPlace: 1 } });
  });

  it('reports lifecycle and session-loaded changes, and offline when the reader closes or dies', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    expect(warn).toHaveBeenCalledWith('[Live] Shared memory reader exited with code 1');
    warn.mockRestore();
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

  it('records reader failures in the active diagnostic sink without duplicating console warnings', async () => {
    const diagnostics = new LiveDiagnostics('unused');
    const record = vi.spyOn(diagnostics, 'record').mockImplementation(() => {});
    vi.spyOn(diagnostics, 'sink').mockReturnValue(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const capture = new LiveCaptureController({ directory: 'unused', onPersist: () => {}, diagnostics });
    const { service, worker } = setup({ capture });
    try {
      worker.emit('exit', 1);
      expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reader-failure',
        data: { reason: 'exited with code 1' } }));
      expect(warn).not.toHaveBeenCalled();
      await service.stop();
    } finally { vi.restoreAllMocks(); }
  });

  it('records the emitted timing and source clocks at most once a second', async () => {
    const diagnostics = new LiveDiagnostics('unused');
    vi.spyOn(diagnostics, 'begin').mockImplementation(() => {});
    const record = vi.spyOn(diagnostics, 'record').mockImplementation(() => {});
    vi.spyOn(diagnostics, 'sink').mockReturnValue(() => {});
    const writer = new FakeWorker();
    const capture = new LiveCaptureController({ directory: 'unused', onPersist: () => {}, diagnostics,
      createWorker: () => writer as unknown as CaptureWorker });
    const { service, frame } = setup({ capture });
    const sink = new FakeSink();
    service.addClient(sink);
    const samples = () => record.mock.calls.map(([event]) => event).filter(event => event.kind === 'lap-timing');
    try {
      frame(reading({ player: vehicleReading({ totalLaps: 5, bestLapTime: 100, bestLapSector1: 30,
        bestLapSector2: 60, sector: 2, curSector1: 29.5, timeIntoLap: 31, lapStartEt: 100, lapDist: 1200 }) }));
      vi.advanceTimersByTime(120);
      const sent = sink.chunks.findIndex(chunk => chunk.startsWith('event: timing'));
      expect(sent).toBeGreaterThan(-1);
      expect(samples()).toHaveLength(1);
      expect(samples()[0].data).toEqual({ timing: sink.data(sent), clients: 1,
        input: { currentEt: 10, totalLaps: 5, lapStartEt: 100, timeIntoLap: 31, lapDist: 1200 } });
      expect(sink.data(sent)).toMatchObject({ lapEstimate: {
        seconds: 99.5, referenceSeconds: 100, deltaSeconds: -0.5, source: 'sector',
      } });
      frame(reading());
      vi.advanceTimersByTime(120);
      expect(samples()).toHaveLength(1);
      vi.advanceTimersByTime(1000);
      frame(reading());
      vi.advanceTimersByTime(120);
      expect(samples()).toHaveLength(2);
    } finally {
      const stopping = service.stop();
      writer.emit('exit', 0);
      await stopping;
      vi.restoreAllMocks();
    }
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
    frame(reading({ gamePhase: 8, player: vehicleReading({ id: 1, place: 2, totalLaps: 4, finishStatus: 1 }) }));
    expect(slow.chunks).toHaveLength(writtenToSlow);

    slow.accepting = true;
    slow.emit('drain');
    expect(slow.chunks).toHaveLength(writtenToSlow + 1);
    expect(slow.data(writtenToSlow)).toMatchObject({ lifecycle: 'finished' });
  });

  it('terminates the worker on stop and does not restart it', () => {
    const { service, worker } = setup();
    void service.stop();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stop' });
    expect(worker.terminate).toHaveBeenCalled();
    worker.emit('exit', 0);
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('session details', () => {
    const lap = (laps: number, extra: Partial<LiveVehicleReading> = {}, header: Partial<LiveScoringReading> = {}) =>
      reading({ player: vehicleReading({ id: 1, place: 2, totalLaps: laps, ...extra }), ...header });

    it('fills weather and laps left into the snapshot and resends only for a real change', () => {
      const { service, frame } = setup();
      const sink = new FakeSink();
      service.addClient(sink);
      frame(lap(3, {}, { sessionCode: 1 }));
      expect(service.getSnapshot()).toMatchObject({ lapsLeft: null, weather: { trackTempC: 31, trackTempTrend: 'steady' }, recentLaps: [], sessionBest: null });

      // The race clock ends at 1800 s; the leader's 300 s laps convert it to laps.
      const leader = (lapStartEt: number) => vehicleReading({ id: 2, place: 1, lapStartEt, estimatedLapTime: 300 });
      // The player runs the leader's pace a few seconds behind it on the road.
      const chase = { lapStartEt: 5, estimatedLapTime: 300 };
      frame(lap(3, chase, { sessionCode: 10, leader: leader(0) }));
      expect(service.getSnapshot().lapsLeft).toEqual({ laps: 6, estimated: true });
      const before = sink.chunks.length;
      frame(lap(3, chase, { sessionCode: 10, leader: leader(0), currentEt: 14, trackTempC: 31.3 }));
      expect(sink.chunks).toHaveLength(before);
      frame(lap(3, chase, { sessionCode: 10, leader: leader(0), currentEt: 15, trackTempC: 33.4 }));
      expect(service.getSnapshot().weather?.trackTempC).toBe(33);
      expect(sink.chunks).toHaveLength(before + 1);
      frame(lap(4, { ...chase, lapStartEt: 305, lapDist: 5, timeIntoLap: 0.1 }, { sessionCode: 10, leader: leader(300), currentEt: 16, trackTempC: 33.4 }));
      expect(service.getSnapshot().lapsLeft).toEqual({ laps: 5, estimated: true });
    });

    it('puts a completed lap into the snapshot', () => {
      const { service, frame } = setup();
      frame(lap(3, { lapDist: 9_990, timeIntoLap: 99 }));
      frame(lap(4, { lapDist: 5, timeIntoLap: 0.1, lastLapTime: 100, lastSector1: 30, lastSector2: 60 }));
      expect(service.getSnapshot().recentLaps).toEqual([{ lapNumber: 4, lapSeconds: 100, sectors: [30, 30, 40], valid: true }]);
    });

    it('keeps the laps through a replay watched from the monitor, and shows the menu meanwhile', async () => {
      let replay = false;
      const get = vi.fn((path: string): Promise<RestAnswer> => (path === '/navigation/state'
        ? Promise.resolve({ ok: true, body: { state: { settingMode: replay ? 'SETTING_REPLAY_PLAYBACK' : 'SETTING_GRANDPRIX' } } })
        : Promise.resolve({ ok: false, reason: 'status' })));
      const { service, frame } = setup({ pit: { get } });
      service.addClient(new FakeSink());
      frame(lap(3, { lapDist: 9_990, timeIntoLap: 99 }));
      frame(lap(4, { lapDist: 5, timeIntoLap: 0.1, lastLapTime: 100, lastSector1: 30, lastSector2: 60 }));
      replay = true;
      await vi.advanceTimersByTimeAsync(11_000);
      // The replay's own frames go by without touching the session's laps.
      frame(lap(1, { lapDist: 50, timeIntoLap: 3 }));
      expect(service.getSnapshot()).toMatchObject({ lifecycle: 'menu', recentLaps: [], strategy: null });
      replay = false;
      await vi.advanceTimersByTimeAsync(11_000);
      frame(lap(4, { lapDist: 50, timeIntoLap: 1 }));
      expect(service.getSnapshot().lifecycle).toBe('driving');
      expect(service.getSnapshot().recentLaps).toEqual([{ lapNumber: 4, lapSeconds: 100, sectors: [30, 30, 40], valid: true }]);
    });

    it('shows the menu at once when the reader says a replay plays, and a failed state check does not end it', async () => {
      let stateOk = true;
      const get = vi.fn((path: string): Promise<RestAnswer> => (path === '/navigation/state' && stateOk
        ? Promise.resolve({ ok: true, body: { state: { settingMode: 'SETTING_GRANDPRIX' } } })
        : Promise.resolve({ ok: false, reason: 'status' })));
      const { service, worker, frame } = setup({ pit: { get } });
      service.addClient(new FakeSink());
      frame(lap(3, { lapDist: 9_990, timeIntoLap: 99 }));
      frame(lap(4, { lapDist: 5, timeIntoLap: 0.1, lastLapTime: 100, lastSector1: 30, lastSector2: 60 }));
      await vi.advanceTimersByTimeAsync(2000);
      worker.emit('message', { type: 'navigation', screen: 'replay', loadingProgress: null });
      frame(lap(1, { lapDist: 50, timeIntoLap: 3 }));
      expect(service.getSnapshot()).toMatchObject({ lifecycle: 'menu', recentLaps: [] });
      expect(service.isSessionLoaded()).toBe(true);
      stateOk = false;
      await vi.advanceTimersByTimeAsync(20_000);
      expect(service.getSnapshot().lifecycle).toBe('menu');
      worker.emit('message', { type: 'navigation', screen: 'session', loadingProgress: null });
      frame(lap(4, { lapDist: 50, timeIntoLap: 1 }));
      expect(service.getSnapshot().lifecycle).toBe('driving');
      expect(service.getSnapshot().recentLaps).toEqual([{ lapNumber: 4, lapSeconds: 100, sectors: [30, 30, 40], valid: true }]);
    });

    it('resolves the identity from the game, then from the pit poller state check while a dashboard is open', async () => {
      const readNavigation = vi.fn(() => Promise.resolve({ ok: true as const, navigation: { sceneDesc: 'LEMANSWEC_MULSANNE', classes: [] } }));
      const state = { state: { settingMode: 'SETTING_GRANDPRIX' }, loadingStatus: { track: { sceneDesc: 'LEMANSWEC' } } };
      const get = vi.fn((path: string) => Promise.resolve<RestAnswer>(path === '/navigation/state' ? { ok: true, body: state } : { ok: false, reason: 'error' }));
      const personalBest = vi.fn(() => 228.4);
      const { service, frame } = setup({ personalBest, identity: { readNavigation }, pit: { get } });
      const sink = new FakeSink();
      service.addClient(sink);
      frame(lap(3, { vehicleName: 'Ginetta G61', vehicleClass: 'LMP3' }, { trackName: 'Circuit de la Sarthe' }));
      expect(service.getSnapshot().identity).toMatchObject({ layoutKey: null, carClass: 'LMP3', personalBestSeconds: null });
      await vi.advanceTimersByTimeAsync(60_000);
      // One reader of the navigation state at a time: the identity asks nothing itself while the poller runs.
      expect(readNavigation).not.toHaveBeenCalled();
      expect(get).toHaveBeenCalledWith('/navigation/state');
      expect(service.getSnapshot().identity).toMatchObject({ layoutKey: 'sarthe_full', carClass: 'LMP3', personalBestSeconds: 228.4 });
      expect(sink.data(2)).toMatchObject({ sequence: 2, identity: { layoutKey: 'sarthe_full' } });
      void service.stop();
    });

    it('asks LMU itself for the identity while no dashboard is open', async () => {
      const readNavigation = vi.fn(() => Promise.resolve({ ok: true as const, navigation: { sceneDesc: 'LEMANSWEC', classes: [] } }));
      const { service, frame } = setup({ identity: { readNavigation } });
      frame(lap(3, { vehicleName: 'Ginetta G61', vehicleClass: 'LMP3' }, { trackName: 'Circuit de la Sarthe' }));
      await vi.advanceTimersByTimeAsync(0);
      expect(readNavigation).toHaveBeenCalledTimes(1);
      expect(service.getSnapshot().identity).toMatchObject({ layoutKey: 'sarthe_full' });
      void service.stop();
    });

    it('asks LMU for nothing in the menu', async () => {
      const readNavigation = vi.fn(() => Promise.resolve({ ok: false as const }));
      const { service, frame } = setup({ identity: { readNavigation } });
      frame(reading({ numVehicles: 0 }));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(readNavigation).not.toHaveBeenCalled();
      expect(service.getSnapshot().identity).toBeNull();
    });
  });

  describe('timing events', () => {
    const drive = (frame: (scoring: LiveScoringReading) => void, dist: number, time: number) =>
      frame(reading({ currentEt: time, player: vehicleReading({ id: 1, totalLaps: 3, lapDist: dist, timeIntoLap: time }) }));
    const timings = (sink: FakeSink): number[] => sink.events().flatMap((name, i) => (name === 'timing' ? [i] : []));
    /** One flush tick after the rate limit has passed. */
    const settle = (): void => { vi.advanceTimersByTime(TIMING_MIN_INTERVAL_MS + PEDAL_FLUSH_MS); };

    it('sends the newest lap progress about 5 times a second, only while on track', () => {
      const { service, frame } = setup();
      const sink = new FakeSink();
      service.addClient(sink);
      drive(frame, 100, 1);
      vi.advanceTimersByTime(PEDAL_FLUSH_MS);
      expect(timings(sink)).toHaveLength(1);
      expect(sink.data(timings(sink)[0])).toEqual({
        lapNumber: 4, isOutLap: false, sector: 1, lapElapsedSeconds: null, sectors: [null, null, null], deltaSeconds: null, lapEstimate: null, sectorDeltas: [null, null, null], tyreSurfaceAvgC: null,
      });

      // Two frames inside one interval: only the newest goes out, once the interval has passed.
      drive(frame, 200, 2);
      drive(frame, 300, 3);
      vi.advanceTimersByTime(PEDAL_FLUSH_MS);
      expect(timings(sink)).toHaveLength(1);
      settle();
      expect(timings(sink)).toHaveLength(2);
      settle();
      settle();
      expect(timings(sink)).toHaveLength(2);

      frame(reading({ inRealtime: false }));
      settle();
      expect(timings(sink)).toHaveLength(2);
    });

    it('carries the tyre temperature from the telemetry and never goes to a blocked page', () => {
      const { service, frame, worker } = setup();
      const slow = new FakeSink();
      const fast = new FakeSink();
      service.addClient(slow);
      service.addClient(fast);
      worker.emit('message', { type: 'frame', tyreSurfaceAvgC: 81.5 });
      drive(frame, 100, 1);
      settle();
      expect(fast.data(timings(fast)[0])).toMatchObject({ tyreSurfaceAvgC: 81.5 });
      slow.accepting = false;
      drive(frame, 200, 2);
      settle();
      const written = slow.chunks.length;
      drive(frame, 300, 3);
      settle();
      expect(slow.chunks).toHaveLength(written);
      expect(timings(fast)).toHaveLength(3);
    });

    it('sends no timing that was made before a page connected', () => {
      const { service, frame } = setup();
      drive(frame, 100, 1);
      const sink = new FakeSink();
      service.addClient(sink);
      settle();
      expect(sink.events()).toEqual(['snapshot']);
    });
  });
  describe('pit data', () => {
    const answers = (replay: boolean) => (path: string): Promise<RestAnswer> => {
      if (path === '/navigation/state') return Promise.resolve({ ok: true, body: { state: { settingMode: replay ? 'SETTING_REPLAY_PLAYBACK' : 'SETTING_GRANDPRIX' } } });
      if (path === '/rest/watch/standings') return Promise.resolve({ ok: true, body: [{ player: true, veFraction: 0.62, fuelFraction: 0.5, pitState: 'NONE', penalties: 0 }] });
      if (path === '/rest/strategy/pitstop-estimate') return Promise.resolve({ ok: true, body: { total: 33.7, damage: 30, penalties: 0, fuel: 3.7, ve: 1.7, tires: 0 } });
      return Promise.resolve({ ok: false, reason: 'status' });
    };

    it('reads the pit data only while a dashboard is open and a session is loaded, into the snapshot strategy', async () => {
      const get = vi.fn(answers(false));
      const { service, frame } = setup({ pit: { get } });
      frame(reading());
      await vi.advanceTimersByTimeAsync(5000);
      expect(get).not.toHaveBeenCalled();
      const sink = new FakeSink();
      const remove = service.addClient(sink);
      await vi.advanceTimersByTimeAsync(5000);
      expect(get).toHaveBeenCalledWith('/rest/watch/standings');
      expect(service.getSnapshot().strategy).toMatchObject({
        resource: { kind: 've', amount: 62 },
        pit: { serviceSeconds: 34, penalties: 0 },
      });
      remove();
      const calls = get.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(get.mock.calls.length).toBe(calls);
    });

    it('treats a replay as the menu, and reads nothing but the game state until it ends', async () => {
      const get = vi.fn(answers(true));
      const { service, frame, lifecycles } = setup({ pit: { get } });
      service.addClient(new FakeSink());
      frame(reading());
      await vi.advanceTimersByTimeAsync(20_000);
      expect(service.getSnapshot().lifecycle).toBe('menu');
      expect(lifecycles).toEqual(['driving', 'menu']);
      expect(new Set(get.mock.calls.map(([path]) => path))).toEqual(new Set(['/navigation/state']));
    });

    it('keeps the scans held while a replay plays (the session can still be loaded), and releases them after', async () => {
      let replay = true;
      const get = vi.fn((path: string) => answers(replay)(path));
      const { service, worker, frame, loaded } = setup({ pit: { get } });
      service.addClient(new FakeSink());
      frame(reading());
      await vi.advanceTimersByTimeAsync(5000);
      expect(service.getSnapshot().lifecycle).toBe('menu');
      expect(service.isSessionLoaded()).toBe(true);
      expect(loaded).toEqual([true]);
      // The replay ends with the driver back in the session: still loaded, nothing sent.
      replay = false;
      await vi.advanceTimersByTimeAsync(20_000);
      expect(service.getSnapshot().lifecycle).toBe('driving');
      expect(loaded).toEqual([true]);
      // The driver leaves for the main menu: released.
      worker.emit('message', { type: 'navigation', screen: 'menu', loadingProgress: null });
      expect(loaded).toEqual([true, false]);
    });

    it('shows the loading screen with its progress from the navigation notice', () => {
      const { service, worker, frame } = setup();
      frame(reading());
      worker.emit('message', { type: 'navigation', screen: 'loading', loadingProgress: 0.4 });
      expect(service.getSnapshot()).toMatchObject({ lifecycle: 'loading', loadingProgress: 0.4, session: null, strategy: null });
      worker.emit('message', { type: 'navigation', screen: 'session', loadingProgress: null });
      expect(service.getSnapshot()).toMatchObject({ lifecycle: 'driving', loadingProgress: null });
    });
  });
});
