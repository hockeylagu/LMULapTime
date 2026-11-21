import { describe, it, expect } from 'vitest';
import type { RaceReplayOverview, RaceReplayProgress } from '../../../../shared/types/index.js';
import { indexRaceStandings, isOutAt, raceStandingsAt, runningOrderAt } from '../../../../src/components/replay/race/raceStandings.js';
import { formatRaceGap } from '../../../../src/components/replay/race/RaceStandingsTower.js';

/** Car 1 laps in 100 s, car 2 in 105 s, car 3 (another class) in 130 s; car 1 laps car 3 on lap 4. */
function overview(sessionType = 'Race'): RaceReplayOverview {
  const laps = (slot: number, lapTime: number, count: number) => Array.from({ length: count }, (_, i) => ({
    slot, lapNumber: i + 1, startSec: i * lapTime, endSec: (i + 1) * lapTime, lapTimeSec: lapTime + (i === 0 ? 1 : 0), isValid: i !== 2,
  }));
  return {
    replayName: 'R1.Vcr', sessionType, daylight: { raceStartMinute: null, cloudCover: null, cloudField: null, cloudVariants: null }, startSec: 0, endSec: 600, windowSec: 60,
    cars: [
      { slot: 1, name: 'Ann', carClass: 'Hyper', carNumber: '7' },
      { slot: 2, name: 'Bea', carClass: 'Hyper' },
      { slot: 3, name: 'Cal', carClass: 'GT3' },
      { slot: 4, name: 'Dee', carClass: 'GT3' },
    ],
    laps: [...laps(1, 100, 5), ...laps(2, 105, 5), ...laps(3, 130, 4)],
    runningOrder: [{ timeSec: 0, order: [1, 2, 3] }, { timeSec: 300, order: [2, 1, 3] }],
    events: [],
  };
}

describe('runningOrderAt', () => {
  it('holds each snapshot until the next, and opens on the first', () => {
    const { runningOrder } = overview();
    expect(runningOrderAt(runningOrder, -5)).toEqual([1, 2, 3]);
    expect(runningOrderAt(runningOrder, 299)).toEqual([1, 2, 3]);
    expect(runningOrderAt(runningOrder, 300)).toEqual([2, 1, 3]);
    expect(runningOrderAt([], 10)).toEqual([]);
  });
});

describe('raceStandingsAt', () => {
  it('lists the running order, then the cars it leaves out, with class places', () => {
    const rows = raceStandingsAt(indexRaceStandings(overview()), 250);

    expect(rows.map(row => row.car.slot)).toEqual([1, 2, 3, 4]);
    expect(rows.map(row => row.position)).toEqual([1, 2, 3, 4]);
    expect(rows.map(row => row.classPosition)).toEqual([1, 2, 1, 2]);
    expect(rows[0]).toMatchObject({ lapsDone: 2, lastLapSec: 100, bestLapSec: 100 });
  });

  it('runs a car that did not finish until its last lap ends, then lists it last as out', () => {
    const retired = { ...overview(), cars: overview().cars.map(car => car.slot === 1 ? { ...car, retired: 'DNF' } : car),
      laps: overview().laps.filter(lap => lap.slot !== 1 || lap.lapNumber <= 2) };
    expect(raceStandingsAt(indexRaceStandings(retired), 150)[0]).toMatchObject({ car: { slot: 1 }, gap: { kind: 'leader' } });

    const rows = raceStandingsAt(indexRaceStandings(retired), 250);
    expect(rows.map(row => row.car.slot)).toEqual([2, 3, 4, 1]);
    expect(rows[0].gap).toEqual({ kind: 'leader' });
    expect(rows[3]).toMatchObject({ position: 4, lapsDone: 2, gap: { kind: 'out', status: 'DNF' } });
    expect(formatRaceGap(rows[3].gap, true)).toBe('DNF');
    // The results count no lap: out from the start, although the replay holds one lap up to the session end.
    const neverStarted = { ...overview(), cars: overview().cars.map(car => car.slot === 4 ? { ...car, retired: 'DNF', sessionLapOrdinals: {} } : car),
      laps: [...overview().laps, { slot: 4, lapNumber: 1, startSec: 0, endSec: 600, lapTimeSec: 600, isValid: false }] };
    expect(raceStandingsAt(indexRaceStandings(neverStarted), 10).at(-1)).toMatchObject({ car: { slot: 4 }, gap: { kind: 'out' } });
  });

  it('gives race gaps to the class leader on the road, in time or in laps', () => {
    const rows = raceStandingsAt(indexRaceStandings(overview()), 299);
    expect(rows[0].gap).toEqual({ kind: 'leader' });
    expect(rows[1].gap).toEqual({ kind: 'time', sec: 10 });
    expect(rows[3].gap).toBeNull();

    const later = raceStandingsAt(indexRaceStandings({ ...overview(), runningOrder: [{ timeSec: 0, order: [1, 3] }] }), 525);
    const leader = later.find(row => row.car.slot === 1)!;
    expect(leader.gap).toEqual({ kind: 'leader' });
    // GT3 leads its class whatever the overall order.
    expect(later.find(row => row.car.slot === 3)!.gap).toEqual({ kind: 'leader' });
  });

  it('gives the interval to the car ahead in the class beside the gap to the leader', () => {
    const threeHypers = { ...overview(), cars: overview().cars.map(car => car.slot === 3 ? { ...car, carClass: 'Hyper' } : car) };
    const rows = raceStandingsAt(indexRaceStandings(threeHypers), 299);
    expect(rows.slice(0, 3).map(row => [row.car.slot, row.gap, row.interval])).toEqual([
      [1, { kind: 'leader' }, { kind: 'leader' }],
      [2, { kind: 'time', sec: 10 }, { kind: 'time', sec: 10 }],
      [3, { kind: 'time', sec: 60 }, { kind: 'time', sec: 50 }],
    ]);
  });

  it('gives live gaps between line crossings from where the cars are on the track', () => {
    // A 1000 m lap at the overview's lap times, once a second; car 2's distance has its own zero (two laps on).
    const grid = (slot: number, lapTime: number, zero = 0) => ({
      slot, distances: Array.from({ length: 601 }, (_, k) => (k >= 275 && k < 285 && slot === 2 ? null : zero + 1000 * k / lapTime)),
    });
    const progress: RaceReplayProgress = { fromSec: 0, hz: 1, trackLengthM: 1000, cars: [grid(1, 100), grid(2, 105, 2000), grid(3, 130)] };
    const at = (timeSec: number) => raceStandingsAt(indexRaceStandings(overview(), progress), timeSec);
    // At 250 s car 2 is 380.95 m into lap 3, where car 1 was at 238.1 s; the line gives 10 s (crossings at 200 and 210).
    expect(at(250)[1].gap).toMatchObject({ kind: 'time' });
    expect((at(250)[1].gap as { sec: number }).sec).toBeCloseTo(11.905, 2);
    expect(raceStandingsAt(indexRaceStandings(overview()), 250)[1].gap).toEqual({ kind: 'time', sec: 10 });
    // Car 2 off the track (pits): the gap of its last crossing.
    expect(at(280)[1].gap).toEqual({ kind: 'time', sec: 10 });
  });

  it('shows a car laps down once the leader has crossed the line more often', () => {
    const lapped = { ...overview(), cars: overview().cars.map(car => ({ ...car, carClass: 'Hyper' })),
      runningOrder: [{ timeSec: 0, order: [1, 2, 3, 4] }] };
    const rows = raceStandingsAt(indexRaceStandings(lapped), 525);
    expect(rows.find(row => row.car.slot === 3)!.gap).toEqual({ kind: 'laps', laps: 1 });
  });

  it('computes live gaps even when the class leader starts slightly before its first progress sample', () => {
    const progress = {
      trackLengthM: 1000,
      fromSec: 0,
      hz: 1,
      cars: [
        // Leader lap 1 starts at 1.2s, while its first non-null 1 Hz sample is at t = 2s.
        { slot: 1, distances: [null, null, 100, 150, 200, 250, 300] },
        { slot: 2, distances: [null, null, 50, 100, 150, 200, 250] },
      ],
    };
    const race = {
      ...overview(),
      cars: overview().cars.slice(0, 2).map(car => ({ ...car, carClass: 'GT3' })),
      laps: [
        { slot: 1, lapNumber: 1, startSec: 1.2, endSec: 20, lapTimeSec: 18.8, isValid: true },
        { slot: 2, lapNumber: 1, startSec: 1.2, endSec: 21, lapTimeSec: 19.8, isValid: true },
      ],
      runningOrder: [{ timeSec: 0, order: [1, 2] }],
    };
    const rows = raceStandingsAt(indexRaceStandings(race, progress), 5);
    expect(rows.find(row => row.car.slot === 1)!.gap).toEqual({ kind: 'leader' });
    expect(rows.find(row => row.car.slot === 2)!.gap).toEqual({ kind: 'time', sec: 1 });
  });

  it('keeps a 0-lap DNF car racing until it actually stops moving on track', () => {
    const progress = {
      trackLengthM: 1000,
      fromSec: 0,
      hz: 1,
      cars: [
        { slot: 1, distances: [0, 50, 100, 150, 200, 250] },
        { slot: 2, distances: [0, 40, 80, 120, 120, 120] },
      ],
    };
    const race = {
      ...overview(),
      cars: [
        { ...overview().cars[0], carClass: 'Hyper' },
        { ...overview().cars[1], carClass: 'Hyper', retired: 'DNF', sessionLapOrdinals: {} },
      ],
      laps: [
        { slot: 1, lapNumber: 1, startSec: 0, endSec: 20, lapTimeSec: 20, isValid: true },
        { slot: 2, lapNumber: 1, startSec: 0, endSec: 100, lapTimeSec: null, isValid: false },
      ],
      runningOrder: [{ timeSec: 0, order: [1, 2] }],
    };
    const index = indexRaceStandings(race, progress);
    expect(isOutAt(index, 2, 2)).toBe(false);
    const liveRow = raceStandingsAt(index, 2).find(row => row.car.slot === 2)!;
    expect(liveRow.gap?.kind).toBe('time');
    expect((liveRow.gap as { kind: 'time'; sec: number }).sec).toBeCloseTo(0.4, 5);
    expect(isOutAt(index, 2, 3)).toBe(true);
    expect(raceStandingsAt(index, 3).find(row => row.car.slot === 2)!.gap).toEqual({ kind: 'out', status: 'DNF' });
  });

  it('compares best laps in practice and qualifying, valid laps only', () => {
    // The game orders qualifying by best lap.
    const rows = raceStandingsAt(indexRaceStandings({ ...overview('Qualifying'), runningOrder: [{ timeSec: 0, order: [1, 2, 3, 4] }] }), 600);
    expect(rows.find(row => row.car.slot === 1)).toMatchObject({ bestLapSec: 100, gap: { kind: 'leader' } });
    expect(rows.find(row => row.car.slot === 2)!.gap).toEqual({ kind: 'time', sec: 5 });
    expect(rows.find(row => row.car.slot === 4)!.gap).toBeNull();
  });
});

describe('formatRaceGap', () => {
  it('reads like a timing screen', () => {
    expect(formatRaceGap(null, true)).toBe('');
    expect(formatRaceGap({ kind: 'leader' }, true)).toBe('Leader');
    expect(formatRaceGap({ kind: 'leader' }, false)).toBe('');
    expect(formatRaceGap({ kind: 'laps', laps: 1 }, true)).toBe('+1 lap');
    expect(formatRaceGap({ kind: 'laps', laps: 2 }, true)).toBe('+2 laps');
    expect(formatRaceGap({ kind: 'time', sec: 1.2345 }, true)).toBe('+1.234');
    expect(formatRaceGap({ kind: 'time', sec: 75.3 }, true)).toBe('+1:15.3');
    expect(formatRaceGap({ kind: 'time', sec: 150.4 }, true)).toBe('+2:30.4');
    expect(formatRaceGap({ kind: 'time', sec: 61.04 }, true)).toBe('+1:01.0');
  });
});
