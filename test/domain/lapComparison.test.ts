import { describe, it, expect } from 'vitest';
import {
  computeLapDeltas,
  createTheoreticalBestLap,
  computeTopNLapAverage,
  computeConsistencyRating,
  selectCleanLapCandidates,
} from '../../shared/domain/lapComparison.js';
import { ComparableLap } from '../../shared/types/index.js';

describe('lapComparison utility', () => {
  const baseLap: ComparableLap = {
    id: 'lap_1',
    driverName: 'Driver A',
    carType: 'Ferrari 296 GT3',
    carClass: 'GT3',
    lapNumber: 1,
    lapTime: 120.5,
    s1: 30.0,
    s2: 45.0,
    s3: 45.5,
    topSpeed: 280.0,
    isValid: true,
  };

  describe('computeLapDeltas', () => {
    it('computes exact zero deltas when comparing identical laps', () => {
      const deltas = computeLapDeltas(baseLap, baseLap);
      expect(deltas.lapTimeDelta).toBe(0);
      expect(deltas.lapTimeDeltaFormatted).toBe('±0.000s');
      expect(deltas.s1Delta).toBe(0);
      expect(deltas.s2Delta).toBe(0);
      expect(deltas.s3Delta).toBe(0);
      expect(deltas.speedDelta).toBe(0);
      expect(deltas.speedDeltaFormatted).toBe('±0.0 km/h');
      expect(deltas.isFasterOverall).toBe(false);
    });

    it('computes positive deltas when target lap is slower and negative speed delta when slower top speed', () => {
      const slowerLap: ComparableLap = {
        ...baseLap,
        id: 'lap_2',
        lapTime: 121.25,
        s1: 30.2,
        s2: 45.5,
        s3: 45.55,
        topSpeed: 275.5,
      };

      const deltas = computeLapDeltas(baseLap, slowerLap);
      expect(deltas.lapTimeDelta).toBe(0.75);
      expect(deltas.lapTimeDeltaFormatted).toBe('+0.750s');
      expect(deltas.lapTimeDeltaClass).toContain('text-lmu-loss');
      expect(deltas.s1Delta).toBe(0.2);
      expect(deltas.s1DeltaFormatted).toBe('+0.200s');
      expect(deltas.speedDelta).toBe(-4.5);
      expect(deltas.speedDeltaFormatted).toBe('-4.5 km/h');
      expect(deltas.isFasterOverall).toBe(false);
    });

    it('computes negative deltas when target lap is faster and positive speed delta when faster', () => {
      const fasterLap: ComparableLap = {
        ...baseLap,
        id: 'lap_3',
        lapTime: 119.8,
        s1: 29.7,
        s2: 44.8,
        s3: 45.3,
        topSpeed: 284.2,
      };

      const deltas = computeLapDeltas(baseLap, fasterLap);
      expect(deltas.lapTimeDelta).toBe(-0.7);
      expect(deltas.lapTimeDeltaFormatted).toBe('-0.700s');
      expect(deltas.lapTimeDeltaClass).toContain('text-lmu-green');
      expect(deltas.s1Delta).toBe(-0.3);
      expect(deltas.speedDelta).toBe(4.2);
      expect(deltas.speedDeltaFormatted).toBe('+4.2 km/h');
      expect(deltas.speedDeltaClass).toContain('text-lmu-cyan');
      expect(deltas.isFasterOverall).toBe(true);
    });

    it('gracefully handles missing sector or speed values', () => {
      const partialLap: ComparableLap = {
        ...baseLap,
        id: 'lap_partial',
        s1: null,
        s2: null,
        s3: null,
        topSpeed: null,
      };

      const deltas = computeLapDeltas(baseLap, partialLap);
      expect(deltas.s1Delta).toBeNull();
      expect(deltas.s1DeltaFormatted).toBe('--');
      expect(deltas.speedDelta).toBeNull();
      expect(deltas.speedDeltaFormatted).toBe('--');
    });
  });

  describe('createTheoreticalBestLap', () => {
    it('creates a valid theoretical lap from valid sectors', () => {
      const theo = createTheoreticalBestLap(29.5, 44.2, 45.1, 'Theoretical Best', 'GT3', 'Optimal Sectors');
      expect(theo.lapTime).toBe(118.8);
      expect(theo.s1).toBe(29.5);
      expect(theo.s2).toBe(44.2);
      expect(theo.s3).toBe(45.1);
      expect(theo.isTheoreticalBest).toBe(true);
    });

    it('handles null sector values gracefully', () => {
      const theo = createTheoreticalBestLap(null, 44.2, 45.1);
      expect(theo.lapTime).toBeNull();
    });

    it('returns null lapTime if any sector is <= 0', () => {
      const theoZero = createTheoreticalBestLap(0, 44.2, 45.1);
      expect(theoZero.lapTime).toBeNull();

      const theoNegative = createTheoreticalBestLap(-5, 44.2, 45.1);
      expect(theoNegative.lapTime).toBeNull();
    });

    it('creates a theoretical lap with paceCategory and pacePercentage attached', () => {
      const theo = createTheoreticalBestLap(
        29.5,
        44.2,
        45.1,
        'Theoretical Optimal',
        'GT3',
        'Porsche 911 GT3 R',
        'Theoretical Best',
        'Competitive',
        101.5
      );
      expect(theo.paceCategory).toBe('Competitive');
      expect(theo.pacePercentage).toBe(101.5);
      expect(theo.tag).toBe('Theoretical Best');
    });
  });

  describe('computeTopNLapAverage', () => {
    it('returns null when laps array is empty or contains no valid times', () => {
      expect(computeTopNLapAverage([])).toBeNull();
      expect(computeTopNLapAverage([{ lapTime: null }])).toBeNull();
    });

    it('computes average of the top 3 clean laps, excluding lap 1 when multiple laps exist', () => {
      const laps = [
        { lapNumber: 1, lapTime: 125.0, isValid: true }, // out-lap excluded
        { lapNumber: 2, lapTime: 121.0, isValid: true },
        { lapNumber: 3, lapTime: 120.0, isValid: true },
        { lapNumber: 4, lapTime: 122.0, isValid: true },
        { lapNumber: 5, lapTime: 123.0, isValid: true },
      ];
      // Top 3 from laps 2-5 are 120.0, 121.0, 122.0 -> average is 121.000
      expect(computeTopNLapAverage(laps, 3)).toBe(121.0);
    });

    it('ignores invalid laps and pit stop laps', () => {
      const laps = [
        { lapNumber: 1, lapTime: 120.0, isValid: true },
        { lapNumber: 2, lapTime: 119.0, isValid: false }, // invalid
        { lapNumber: 3, lapTime: 121.0, isValid: true }, // flying lap
        { lapNumber: 4, lapTime: 122.0, isValid: true }, // flying lap
        { lapNumber: 5, lapTime: 135.0, isValid: true, isPitStop: true }, // pit stop
      ];
      // Valid flying laps are lap 3 (121.0) and lap 4 (122.0) -> average is 121.5
      expect(computeTopNLapAverage(laps, 3)).toBe(121.5);
    });

    it('excludes out-laps immediately following a valid pit stop', () => {
      const laps = [
        { lapNumber: 1, lapTime: 120.0, isValid: true },
        { lapNumber: 2, lapTime: 121.0, isValid: true },
        { lapNumber: 3, lapTime: 135.0, isValid: true, isPitStop: true }, // in-lap
        { lapNumber: 4, lapTime: 180.0, isValid: true }, // out-lap
        { lapNumber: 5, lapTime: 120.5, isValid: true },
        { lapNumber: 6, lapTime: 120.8, isValid: true },
      ];
      // Top 3 from flying laps (2, 5, 6: 121.0, 120.5, 120.8) -> average is 120.767
      expect(computeTopNLapAverage(laps, 3)).toBe(120.767);
    });
  });

  describe('computeConsistencyRating', () => {
    it('returns 100% and 0 stdDev for a single lap', () => {
      const res = computeConsistencyRating([{ lapNumber: 1, lapTime: 120.0, isValid: true }]);
      expect(res.consistencyScore).toBe(100);
      expect(res.stdDev).toBe(0);
      expect(res.avgLapTime).toBe(120.0);
      expect(res.sampleCount).toBe(1);
    });

    it('excludes start lap and does not fall back when only 1 flying lap exists in multi-lap stint', () => {
      const laps = [
        { lapNumber: 1, lapTime: 135.0, isValid: true }, // Start lap (standing start / out-lap)
        { lapNumber: 2, lapTime: 120.0, isValid: true }, // Clean flying lap
      ];
      const res = computeConsistencyRating(laps);
      expect(res.consistencyScore).toBe(100);
      expect(res.stdDev).toBe(0);
      expect(res.avgLapTime).toBe(120.0);
      expect(res.sampleCount).toBe(1);
    });

    it('returns high consistency score for tightly grouped laps', () => {
      const laps = [
        { lapNumber: 1, lapTime: 125.0, isValid: true },
        { lapNumber: 2, lapTime: 120.0, isValid: true },
        { lapNumber: 3, lapTime: 120.1, isValid: true },
        { lapNumber: 4, lapTime: 120.05, isValid: true },
      ];
      const res = computeConsistencyRating(laps);
      expect(res.consistencyScore).toBeGreaterThan(99);
      expect(res.stdDev).toBeLessThan(0.1);
    });

    it('excludes pit stops and the out-lap the parser marked after them from consistency calculations', () => {
      const laps = [
        { lapNumber: 1, lapTime: 125.0, isValid: true }, // Start lap excluded
        { lapNumber: 2, lapTime: 120.0, isValid: true }, // Flying lap
        { lapNumber: 3, lapTime: 120.1, isValid: true }, // Flying lap
        { lapNumber: 4, lapTime: 145.0, isValid: true, isPitStop: true }, // In-lap / Pit Stop -> excluded
        { lapNumber: 5, lapTime: 210.0, isValid: true, isOutLap: true }, // Out-lap (marked by the parser) -> excluded
        { lapNumber: 6, lapTime: 120.05, isValid: true }, // Flying lap
      ];
      const res = computeConsistencyRating(laps);
      // Only laps 2, 3, 6 (120.0, 120.1, 120.05) should be evaluated
      expect(res.consistencyScore).toBeGreaterThan(99);
      expect(res.avgLapTime).toBeCloseTo(120.05, 1);
      expect(res.stdDev).toBeLessThan(0.1);
    });

    it('reads the out-lap flag instead of guessing it from the lap before', () => {
      const laps = [
        { lapNumber: 2, lapTime: 120.0, isValid: true },
        { lapNumber: 3, lapTime: 145.0, isValid: true, isPitStop: true },
        { lapNumber: 4, lapTime: 120.2, isValid: true }, // not marked as an out-lap: counted
      ];
      expect(selectCleanLapCandidates(laps).map(lap => lap.lapNumber)).toEqual([2, 4]);
    });

    it('does not exclude lap 2 as an out-lap if lap 1 was practice start with no completed lap time', () => {
      const laps = [
        { lapNumber: 1, lapTime: null, isValid: false, isPitStop: false }, // Practice start from garage
        { lapNumber: 2, lapTime: 120.0, isValid: true }, // First flying lap -> should be valid!
        { lapNumber: 3, lapTime: 120.2, isValid: true },
      ];
      const res = computeConsistencyRating(laps);
      // Laps 2 and 3 should both be evaluated
      expect(res.consistencyScore).toBeGreaterThan(99);
      expect(res.avgLapTime).toBeCloseTo(120.1, 1);
    });
  });
});
