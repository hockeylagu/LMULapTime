import { describe, it, expect } from 'vitest';
import { computeTheoreticalBest, computeTheoreticalGap, fasterLapTime, getBestLapNumber } from '../../../shared/domain/timing/lapTimes.js';

describe('computeTheoreticalBest', () => {
  it('returns null if any sector is null or undefined or <= 0', () => {
    expect(computeTheoreticalBest(null, 30.0, 40.0)).toBeNull();
    expect(computeTheoreticalBest(25.0, null, 40.0)).toBeNull();
    expect(computeTheoreticalBest(25.0, 30.0, null)).toBeNull();
    expect(computeTheoreticalBest(0, 30.0, 40.0)).toBeNull();
  });

  it('sums valid sector times correctly', () => {
    expect(computeTheoreticalBest(25.100, 32.200, 41.300)).toBeCloseTo(98.6);
  });
});

describe('computeTheoreticalGap', () => {
  it('returns null if either bestLapTime or theoreticalBest is missing or <= 0', () => {
    expect(computeTheoreticalGap(null, 120)).toBeNull();
    expect(computeTheoreticalGap(120, null)).toBeNull();
    expect(computeTheoreticalGap(undefined, 120)).toBeNull();
    expect(computeTheoreticalGap(0, 120)).toBeNull();
    expect(computeTheoreticalGap(120, 0)).toBeNull();
    expect(computeTheoreticalGap(-5, 120)).toBeNull();
  });

  it('calculates the positive gap between actual best and theoretical best', () => {
    expect(computeTheoreticalGap(122.500, 121.200)).toBe(1.3);
    expect(computeTheoreticalGap(95.123, 95.000)).toBe(0.123);
  });

  it('clamps negative differences to 0 to prevent floating-point noise artifacts', () => {
    expect(computeTheoreticalGap(120.000, 120.000)).toBe(0);
    expect(computeTheoreticalGap(120.000, 120.0000001)).toBe(0);
  });
});

describe('fasterLapTime', () => {
  it('returns smaller valid number', () => {
    expect(fasterLapTime(null, 30.5)).toBe(30.5);
    expect(fasterLapTime(35.0, 30.5)).toBe(30.5);
    expect(fasterLapTime(25.0, 30.5)).toBe(25.0);
  });

  it('ignores null, undefined, or non-positive values', () => {
    expect(fasterLapTime(30.0, null)).toBe(30.0);
    expect(fasterLapTime(30.0, undefined)).toBe(30.0);
    expect(fasterLapTime(30.0, 0)).toBe(30.0);
    expect(fasterLapTime(30.0, -5)).toBe(30.0);
    expect(fasterLapTime(null, null)).toBeNull();
  });
});

describe('getBestLapNumber', () => {
  it('returns 1 for null or undefined driver', () => {
    expect(getBestLapNumber(null)).toBe(1);
    expect(getBestLapNumber(undefined)).toBe(1);
  });

  it('returns bestLapNumber if explicitly provided', () => {
    expect(getBestLapNumber({ bestLapNumber: 4 })).toBe(4);
  });

  it('finds lapNumber matching bestLapTime among valid laps', () => {
    expect(
      getBestLapNumber({
        bestLapTime: 120.5,
        laps: [
          { lapNumber: 1, lapTime: 125.0, isValid: true },
          { lapNumber: 2, lapTime: 120.5, isValid: true },
          { lapNumber: 3, lapTime: 121.0, isValid: true },
        ],
      })
    ).toBe(2);
  });

  it('finds lapNumber matching bestLapTime among any laps if not valid', () => {
    expect(
      getBestLapNumber({
        bestLapTime: 119.0,
        laps: [
          { lapNumber: 1, lapTime: 125.0, isValid: false },
          { lapNumber: 2, lapTime: 119.0, isValid: false },
        ],
      })
    ).toBe(2);
  });

  it('falls back to fastest valid lap if bestLapTime is not matched', () => {
    expect(
      getBestLapNumber({
        bestLapTime: null,
        laps: [
          { lapNumber: 1, lapTime: 130.0, isValid: true },
          { lapNumber: 2, lapTime: 124.0, isValid: true },
          { lapNumber: 3, lapTime: 128.0, isValid: true },
        ],
      })
    ).toBe(2);
  });

  it('falls back to fastest completed lap if no valid laps exist', () => {
    expect(
      getBestLapNumber({
        bestLapTime: null,
        laps: [
          { lapNumber: 1, lapTime: 140.0, isValid: false },
          { lapNumber: 2, lapTime: 135.0, isValid: false },
        ],
      })
    ).toBe(2);
  });

  it('falls back to first lap if no completed laps have times', () => {
    expect(
      getBestLapNumber({
        bestLapTime: null,
        laps: [
          { lapNumber: 5, lapTime: null, isValid: false },
        ],
      })
    ).toBe(5);
  });
});
