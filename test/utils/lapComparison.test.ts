import { describe, it, expect } from 'vitest';
import {
  computeLapDeltas,
  createTheoreticalBestLap,
  createBenchmarkLaps,
  filterLapsByCarCategory,
  computeLapToLapDelta,
  computeTopNLapAverage,
  computeConsistencyRating,
  ComparableLap,
} from '../../src/utils/lapComparison.js';
import { ReferenceLaptimeEntry } from '../../server/types.js';

describe('lapComparison utility', () => {
  const baseLap: ComparableLap = {
    id: 'lap_1',
    driverName: 'Driver A',
    carType: 'Ferrari 296 GT3',
    carClass: 'LMGT3',
    lapNum: 1,
    lapTime: 120.5,
    lapTimeString: '2:00.500',
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
      expect(deltas.lapTimeDeltaClass).toContain('text-rose-400');
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
      const theo = createTheoreticalBestLap(29.5, 44.2, 45.1, 'Theoretical Best', 'LMGT3', 'Optimal Sectors');
      expect(theo.lapTime).toBe(118.8);
      expect(theo.lapTimeString).toBe('1:58.800');
      expect(theo.s1).toBe(29.5);
      expect(theo.s2).toBe(44.2);
      expect(theo.s3).toBe(45.1);
      expect(theo.isTheoreticalBest).toBe(true);
    });

    it('handles null sector values gracefully', () => {
      const theo = createTheoreticalBestLap(null, 44.2, 45.1);
      expect(theo.lapTime).toBeNull();
      expect(theo.lapTimeString).toBe('--:--.---');
    });
  });

  describe('createBenchmarkLaps', () => {
    it('creates Alien, Competitive, and Good benchmark laps from a ReferenceLaptimeEntry', () => {
      const refEntry: ReferenceLaptimeEntry = {
        key: 'Bahrain_LMGT3',
        trackName: 'Bahrain',
        carClass: 'LMGT3',
        patch: '1.4+',
        target100Sec: 120.0,
        targets: {
          alienSec: 120.0,
          competitiveSec: 121.2,
          goodSec: 122.4,
          goodMidpackSec: 123.6,
          midpackSec: 124.8,
          midpackTailSec: 126.0,
          tailEnderSec: 127.2,
          offlineSec: 128.4,
        },
      };

      const benchmarks = createBenchmarkLaps(refEntry);
      expect(benchmarks.length).toBe(3);
      expect(benchmarks[0].benchmarkCategory).toBe('Alien');
      expect(benchmarks[0].lapTime).toBe(120.0);
      expect(benchmarks[1].benchmarkCategory).toBe('Competitive');
      expect(benchmarks[1].lapTime).toBe(121.2);
      expect(benchmarks[2].benchmarkCategory).toBe('Good');
      expect(benchmarks[2].lapTime).toBe(122.4);
    });
  });

  describe('filterLapsByCarCategory', () => {
    const mixedLaps: ComparableLap[] = [
      { ...baseLap, id: '1', carClass: 'LMGT3', carType: 'Ferrari 296 GT3' },
      { ...baseLap, id: '2', carClass: 'LMGT3', carType: 'BMW M4 GT3' },
      { ...baseLap, id: '3', carClass: 'LMH', carType: 'Ferrari 499P' },
      { ...baseLap, id: '4', carClass: 'LMP2', carType: 'Oreca 07' },
    ];

    it('returns all laps when carClass is All', () => {
      const result = filterLapsByCarCategory(mixedLaps, 'All');
      expect(result.length).toBe(4);
    });

    it('filters strictly by carClass', () => {
      const result = filterLapsByCarCategory(mixedLaps, 'LMGT3');
      expect(result.length).toBe(2);
      expect(result.every(l => l.carClass === 'LMGT3')).toBe(true);
    });

    it('filters by both carClass and specific carModel', () => {
      const result = filterLapsByCarCategory(mixedLaps, 'LMGT3', 'BMW M4 GT3');
      expect(result.length).toBe(1);
      expect(result[0].carType).toBe('BMW M4 GT3');
    });
  });

  describe('computeLapToLapDelta', () => {
    it('returns null and fallback string when previous lap or current lap is missing or invalid', () => {
      expect(computeLapToLapDelta(null, 120.0)).toEqual({
        delta: null,
        formatted: '--',
        deltaClass: 'text-lmu-muted',
        isFaster: null,
      });
      expect(computeLapToLapDelta(120.0, null)).toEqual({
        delta: null,
        formatted: '--',
        deltaClass: 'text-lmu-muted',
        isFaster: null,
      });
      expect(computeLapToLapDelta(0, 120.0).formatted).toBe('--');
    });

    it('computes exact zero delta for equal consecutive lap times', () => {
      const res = computeLapToLapDelta(122.5, 122.5);
      expect(res.delta).toBe(0);
      expect(res.formatted).toBe('±0.000s');
      expect(res.isFaster).toBe(false);
    });

    it('computes negative delta with emerald styling when current lap is faster than previous lap', () => {
      const res = computeLapToLapDelta(123.456, 122.123);
      expect(res.delta).toBe(-1.333);
      expect(res.formatted).toBe('-1.333s');
      expect(res.deltaClass).toContain('text-emerald-400');
      expect(res.isFaster).toBe(true);
    });

    it('computes positive delta with rose styling when current lap is slower than previous lap', () => {
      const res = computeLapToLapDelta(122.0, 122.456);
      expect(res.delta).toBe(0.456);
      expect(res.formatted).toBe('+0.456s');
      expect(res.deltaClass).toContain('text-rose-400');
      expect(res.isFaster).toBe(false);
    });
  });

  describe('computeTopNLapAverage', () => {
    it('returns null when laps array is empty or contains no valid times', () => {
      expect(computeTopNLapAverage([])).toBeNull();
      expect(computeTopNLapAverage([{ lapTime: null }])).toBeNull();
    });

    it('computes average of the top 3 clean laps, excluding lap 1 when multiple laps exist', () => {
      const laps = [
        { lapNum: 1, lapTime: 125.0, isValid: true }, // out-lap excluded
        { lapNum: 2, lapTime: 121.0, isValid: true },
        { lapNum: 3, lapTime: 120.0, isValid: true },
        { lapNum: 4, lapTime: 122.0, isValid: true },
        { lapNum: 5, lapTime: 123.0, isValid: true },
      ];
      // Top 3 from laps 2-5 are 120.0, 121.0, 122.0 -> average is 121.000
      expect(computeTopNLapAverage(laps, 3)).toBe(121.0);
    });

    it('ignores invalid laps and pit stop laps', () => {
      const laps = [
        { lapNum: 1, lapTime: 120.0, isValid: true },
        { lapNum: 2, lapTime: 119.0, isValid: false }, // invalid
        { lapNum: 3, lapTime: 118.0, isValid: true, isPitStop: true }, // pit stop
        { lapNum: 4, lapTime: 121.0, isValid: true },
        { lapNum: 5, lapTime: 122.0, isValid: true },
      ];
      // Valid flying laps are lap 4 (121.0) and lap 5 (122.0) -> average is 121.5
      expect(computeTopNLapAverage(laps, 3)).toBe(121.5);
    });
  });

  describe('computeConsistencyRating', () => {
    it('returns 100% and 0 stdDev for a single lap', () => {
      const res = computeConsistencyRating([{ lapNum: 1, lapTime: 120.0, isValid: true }]);
      expect(res.consistencyScore).toBe(100);
      expect(res.stdDev).toBe(0);
      expect(res.avgLapTime).toBe(120.0);
    });

    it('returns high consistency score for tightly grouped laps', () => {
      const laps = [
        { lapNum: 1, lapTime: 125.0, isValid: true },
        { lapNum: 2, lapTime: 120.0, isValid: true },
        { lapNum: 3, lapTime: 120.1, isValid: true },
        { lapNum: 4, lapTime: 120.05, isValid: true },
      ];
      const res = computeConsistencyRating(laps);
      expect(res.consistencyScore).toBeGreaterThan(99);
      expect(res.stdDev).toBeLessThan(0.1);
    });

    it('excludes pit stops and the lap after a pit stop (out-lap) from consistency calculations', () => {
      const laps = [
        { lapNum: 1, lapTime: 125.0, isValid: true }, // Start lap excluded
        { lapNum: 2, lapTime: 120.0, isValid: true }, // Flying lap
        { lapNum: 3, lapTime: 120.1, isValid: true }, // Flying lap
        { lapNum: 4, lapTime: 145.0, isValid: true, isPitStop: true }, // In-lap / Pit Stop -> excluded
        { lapNum: 5, lapTime: 210.0, isValid: true }, // Out-lap (immediately follows pit stop) -> excluded
        { lapNum: 6, lapTime: 120.05, isValid: true }, // Flying lap
      ];
      const res = computeConsistencyRating(laps);
      // Only laps 2, 3, 6 (120.0, 120.1, 120.05) should be evaluated
      expect(res.consistencyScore).toBeGreaterThan(99);
      expect(res.avgLapTime).toBeCloseTo(120.05, 1);
      expect(res.stdDev).toBeLessThan(0.1);
    });

    it('does not exclude lap 2 as an out-lap if lap 1 was practice start with no completed lap time', () => {
      const laps = [
        { lapNum: 1, lapTime: null, isValid: false, isPitStop: false }, // Practice start from garage
        { lapNum: 2, lapTime: 120.0, isValid: true }, // First flying lap -> should be valid!
        { lapNum: 3, lapTime: 120.2, isValid: true },
      ];
      const res = computeConsistencyRating(laps);
      // Laps 2 and 3 should both be evaluated
      expect(res.consistencyScore).toBeGreaterThan(99);
      expect(res.avgLapTime).toBeCloseTo(120.1, 1);
    });
  });
});
