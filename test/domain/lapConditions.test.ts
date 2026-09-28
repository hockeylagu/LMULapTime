import { describe, it, expect } from 'vitest';
import { annotateLapConditions, lapConditionGroup, RAIN_WET_MIN } from '../../shared/domain/lapConditions.js';
import { markNonRepresentativeLaps } from '../../shared/domain/lapRepresentativeness.js';
import { computeConsistencyRating } from '../../shared/domain/lapComparison.js';
import type { LapConditions, NonRepresentativeReason } from '../../shared/types/index.js';

interface TestLap {
  lapNum: number;
  lapTime: number | null;
  elapsedSeconds?: number;
  fCompound?: string;
  rCompound?: string;
  isValid: boolean;
  isPitStop: boolean;
  conditions?: LapConditions;
  nonRepresentativeReason?: NonRepresentativeReason;
}

/** A start lap, then dry laps on Mediums and wet laps on Wets, each starting where the last ended. */
function race(dry: number[], wet: number[]): TestLap[] {
  let et = 0;
  return [120, ...dry, ...wet].map((lapTime, i) => {
    const lap: TestLap = {
      lapNum: i + 1, lapTime, elapsedSeconds: et, isValid: true, isPitStop: false,
      fCompound: i > dry.length ? 'Wet' : 'Medium', rCompound: i > dry.length ? 'Wet' : 'Medium',
    };
    et += lapTime;
    return lap;
  });
}

describe('annotateLapConditions', () => {
  it('tags wet tyres and rain from the threshold, and leaves dry laps untagged', () => {
    const laps: TestLap[] = [
      { lapNum: 1, lapTime: 100, elapsedSeconds: 0, fCompound: 'Medium', rCompound: 'Medium', isValid: true, isPitStop: false },
      { lapNum: 2, lapTime: 100, elapsedSeconds: 100, fCompound: 'Medium', rCompound: 'Medium', isValid: true, isPitStop: false },
      { lapNum: 3, lapTime: 100, elapsedSeconds: 200, fCompound: 'Wet', rCompound: 'Wet', isValid: true, isPitStop: false },
    ];
    // Light rain on lap 1, real rain from 250 s.
    const rainOverLap = (start: number, end: number) => (end > 250 ? 18 : start < 100 ? RAIN_WET_MIN - 1 : 0);

    annotateLapConditions(laps, rainOverLap);

    expect(laps.map((l) => l.conditions)).toEqual([undefined, undefined, { wetTyres: true, rain: 18 }]);
    expect(laps.map(lapConditionGroup)).toEqual(['dry', 'dry', 'wet']);
  });

  it('knows only the tyres without a replay, and clears a tag the lap no longer has', () => {
    const lap: TestLap = { lapNum: 2, lapTime: 100, fCompound: 'Medium', rCompound: 'Medium', isValid: true, isPitStop: false, conditions: { rain: 20 } };
    annotateLapConditions([lap]);
    expect(lap.conditions).toBeUndefined();
  });
});

describe('the lap rules with changing conditions', () => {
  const dry = [100.1, 100.3, 99.9, 100.2, 100.0];
  const wet = [110.4, 110.1, 110.6, 110.2];

  it('judges a wet lap against the wet laps, not the dry median', () => {
    const laps = race(dry, [...wet, 113.5]);
    annotateLapConditions(laps);
    markNonRepresentativeLaps(laps);

    // Every wet lap is >2% off the dry pace; only the one >2% off the wet pace is off pace.
    expect(laps.filter((l) => l.nonRepresentativeReason).map((l) => l.lapNum)).toEqual([11]);
  });

  it('never calls a wet lap off pace without enough wet laps to compare it with', () => {
    const laps = race(dry, [110.4, 118]);
    annotateLapConditions(laps);
    markNonRepresentativeLaps(laps);
    expect(laps.some((l) => l.nonRepresentativeReason)).toBe(false);
  });

  it('measures consistency within each condition and keeps the average of every clean lap', () => {
    const laps = race(dry, wet);
    annotateLapConditions(laps);
    markNonRepresentativeLaps(laps);

    const rating = computeConsistencyRating(laps);
    const allClean = [...dry, ...wet];

    expect(rating.avgLapTime).toBeCloseTo(allClean.reduce((a, b) => a + b, 0) / allClean.length, 3);
    expect(rating.stdDev).toBeLessThan(0.2);
    // Mixed around one mean, the 10 s gap between dry and wet would read as a ~95% rating.
    expect(rating.consistencyScore).toBe(99.8);
    expect(rating.conditionGroups).toEqual([{ group: 'dry', laps: 5 }, { group: 'wet', laps: 4 }]);
  });

  it('measures the largest group alone when no group has enough laps', () => {
    const laps = race([100.1, 100.5], [110.2]);
    annotateLapConditions(laps);

    const rating = computeConsistencyRating(laps);

    expect(rating.stdDev).toBe(0.2);
    expect(rating.conditionGroups).toEqual([{ group: 'dry', laps: 2 }, { group: 'wet', laps: 1 }]);
  });

  it('rates a dry session as before, with no breakdown', () => {
    const laps = race(dry, []);
    annotateLapConditions(laps);

    const rating = computeConsistencyRating(laps);

    expect(rating.conditionGroups).toBeUndefined();
    expect(rating.stdDev).toBe(0.141);
  });
});
