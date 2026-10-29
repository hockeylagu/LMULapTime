import { beforeEach, describe, expect, it } from 'vitest';
import { LiveLapTiming } from '../../../shared/domain/live/liveLapTiming.js';
import type { LiveVehicleReading } from '../../../shared/domain/live/liveLifecycle.js';
import { scoringReading, vehicleReading } from '../../helpers/liveReadings.js';

const TRACK = 10_000;
/** The session clock: every reading is a second later than the one before. */
let clock = 1000;
const anchors = new Map<number, number>();
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
  const existing = anchors.get(completed);
  const origin = existing ?? clock + 1;
  anchors.set(completed, origin);
  for (let t = plan.joinAt ?? (existing === undefined ? 0 : Math.max(1, Math.floor(clock - origin) + 1)); t < seconds; t++) {
    const timeIntoLap = t;
    timing.update(scoringReading({
      sessionCode: session, currentEt: clock = origin + t, trackLength: TRACK,
      player: vehicleReading({
        lapStartEt: origin, totalLaps: completed, lapDist: (TRACK * t) / seconds, timeIntoLap,
        inPits: ((plan.inPits ?? false) && t < 5) || ((plan.endInPits ?? false) && t >= seconds - 2),
        countLapFlag: plan.loseFlagAt !== undefined && t >= plan.loseFlagAt ? 1 : 2,
        sector: t < S1 ? 1 : t < s2Cumulative ? 2 : 0,
        curSector1: t >= S1 ? S1 : -1, curSector2: t >= s2Cumulative ? s2Cumulative : -1,
      }),
    }));
  }
  anchors.set(completed + 1, origin + seconds);
  timing.update(scoringReading({
    sessionCode: session, currentEt: clock = origin + seconds + 0.1, trackLength: TRACK,
    player: vehicleReading({
      lapStartEt: origin + seconds, totalLaps: completed + 1, lapDist: 3, timeIntoLap: 0.1,
      lastLapTime: plan.loseFlagAt === undefined ? seconds : -1, lastSector1: S1, lastSector2: s2Cumulative,
    }),
  }));
}

function reading(player: Partial<LiveVehicleReading>, currentEt?: number) {
  const completed = player.totalLaps ?? 7;
  const anchor = player.lapStartEt ?? anchors.get(completed) ?? clock + 1;
  anchors.set(completed, anchor);
  clock = currentEt ?? Math.max(clock + 0.2, anchor + (player.timeIntoLap ?? 20));
  return scoringReading({ currentEt: clock, trackLength: TRACK, player: vehicleReading({ lapStartEt: anchor, ...player }) });
}

describe('LiveLapTiming', () => {
  beforeEach(() => { clock = 1000; anchors.clear(); });

  it('uses real elapsed time even when engine progress repeats at the same distance', () => {
    const timing = new LiveLapTiming();
    for (let t = 0; t < 100; t++) timing.update(scoringReading({ currentEt: 100 + t, trackLength: TRACK,
      player: vehicleReading({ totalLaps: 0, lapStartEt: 100, lapDist: t * 100, timeIntoLap: t / 2 }) }));
    timing.update(scoringReading({ currentEt: 200.1, trackLength: TRACK,
      player: vehicleReading({ totalLaps: 1, lapStartEt: 200, lapDist: 5, timeIntoLap: 0.025, lastLapTime: 100 }) }));
    timing.update(scoringReading({ currentEt: 223, trackLength: TRACK,
      player: vehicleReading({ totalLaps: 1, lapStartEt: 200, lapDist: 2500, timeIntoLap: 12.5 }) }));
    expect(timing.timing()).toMatchObject({ lapElapsedSeconds: 23, deltaSeconds: -2,
      lapEstimate: { seconds: 98, source: 'distance' } });
    timing.update(scoringReading({ currentEt: 232, trackLength: TRACK,
      player: vehicleReading({ totalLaps: 1, lapStartEt: 200, lapDist: 2500, timeIntoLap: 12.5 }) }));
    expect(timing.timing()).toMatchObject({ lapElapsedSeconds: 32, deltaSeconds: 7,
      lapEstimate: { seconds: 107, source: 'distance' } });
    // Stopping at the same distance still consumes real time; a distance-derived clock would freeze.
    timing.update(scoringReading({ currentEt: 235, trackLength: TRACK,
      player: vehicleReading({ totalLaps: 1, lapStartEt: 200, lapDist: 2500, timeIntoLap: 12.5 }) }));
    expect(timing.timing()).toMatchObject({ lapElapsedSeconds: 35, deltaSeconds: 10,
      lapEstimate: { seconds: 110, source: 'distance' } });
  });

  it('starts an unanchored out-lap on observed departure and advances in game seconds at pit speed', () => {
    const timing = new LiveLapTiming();
    const player = { totalLaps: 0, lapStartEt: 0, inPits: true, lapDist: 202.58, timeIntoLap: 3.223 };
    timing.update(scoringReading({ currentEt: 27.8, inRealtime: false, player: vehicleReading(player) }));
    timing.update(scoringReading({ currentEt: 29.8, player: vehicleReading(player) }));
    expect(timing.timing()?.lapElapsedSeconds).toBeNull();
    timing.update(scoringReading({ currentEt: 31, player: vehicleReading({ ...player, lapDist: 203.412, timeIntoLap: 3.236 }) }));
    timing.update(scoringReading({ currentEt: 32, player: vehicleReading({ ...player, lapDist: 208.752, timeIntoLap: 3.318 }) }));
    expect(timing.timing()).toMatchObject({ isOutLap: true, lapElapsedSeconds: 1, deltaSeconds: null });
    timing.update(scoringReading({ currentEt: 33, player: vehicleReading({ ...player, lapDist: 208.752, timeIntoLap: 3.318 }) }));
    expect(timing.timing()?.lapElapsedSeconds).toBe(2);
    timing.update(scoringReading({ currentEt: 33, gamePhase: 9, player: vehicleReading(player) }));
    expect(timing.timing()?.lapElapsedSeconds).toBe(2);
    timing.update(scoringReading({ currentEt: 40, inRealtime: false, player: vehicleReading(player) }));
    timing.update(scoringReading({ currentEt: 50, player: vehicleReading({ ...player, lapDist: 205 }) }));
    expect(timing.timing()?.lapElapsedSeconds).toBe(0);
    timing.update(scoringReading({ currentEt: 51, player: vehicleReading({ ...player, lapDist: 210 }) }));
    expect(timing.timing()?.lapElapsedSeconds).toBe(1);
  });

  it('leaves unusable anchors unknown and waits for a newer anchor at the lap counter', () => {
    const timing = new LiveLapTiming();
    const sample = (currentEt: number, totalLaps: number, lapStartEt: number) => timing.update(scoringReading({
      currentEt, player: vehicleReading({ totalLaps, lapStartEt, lapDist: 5, timeIntoLap: 0.1 }),
    }));
    sample(100, 2, 101);
    expect(timing.timing()?.lapElapsedSeconds).toBeNull();
    sample(101, 2, Number.NaN);
    expect(timing.timing()?.lapElapsedSeconds).toBeNull();
    sample(102, 2, 100);
    expect(timing.timing()?.lapElapsedSeconds).toBe(2);
    sample(200, 3, 100);
    expect(timing.timing()?.lapElapsedSeconds).toBeNull();
    sample(200.2, 3, 199.8);
    expect(timing.timing()?.lapElapsedSeconds).toBe(0.4);
  });

  it('trusts the completed game time despite a transient current-lap flag inherited near the start', () => {
    const timing = new LiveLapTiming();
    timing.update(reading({ totalLaps: 0, lapDist: 0, timeIntoLap: 0, countLapFlag: 1 }));
    driveLap(timing, { seconds: 100, completed: 0 });
    expect(timing.recentLaps[0].valid).toBe(true);
    expect(timing.sessionBest?.lapSeconds).toBe(100);
  });

  it('uses matching completed splits instead of a static game pace when a trace is unavailable', () => {
    const timing = new LiveLapTiming();
    const player = { totalLaps: 5, bestLapTime: 100, bestLapSector1: 30, bestLapSector2: 60, estimatedLapTime: 100 };
    timing.update(reading({ ...player, sector: 1 }));
    expect(timing.timing()).toMatchObject({ deltaSeconds: null, lapEstimate: null });
    timing.update(reading({ ...player, sector: 2, curSector1: 29.5 }));
    expect(timing.timing()?.lapEstimate).toEqual({ seconds: 99.5, referenceSeconds: 100, deltaSeconds: -0.5, source: 'sector' });
    timing.update(reading({ ...player, sector: 0, curSector1: 29.5, curSector2: 61.2 }));
    expect(timing.timing()?.lapEstimate).toEqual({ seconds: 101.2, referenceSeconds: 100, deltaSeconds: 1.2, source: 'sector' });
  });

  it('recovers an invalid completed time from consecutive lap-start clocks without accepting it as a record', () => {
    const timing = new LiveLapTiming();
    timing.update(reading({ totalLaps: 3, lapStartEt: 1000, lapDist: 0, timeIntoLap: 0 }));
    timing.update(reading({ totalLaps: 4, lapStartEt: 1133.0757, lapDist: 5, timeIntoLap: 0.1,
      lastLapTime: -1, lastSector1: 37, lastSector2: 87 }, 1133.2));
    expect(timing.recentLaps[0]).toEqual({ lapNumber: 4, lapSeconds: 133.076,
      sectors: [37, 50, 46.076], valid: false, timeSource: 'lap-start' });
    expect(timing.sessionBest).toBeNull();
    timing.update(reading({ totalLaps: 6, lapStartEt: 1400, lastLapTime: -1 }, 1400.2));
    expect(timing.recentLaps[1]).toMatchObject({ lapSeconds: null, valid: false });
  });

  it('keeps a complete best-lap trace when position rolls over just before the lap counter', () => {
    const timing = new LiveLapTiming();
    for (let time = 0; time < 100; time++) timing.update(reading({ totalLaps: 0, lapDist: time * 100, timeIntoLap: time }));
    timing.update(reading({ totalLaps: 0, lapDist: 2, timeIntoLap: 0.02 }));
    expect(timing.timing()?.lapElapsedSeconds).toBe(99);
    timing.update(reading({ totalLaps: 1, lapDist: 5, timeIntoLap: 0.1, lastLapTime: 100, lastSector1: 30, lastSector2: 60 }));
    timing.update(reading({ totalLaps: 1, lapDist: 5000, timeIntoLap: 51 }));
    expect(timing.timing()?.deltaSeconds).toBe(1);
  });

  it('uses a lap-start anchor that settles after the counter changes when recovering the following lap', () => {
    const timing = new LiveLapTiming();
    timing.update(reading({ totalLaps: 3, lapStartEt: 1000, lapDist: 0, timeIntoLap: 0 }));
    timing.update(reading({ totalLaps: 4, lapStartEt: 1000, lapDist: 1, timeIntoLap: 0.01, lastLapTime: 135 }));
    timing.update(reading({ totalLaps: 4, lapStartEt: 1135, lapDist: 5, timeIntoLap: 0.1 }, 1135.1));
    timing.update(reading({ totalLaps: 5, lapStartEt: 1268.0757, lapDist: 5, timeIntoLap: 0.1, lastLapTime: -1 }, 1268.2));
    expect(timing.recentLaps[1]).toMatchObject({ lapSeconds: 133.076, valid: false, timeSource: 'lap-start' });
  });

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
    // An untimed lap is recovered from real lap-start anchors, but remains invalid.
    driveLap(timing, { seconds: 101, completed: 4, loseFlagAt: 10 });
    expect(timing.recentLaps[2]).toMatchObject({ lapNumber: 5, lapSeconds: 101, timeSource: 'lap-start', sectors: [30, 30.6, 40.4], valid: false });
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
    // Between two trace samples: 1234.5 m is 12.345 s on the reference.
    timing.update(reading({ totalLaps: 1, lapDist: 1_234.5, timeIntoLap: 11.845, sector: 1 }));
    expect(timing.timing()?.deltaSeconds).toBeCloseTo(-0.5, 3);
    expect(timing.timing()?.lapEstimate).toEqual({ seconds: 99.5, referenceSeconds: 100, deltaSeconds: -0.5, source: 'distance' });
    // Same distance, 2 s later than the reference (which covers 100 m a second).
    timing.update(reading({ totalLaps: 1, lapDist: 2_500, timeIntoLap: 27, sector: 1, curSector1: -1 }));
    expect(timing.timing()).toMatchObject({ lapNumber: 2, sector: 1, deltaSeconds: 2,
      lapEstimate: { seconds: 102, referenceSeconds: 100, deltaSeconds: 2, source: 'distance' } });
  });

  it('marks an out lap from pit departure until the next timing line crossing', () => {
    const timing = new LiveLapTiming();
    timing.update(reading({ totalLaps: 5, inPits: true, lapDist: 200, timeIntoLap: 10 }));
    expect(timing.timing()?.isOutLap).toBe(true);
    timing.update(reading({ totalLaps: 5, inPits: false, lapDist: 1000, timeIntoLap: 30 }));
    expect(timing.timing()).toMatchObject({ isOutLap: true, deltaSeconds: null });
    timing.update(reading({ totalLaps: 6, inPits: false, lapDist: 3, timeIntoLap: 0.1 }));
    expect(timing.timing()?.isOutLap).toBe(false);
    expect(timing.recentLaps[0].valid).toBe(false);
    timing.reset();
    expect(timing.timing()).toBeNull();
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

  it('estimates the lap from a whole lap that lost its time until a valid lap exists (Portimão qualifying 2026-10-29)', () => {
    // Out lap, then a flying lap the game left untimed (track limits): the next lap still gets an estimate.
    const timing = new LiveLapTiming();
    driveLap(timing, { seconds: 120, completed: 0, inPits: true });
    driveLap(timing, { seconds: 108.8, completed: 1, loseFlagAt: 30 });
    expect(timing.sessionBest).toBeNull();
    timing.update(reading({ totalLaps: 2, lapDist: 5_000, timeIntoLap: 55.4 }));
    expect(timing.timing()?.deltaSeconds).toBeNull();
    expect(timing.timing()?.lapEstimate).toMatchObject({ seconds: 109.8, referenceSeconds: 108.8, deltaSeconds: 1, source: 'distance' });
    // A valid lap takes over, even a slower one.
    clock = 1000;
    anchors.clear();
    const later = new LiveLapTiming();
    driveLap(later, { seconds: 120, completed: 0, inPits: true });
    driveLap(later, { seconds: 108.8, completed: 1, loseFlagAt: 30 });
    driveLap(later, { seconds: 110, completed: 2 });
    later.update(reading({ totalLaps: 3, lapDist: 5_000, timeIntoLap: 55 }));
    expect(later.timing()?.lapEstimate).toMatchObject({ seconds: 110, referenceSeconds: 110, deltaSeconds: 0 });
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

  it('retains a game-timed flying lap seen from the middle without inventing a reference trace', () => {
    const timing = new LiveLapTiming();
    timing.update(reading({ totalLaps: 0, lapDist: 4_000, timeIntoLap: 40, sector: 1 }));
    expect(timing.timing()?.deltaSeconds).toBeNull();
    driveLap(timing, { seconds: 100, completed: 0, joinAt: 40 });
    expect(timing.recentLaps).toEqual([{ lapNumber: 1, lapSeconds: 100, sectors: [30, 30, 40], valid: true }]);
    expect(timing.sessionBest?.lapSeconds).toBe(100);
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
      anchors.clear();
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

  it('drops an unusable trace without invalidating the completed time accepted by the game', () => {
    const timing = new LiveLapTiming();
    for (const [dist, time] of [[10, 1], [2_000, 20], [1_500, 25], [3_000, 40]]) {
      timing.update(reading({ totalLaps: 0, lapDist: dist, timeIntoLap: time }));
    }
    timing.update(reading({ totalLaps: 1, lapDist: 3, timeIntoLap: 0.1, lastLapTime: 100, lastSector1: 30, lastSector2: 60 }));
    expect(timing.recentLaps[0].valid).toBe(true);
    expect(timing.sessionBest?.lapSeconds).toBe(100);
    expect(timing.timing()?.deltaSeconds).toBeNull();
  });
});
