import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveService } from '../../../server/live/liveService.js';
import type { LiveWorker } from '../../../server/live/liveService.js';
import { liveSessionKind } from '../../../shared/domain/live/liveLifecycle.js';
import type { LiveGameScreen, LiveScoringReading } from '../../../shared/domain/live/liveLifecycle.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';

class Reader extends EventEmitter {
  public postMessage = vi.fn();
  public terminate = vi.fn(() => Promise.resolve(0));
  public unref = vi.fn();
}

const services: LiveService[] = [];
function setup() {
  const worker = new Reader();
  const service = new LiveService({ createWorker: () => worker as unknown as LiveWorker,
    pit: { get: async () => ({ ok: false, reason: 'error' }) },
    identity: { readNavigation: async () => ({ ok: false, reason: 'error' }) },
  });
  services.push(service);
  service.start();
  return { service, worker,
    navigation: (screen: LiveGameScreen) => worker.emit('message', { type: 'navigation', screen, loadingProgress: screen === 'loading' ? 0.5 : null }),
    frame: (sessionCode: number, overrides: Partial<LiveScoringReading> = {}) => {
      worker.emit('message', { type: 'frame', scoring: scoringReading({ sessionCode,
        currentEt: 0, endEt: 300, inRealtime: false, gamePhase: 0,
        player: vehicleReading({ totalLaps: 0, lapStartEt: 0, timeIntoLap: 0, lapDist: 0 }), ...overrides }) });
      return service.getSnapshot();
    },
  };
}

// Every nonempty subset, in game order: optional practice, qualifying, warmup, race.
const weekends = Array.from({ length: 15 }, (_, index) => [1, 5, 9, 10].filter((_, bit) => (index + 1) & (1 << bit)));

describe('live event transitions through the service', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { for (const service of services.splice(0)) void service.stop(); vi.useRealTimers(); });

  it.each(weekends.map(codes => [codes.map(liveSessionKind).join(' → '), codes] as const))
  ('supports the single-player weekend %s', (_name, codes) => {
    const { service, navigation, frame } = setup();
    navigation('menu');
    expect(service.getSnapshot()).toMatchObject({ lifecycle: 'menu', session: null, strategy: null });
    let hadQualifying = false;
    for (const code of codes) {
      navigation('loading');
      expect(service.isSessionLoaded()).toBe(true);
      expect(service.getSnapshot()).toMatchObject({ lifecycle: 'loading', session: null, weather: null, recentLaps: [] });
      // Shared memory can update before navigation reports that loading is complete.
      frame(code);
      expect(service.getSnapshot().lifecycle).toBe('loading');
      navigation('session');
      const garage = service.getSnapshot();
      expect(garage).toMatchObject({ lifecycle: 'garage', session: { kind: liveSessionKind(code) }, recentLaps: [], sessionBest: null, result: null });
      expect(garage.qualifyingResult?.settled ?? false).toBe(hadQualifying);
      if (code === 10) {
        for (const phase of [0, 1, 2, 3, 4]) {
          expect(frame(code, { inRealtime: true, gamePhase: phase }).lifecycle).toBe('starting');
        }
      }
      expect(frame(code, { currentEt: 1, inRealtime: true, gamePhase: 5 }).lifecycle).toBe('driving');
      frame(code, { currentEt: 101, inRealtime: true, gamePhase: 5,
        player: vehicleReading({ totalLaps: 1, lapDist: 0, lastLapTime: 100, lapStartEt: 101, timeIntoLap: 0 }) });
      const flagged = frame(code, { currentEt: 301, inRealtime: true, gamePhase: 8,
        allDriversFinished: true, player: vehicleReading({ totalLaps: 2, finishStatus: 1, lastLapTime: 100 }) });
      expect(flagged).toMatchObject({ lifecycle: 'finished', result: { kind: liveSessionKind(code) } });
      expect(flagged.recentLaps.length).toBeGreaterThan(0);
      if (code === 5) { expect(flagged.qualifyingResult?.settled).toBe(true); hadQualifying = true; }
    }
    navigation('menu');
    expect(service.isSessionLoaded()).toBe(false);
    expect(service.getSnapshot()).toMatchObject({ lifecycle: 'menu', session: null, strategy: null,
      weather: null, recentLaps: [], sessionBest: null, result: null, qualifyingResult: null });
  });

  it('handles an online three-stage event, waiting for the qualifying field and the player race flag', () => {
    const { service, navigation, frame } = setup();
    navigation('loading'); navigation('session');
    frame(1); frame(1, { currentEt: 200, inRealtime: true, gamePhase: 5 });
    frame(5);
    expect(service.getSnapshot()).toMatchObject({ lifecycle: 'garage', session: { kind: 'qualifying' } });
    frame(5, { currentEt: 300, inRealtime: true, gamePhase: 8,
      allDriversFinished: false, player: vehicleReading({ finishStatus: 0 }) });
    expect(service.getSnapshot()).toMatchObject({ lifecycle: 'driving', qualifyingResult: { settled: false } });
    frame(5, { currentEt: 310, gamePhase: 8, allDriversFinished: false, player: vehicleReading({ finishStatus: 1 }) });
    expect(service.getSnapshot()).toMatchObject({ lifecycle: 'garage', qualifyingResult: { settled: false } });
    frame(5, { currentEt: 320, gamePhase: 8, allDriversFinished: true, player: vehicleReading({ finishStatus: 1 }) });
    frame(10);
    expect(service.getSnapshot()).toMatchObject({ lifecycle: 'garage', qualifyingResult: { settled: true } });
    frame(10, { currentEt: 1, inRealtime: true, gamePhase: 3 });
    frame(10, { currentEt: 10, inRealtime: true, gamePhase: 5 });
    const lastLap = frame(10, { currentEt: 301, inRealtime: true, gamePhase: 8,
      leader: vehicleReading({ id: 1, place: 1, finishStatus: 1 }), player: vehicleReading({ finishStatus: 0 }) });
    expect(lastLap).toMatchObject({ lifecycle: 'driving', result: null });
    expect(frame(10, { currentEt: 330, inRealtime: true, gamePhase: 8,
      player: vehicleReading({ finishStatus: 1 }) })).toMatchObject({ lifecycle: 'finished', result: { kind: 'race' } });
  });

  it('resets a practice-only server when returning to the menu and rejoining the same car and circuit', () => {
    const { service, navigation, frame } = setup();
    navigation('session');
    frame(1, { currentEt: 120, inRealtime: true, gamePhase: 5,
      player: vehicleReading({ bestLapTime: 99 }) });
    expect(service.getSnapshot().sessionBest?.lapSeconds).toBe(99);
    navigation('menu');
    navigation('loading');
    frame(1, { currentEt: 500 });
    navigation('session');
    expect(service.getSnapshot()).toMatchObject({ lifecycle: 'garage', sessionBest: null, recentLaps: [], qualifyingResult: null });
  });

  it.each([2, 3])('shows a race retirement/status %i and clears on game close', finishStatus => {
    const { service, worker, frame } = setup();
    frame(13, { inRealtime: true, gamePhase: 8, player: vehicleReading({ finishStatus }) });
    expect(service.getSnapshot()).toMatchObject({ lifecycle: 'finished', result: { finishStatus } });
    worker.emit('message', { type: 'closed' });
    expect(service.getSnapshot()).toMatchObject({ lifecycle: 'offline', result: null, qualifyingResult: null });
  });
});
