import { beforeEach, describe, expect, it } from 'vitest';
import { activeSectorDelta, LiveLapTiming } from '../../../shared/domain/live/liveLapTiming.js';
import type { LiveVehicleReading } from '../../../shared/domain/live/liveLifecycle.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';

const TRACK = 10_000;
/** The session clock: every reading is a second later than the one before. */
let clock = 1000;
const tick = (): number => ++clock;
const S1 = 30;

interface LapPlan {
  /** Lap time in seconds; the lap is driven at a steady speed. */
  seconds: number;
  /** Laps completed when the lap starts. */
  completed: number;
  inPits?: boolean;
  endInPits?: boolean;
  /** Time at which the game stops counting the lap time. */
  loseFlagAt?: number;
  /** First time (seconds into the lap) the app sees the lap. */
  joinAt?: number;
  /** The game's sector 2 time (cumulative) of this lap. */
  s2Cumulative?: number;
}

/** Feeds one lap at 1 reading a second, then the reading right after the line that carries the game's last-lap fields. */
function driveLap(timing: LiveLapTiming, plan: LapPlan, session = 10): void {
  const { seconds, completed, s2Cumulative = seconds * 0.6 } = plan;
  for (let t = plan.joinAt ?? 0; t < seconds; t++) {
    const timeIntoLap = t;
    timing.update(scoringReading({
      sessionCode: session, currentEt: tick(), trackLength: TRACK,
      player: vehicleReading({
        totalLaps: completed, lapDist: (TRACK * t) / seconds, timeIntoLap,
        inPits: ((plan.inPits ?? false) && t < 5) || ((plan.endInPits ?? false) && t >= seconds - 2),
        countLapFlag: plan.loseFlagAt !== undefined && t >= plan.loseFlagAt ? 1 : 2,
        sector: t < S1 ? 1 : t < s2Cumulative ? 2 : 0,
        curSector1: t >= S1 ? S1 : -1, curSector2: t >= s2Cumulative ? s2Cumulative : -1,
      }),
    }));
  }
  timing.update(scoringReading({
    sessionCode: session, currentEt: tick(), trackLength: TRACK,
    player: vehicleReading({
      totalLaps: completed + 1, lapDist: 3, timeIntoLap: 0.1,
      lastLapTime: plan.loseFlagAt === undefined ? seconds : -1, lastSector1: S1, lastSector2: s2Cumulative,
    }),
  }));
}

function reading(player: Partial<LiveVehicleReading>, currentEt = tick()) {
  return scoringReading({ currentEt, trackLength: TRACK, player: vehicleReading(player) });
}

describe('activeSectorDelta', () => {
  it('is the lap delta minus the done sectors, unknown without the lap delta or a done sector', () => {
    expect(activeSectorDelta({ sector: 1, deltaSeconds: 0.2, sectorDeltas: [null, null, null] })).toBe(0.2);
    expect(activeSectorDelta({ sector: 3, deltaSeconds: -0.184, sectorDeltas: [-0.12, 0.064, null] })).toBe(-0.128);
    expect(activeSectorDelta({ sector: 2, deltaSeconds: null, sectorDeltas: [-0.12, null, null] })).toBeNull();
    expect(activeSectorDelta({ sector: 3, deltaSeconds: 0.1, sectorDeltas: [null, 0.05, null] })).toBeNull();
  });
});

describe('LiveLapTiming', () => {
  beforeEach(() => { clock = 1000; });

  it('splits the cumulative sector fields into S1, S2 and S3 and keeps the last three laps', () => {
    const timing = new LiveLapTiming();
    [100, 99, 98, 97].forEach((seconds, i) => driveLap(timing, { seconds, completed: i, s2Cumulative: 60 }));
    expect(timing.recentLaps.map(lap => lap.lapNumber)).toEqual([2, 3, 4]);
    expect(timing.recentLaps[2]).toEqual({ lapNumber: 4, lapSeconds: 97, sectors: [30, 30, 37], valid: true });
  });

  it('counts only timed laps that were driven from the line to the line outside the pits as valid', () => {
    const timing = new LiveLapTiming();
    driveLap(timing, { seconds: 100, completed: 0, inPits: true });
    driveLap(timing, { seconds: 100, completed: 1, loseFlagAt: 50 });
    driveLap(timing, { seconds: 100, completed: 2, endInPits: true });
    driveLap(timing, { seconds: 99, completed: 3 });
    expect(timing.recentLaps.map(lap => lap.valid)).toEqual([false, false, true]);
    // The lap that lost its time has no lap time (the game reports -1), its sectors are still the game's.
    driveLap(timing, { seconds: 101, completed: 4, loseFlagAt: 10 });
    expect(timing.recentLaps[2]).toMatchObject({ lapNumber: 5, lapSeconds: null, sectors: [30, 30.6, null], valid: false });
  });

  it('keeps the best valid lap, its sectors, the best sectors over laps and the best possible lap', () => {
    const timing = new LiveLapTiming();
    driveLap(timing, { seconds: 100, completed: 0, s2Cumulative: 62 });
    expect(timing.sessionBest).toMatchObject({ lapSeconds: 100, lapSectors: [30, 32, 38], bestPossibleSeconds: 100 });
    driveLap(timing, { seconds: 101, completed: 1, s2Cumulative: 60 });
    driveLap(timing, { seconds: 99.5, completed: 2, loseFlagAt: 5 });
    expect(timing.sessionBest).toEqual({
      lapSeconds: 100, lapSectors: [30, 32, 38], bestSectors: [30, 30, 38], bestPossibleSeconds: 98,
    });
    driveLap(timing, { seconds: 98, completed: 3, s2Cumulative: 61 });
    expect(timing.sessionBest).toMatchObject({ lapSeconds: 98, lapSectors: [30, 31, 37], bestSectors: [30, 30, 37] });
  });

  it('takes the delta from the session-best lap trace at the same distance, with linear interpolation', () => {
    const timing = new LiveLapTiming();
    expect(timing.timing()).toBeNull();
    driveLap(timing, { seconds: 100, completed: 0 });
    // Same distance, 2 s later than the reference (which covers 100 m a second).
    timing.update(reading({ totalLaps: 1, lapDist: 2_500, timeIntoLap: 27, sector: 1, curSector1: -1 }));
    expect(timing.timing()).toMatchObject({ lapNumber: 2, sector: 1, deltaSeconds: 2 });
    // Between two trace samples: 1234.5 m is 12.345 s on the reference.
    timing.update(reading({ totalLaps: 1, lapDist: 1_234.5, timeIntoLap: 11.845, sector: 1 }));
    expect(timing.timing()?.deltaSeconds).toBeCloseTo(-0.5, 3);
  });

  it('gives no delta without a reference, in the pits, on an out lap or before the line', () => {
    const timing = new LiveLapTiming();
    timing.update(reading({ totalLaps: 0, lapDist: 3_000, timeIntoLap: 30 }));
    expect(timing.timing()?.deltaSeconds).toBeNull();
    driveLap(timing, { seconds: 100, completed: 0 });
    timing.update(reading({ totalLaps: 1, lapDist: 3_000, timeIntoLap: 30, inPits: true }));
    expect(timing.timing()?.deltaSeconds).toBeNull();
    timing.update(reading({ totalLaps: 1, lapDist: -20, timeIntoLap: -1 }));
    expect(timing.timing()?.deltaSeconds).toBeNull();
    driveLap(timing, { seconds: 100, completed: 1, inPits: true });
    timing.update(reading({ totalLaps: 2, lapDist: 3_000, timeIntoLap: 30 }));
    expect(timing.timing()?.deltaSeconds).toBeNull();
  });

  it('switches the reference to a faster valid lap, and keeps it for a slower or invalid one', () => {
    const timing = new LiveLapTiming();
    driveLap(timing, { seconds: 100, completed: 0 });
    driveLap(timing, { seconds: 80, completed: 1 });
    const at = (dist: number, time: number): number | null => {
      timing.update(reading({ totalLaps: 2, lapDist: dist, timeIntoLap: time }));
      return timing.timing()?.deltaSeconds ?? null;
    };
    // The 80 s lap covers 125 m a second.
    expect(at(5_000, 40)).toBeCloseTo(0, 5);
    driveLap(timing, { seconds: 90, completed: 2 });
    driveLap(timing, { seconds: 70, completed: 3, loseFlagAt: 30 });
    timing.update(reading({ totalLaps: 4, lapDist: 5_000, timeIntoLap: 41 }));
    expect(timing.timing()?.deltaSeconds).toBeCloseTo(1, 5);
  });

  it('sector deltas compare the completed split sectors with the session-best lap', () => {
    const timing = new LiveLapTiming();
    driveLap(timing, { seconds: 100, completed: 0, s2Cumulative: 62 });
    const lap = { totalLaps: 1, lastLapTime: 100 };
    timing.update(reading({ ...lap, curSector1: -1, curSector2: -1, sector: 1 }));
    expect(timing.timing()?.sectorDeltas).toEqual([null, null, null]);
    timing.update(reading({ ...lap, curSector1: 29.5, curSector2: -1, sector: 2 }));
    expect(timing.timing()?.sectorDeltas).toEqual([-0.5, null, null]);
    timing.update(reading({ ...lap, curSector1: 29.5, curSector2: 63, sector: 0 }));
    expect(timing.timing()).toMatchObject({ sector: 3, sectorDeltas: [-0.5, 1.5, null] });
  });

  it('publishes each sector at its crossing before a completed lap or best exists, then clears at the finish', () => {
    const timing = new LiveLapTiming();
    timing.update(reading({ totalLaps: 0, sector: 1, curSector1: 31, curSector2: 64 }));
    expect(timing.timing()?.sectors).toEqual([null, null, null]);

    timing.update(reading({ totalLaps: 0, sector: 2, curSector1: 29.5, curSector2: 64, timeIntoLap: 31.2345 }));
    expect(timing.timing()).toMatchObject({ lapElapsedSeconds: 31.235, sectors: [29.5, null, null], sectorDeltas: [null, null, null] });
    expect(timing.recentLaps).toEqual([]);
    expect(timing.sessionBest).toBeNull();

    timing.update(reading({ totalLaps: 0, sector: 0, curSector1: 29.5, curSector2: 63 }));
    expect(timing.timing()?.sectors).toEqual([29.5, 33.5, null]);
    timing.update(reading({
      totalLaps: 1, sector: 1, curSector1: 29.5, curSector2: 63,
      lastSector1: 29.5, lastSector2: 63, lastLapTime: 101,
    }));
    expect(timing.recentLaps[0].sectors).toEqual([29.5, 33.5, 38]);
    expect(timing.timing()?.sectors).toEqual([null, null, null]);
    expect(timing.timing()?.sectorDeltas).toEqual([null, null, null]);
  });

  it('keeps unavailable splits unknown and suppresses current splits on an out lap', () => {
    const timing = new LiveLapTiming();
    timing.update(reading({ totalLaps: 0, sector: 0, curSector1: -1, curSector2: 63 }));
    expect(timing.timing()?.sectors).toEqual([null, null, null]);
    timing.update(reading({ totalLaps: 0, sector: 0, curSector1: 30, curSector2: 29 }));
    expect(timing.timing()?.sectors).toEqual([30, null, null]);
    timing.reset();
    timing.update(reading({ totalLaps: 0, inPits: true }));
    timing.update(reading({ totalLaps: 0, inPits: false, sector: 0, curSector1: 30, curSector2: 63 }));
    expect(timing.timing()?.sectors).toEqual([null, null, null]);
  });

  it('a lap seen only from the middle is no reference and no valid lap, and a full lap after it is', () => {
    const timing = new LiveLapTiming();
    timing.update(reading({ totalLaps: 0, lapDist: 4_000, timeIntoLap: 40, sector: 1 }));
    expect(timing.timing()?.deltaSeconds).toBeNull();
    driveLap(timing, { seconds: 100, completed: 0, joinAt: 40 });
    expect(timing.recentLaps).toEqual([{ lapNumber: 1, lapSeconds: 100, sectors: [30, 30, 40], valid: false }]);
    expect(timing.sessionBest).toBeNull();
    expect(timing.timing()?.deltaSeconds).toBeNull();
    driveLap(timing, { seconds: 100, completed: 1 });
    timing.update(reading({ totalLaps: 2, lapDist: 5_000, timeIntoLap: 51 }));
    expect(timing.timing()?.deltaSeconds).toBeCloseTo(1, 5);
  });

  it('seeds the session best from the game\'s best lap when the app joins a session already under way', () => {
    const timing = new LiveLapTiming();
    timing.update(reading({ totalLaps: 5, lapDist: 100, timeIntoLap: 1, bestLapTime: 99.2, bestLapSector1: 29.8, bestLapSector2: 60.1 }));
    expect(timing.sessionBest).toEqual({
      lapSeconds: 99.2, lapSectors: [29.8, 30.3, 39.1], bestSectors: [null, null, null], bestPossibleSeconds: null,
    });
    expect(timing.timing()?.deltaSeconds).toBeNull();
    driveLap(timing, { seconds: 99.8, completed: 5 });
    expect(timing.sessionBest?.lapSeconds).toBe(99.2);
    expect(timing.recentLaps).toHaveLength(1);
  });

  it('forgets everything on a new session, a restarted clock, fewer laps or no player', () => {
    const resets: Array<(timing: LiveLapTiming) => void> = [
      timing => timing.update(scoringReading({ sessionCode: 5, player: vehicleReading({ totalLaps: 2 }) })),
      timing => timing.update(scoringReading({ trackName: 'Spa', player: vehicleReading({ totalLaps: 2 }) })),
      timing => timing.update(reading({ totalLaps: 2 }, 100)),
      timing => timing.update(reading({ totalLaps: 0 })),
      timing => timing.update(scoringReading({ player: null })),
      timing => timing.update(null),
    ];
    for (const reset of resets) {
      const timing = new LiveLapTiming();
      driveLap(timing, { seconds: 100, completed: 0 });
      timing.update(reading({ totalLaps: 1 }));
      expect(timing.sessionBest).not.toBeNull();
      reset(timing);
      expect(timing.recentLaps).toEqual([]);
      expect(timing.sessionBest?.bestSectors ?? null).toBeNull();
      timing.update(reading({ totalLaps: 2, lapDist: 3_000, timeIntoLap: 30 }));
      expect(timing.timing()?.deltaSeconds ?? null).toBeNull();
    }
  });

  it('drops a trace that went backwards or lost samples, so a lap with a spin is no reference', () => {
    const timing = new LiveLapTiming();
    for (const [dist, time] of [[10, 1], [2_000, 20], [1_500, 25], [3_000, 40]]) {
      timing.update(reading({ totalLaps: 0, lapDist: dist, timeIntoLap: time }));
    }
    timing.update(reading({ totalLaps: 1, lapDist: 3, timeIntoLap: 0.1, lastLapTime: 100, lastSector1: 30, lastSector2: 60 }));
    expect(timing.recentLaps[0].valid).toBe(false);
    expect(timing.sessionBest).toBeNull();
  });
});
