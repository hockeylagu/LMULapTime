import { describe, expect, it } from 'vitest';
import { raceDistancesFromPasses } from '../../../server/traffic/raceDistances.js';
import type { CornerPass, SessionCornerPasses } from '../../../shared/types/corners/cornerPasses.js';

// A 1000 m track in two turns (0-500 m, 500-1000 m); the start line 100 m along the centre line.
const pass = (slot: number, lapNumber: number, segment: number, entrySec: number, exitSec: number, extra: Partial<CornerPass> = {}): CornerPass => ({
  slot, lapNumber, segment, entrySec, minSpeedSec: null, exitSec, entrySpeedKmh: null, minSpeedKmh: null, exitSpeedKmh: null,
  minSpeedM: null, brakeM: null, turnInM: null, throttleM: null, aheadSlot: null, aheadGapSec: null, behindSlot: null, behindGapSec: null, ...extra,
});
const data = (passes: CornerPass[]): SessionCornerPasses & { available: true } => ({
  available: true, layoutKey: 'test', startStationM: 100, trackLengthM: 1000,
  turns: [{ id: 0, label: 'T1', title: 'Turn 1', apexM: 250, startM: 0, endM: 500 }, { id: 1, label: 'T2', title: 'Turn 2', apexM: 750, startM: 500, endM: 1000 }],
  cars: [], passes, laps: [], contacts: [],
});

describe('raceDistancesFromPasses', () => {
  it('reads each car\'s distance once a second between its turns\' entries, slowest points and exits, unwrapped across laps', () => {
    // Lap 1 in 20 s, T1's slowest point at 300 m after 8 s; lap 2 in 20 s.
    const progress = raceDistancesFromPasses(data([
      pass(1, 1, 0, 0, 10, { minSpeedSec: 8, minSpeedM: 300 }), pass(1, 1, 1, 10, 20),
      pass(1, 2, 0, 20, 30), pass(1, 2, 1, 30, 40),
    ]));
    expect(progress).toMatchObject({ fromSec: 0, hz: 1, trackLengthM: 1000 });
    const [car] = progress.cars;
    // Station = lap distance + 100 m; 300 m in 8 s, then 200 m in 2 s.
    expect(car.distances.slice(0, 11)).toEqual([100, 137.5, 175, 212.5, 250, 287.5, 325, 362.5, 400, 500, 600]);
    expect(car.distances[20]).toBe(1100);
    expect(car.distances[40]).toBe(2100);
  });

  it('leaves the pit lane and garage empty: a gap between two passes ends a run', () => {
    // In the pits from 20 s to 50 s (no passes), back on track for lap 3.
    const progress = raceDistancesFromPasses(data([pass(2, 1, 0, 0, 10), pass(2, 1, 1, 10, 20), pass(2, 3, 0, 50, 60)]));
    const distances = progress.cars[0].distances;
    expect(distances[20]).toBe(1100);
    expect(distances.slice(21, 50).every(distance => distance === null)).toBe(true);
    expect(distances[50]).toBe(2100);
    expect(distances[60]).toBe(2600);
  });

  it('drops a grid wait in the last turn counted as lap 1, so lap 1 keeps its distance', () => {
    // Waits on the grid in T2 (before the line) from 0 s to 40 s, joined to the start; lap 1 from 40 s.
    const progress = raceDistancesFromPasses(data([pass(4, 1, 1, 0, 40), pass(4, 1, 0, 40, 50), pass(4, 1, 1, 50, 60)]));
    expect(progress.fromSec).toBe(40);
    const distances = progress.cars[0].distances;
    expect([distances[0], distances[10], distances[20]]).toEqual([100, 600, 1100]);
  });

  it('keeps the distance going forward, skipping a pass timed back across the line', () => {
    const progress = raceDistancesFromPasses(data([pass(3, 2, 0, 0, 10), pass(3, 1, 1, 10, 20), pass(3, 2, 1, 20, 30)]));
    const distances = progress.cars[0].distances.filter((distance): distance is number => distance !== null);
    expect(distances.every((distance, i) => i === 0 || distance >= distances[i - 1])).toBe(true);
  });
});
