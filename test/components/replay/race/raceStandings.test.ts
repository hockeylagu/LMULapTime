import { describe, it, expect } from 'vitest';
import type { RaceReplayOverview } from '../../../../shared/types/index.js';
import { indexRaceStandings, raceStandingsAt, runningOrderAt } from '../../../../src/components/replay/race/raceStandings.js';
import { formatRaceGap } from '../../../../src/components/replay/race/RaceStandingsTower.js';

/** Car 1 laps in 100 s, car 2 in 105 s, car 3 (another class) in 130 s; car 1 laps car 3 on lap 4. */
function overview(sessionType = 'Race'): RaceReplayOverview {
  const laps = (slot: number, lapTime: number, count: number) => Array.from({ length: count }, (_, i) => ({
    slot, lapNumber: i + 1, startSec: i * lapTime, endSec: (i + 1) * lapTime, lapTimeSec: lapTime + (i === 0 ? 1 : 0), isValid: i !== 2,
  }));
  return {
    replayName: 'R1.Vcr', sessionType, startSec: 0, endSec: 600, poseHz: 10, windowSec: 60,
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

  it('shows a car laps down once the leader has crossed the line more often', () => {
    const lapped = { ...overview(), cars: overview().cars.map(car => ({ ...car, carClass: 'Hyper' })),
      runningOrder: [{ timeSec: 0, order: [1, 2, 3, 4] }] };
    const rows = raceStandingsAt(indexRaceStandings(lapped), 525);
    expect(rows.find(row => row.car.slot === 3)!.gap).toEqual({ kind: 'laps', laps: 1 });
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
