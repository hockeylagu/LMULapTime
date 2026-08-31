import { describe, it, expect } from 'vitest';
import {
  computeLapDeltas,
  createTheoreticalBestLap,
  createBenchmarkLaps,
  filterLapsByCarCategory,
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
});
