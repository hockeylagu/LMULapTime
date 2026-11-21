import { describe, expect, it } from 'vitest';
import {
  computeCornerConsistencyStats,
  lapDistanceAtStation,
  passMetrics,
  placeStatsOnLap,
} from '../../../src/utils/cornerConsistency.js';
import type { CornerPass, CornerTurn } from '../../../shared/types/corners/cornerPasses.js';

function pass(lapNumber: number, segment: number, sec: number, extra: Partial<CornerPass> = {}): CornerPass {
  const entrySec = lapNumber * 100 + segment * 10;
  return {
    slot: 0, lapNumber, segment, entrySec, minSpeedSec: entrySec + 1, exitSec: entrySec + sec,
    entrySpeedKmh: 250, minSpeedKmh: 100, exitSpeedKmh: 180, minSpeedM: 500, brakeM: 380, turnInM: 440, throttleM: 530,
    aheadSlot: null, aheadGapSec: null, minSpeedGear: null, peakBrake: null, brakeSec: 0, partThrottleSec: null, absSec: 0,
  coastSec: 0, ...extra,
  };
}

const TURNS: CornerTurn[] = [
  { id: 1, label: 'T1', title: 'Turn 1', apexM: 500, startM: 300, endM: 700 },
  { id: 2, label: '', title: 'Unnamed', apexM: 2300, startM: 2100, endM: 2500 },
];

describe('passMetrics', () => {
  it('measures brake and turn-in before the slowest point and throttle after it', () => {
    expect(passMetrics(pass(1, 1, 4))).toEqual({
      brakingDistM: 120, turnInDistM: 60, throttleOnDistM: 30, entrySpeedKmh: 250, apexSpeedKmh: 100, exitSpeedKmh: 180,
    });
    expect(passMetrics(pass(1, 1, 4, { throttleM: 480, turnInM: null }))).toMatchObject({ throttleOnDistM: -20, turnInDistM: null });
    expect(passMetrics(pass(1, 1, 4, { minSpeedM: null }))).toMatchObject({ brakingDistM: null, turnInDistM: null, throttleOnDistM: null });
  });
});

describe('computeCornerConsistencyStats', () => {
  it('times each official turn over the laps that count, in driving order, and needs two passes', () => {
    const passes = [
      pass(2, 2, 6.1), pass(2, 1, 4.2), pass(3, 1, 4.6, { brakeM: 360 }), pass(4, 1, 4.4), pass(9, 1, 9), pass(3, 2, 6.0),
      pass(4, 3, 3), // a turn not in the list
    ];
    const stats = computeCornerConsistencyStats(passes, TURNS, new Set([2, 3, 4]));

    expect(stats.map(s => [s.turnId, s.label, s.lapsSampled])).toEqual([[1, 'T1', 3], [2, 'km 2.3', 2]]);
    expect(stats[0].time.samples.map(s => s.lapNumber)).toEqual([2, 3, 4]);
    expect(stats[0].time.min).toBeCloseTo(4.2, 5);
    expect(stats[0].time.max).toBeCloseTo(4.6, 5);
    // The metrics are read on the fastest (2) and slowest (3) pass: lap 3 braked 20 m earlier.
    expect(stats[0].brakingDistM).toMatchObject({ min: 120, max: 140 });
    expect(stats[0].turnInDistM).toMatchObject({ min: 60, max: 60 });
    expect(computeCornerConsistencyStats([pass(2, 1, 4)], TURNS, new Set([2]))).toEqual([]);
  });

});

describe('placeStatsOnLap', () => {
  // A lap starting 100 m before the centre line's zero: stations 4900 ... 4990, 0 ... 2400 every 10 m.
  const points = [...Array.from({ length: 10 }, (_, i) => ({ stationM: 4900 + i * 10 })), ...Array.from({ length: 241 }, (_, i) => ({ stationM: i * 10 }))];
  const dists = points.map((_, i) => i * 10);

  it('finds the lap distance of a station between two samples, never across the seam', () => {
    expect(lapDistanceAtStation(points, dists, 505)).toBeCloseTo(605, 5);
    expect(lapDistanceAtStation(points, dists, 4995)).toBeNull();
    expect(lapDistanceAtStation([{}, {}], [0, 10], 5)).toBeNull();
  });

  it('places each turn apex on the lap and names the detected corner that holds it', () => {
    const stats = computeCornerConsistencyStats([pass(2, 1, 4.2), pass(3, 1, 4.6), pass(2, 2, 6.1), pass(3, 2, 6)], TURNS, new Set([2, 3]));
    // The start line is at station 4900: T1's apex (500 m from the line) is station 400, the lap's 500 m.
    const placed = placeStatsOnLap(stats, { points, dists }, 4900, 5000, [{ cornerNumber: 3, entryDistM: 450, exitDistM: 560 }]);
    expect(placed[0]).toMatchObject({ lapDistM: 500, cornerNumber: 3 });
    expect(placed[1]).toMatchObject({ lapDistM: 2300, cornerNumber: null });
  });
});
