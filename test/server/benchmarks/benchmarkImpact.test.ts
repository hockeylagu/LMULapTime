import { describe, it, expect } from 'vitest';
import {
  computeBenchmarkItemImpact,
  enrichBenchmarkDiffWithImpact,
} from '../../../server/benchmarks/benchmarkImpact.js';
import type {
  DetailedSession,
  ReferenceBenchmarkDiff,
  ReferenceBenchmarkDiffItem,
} from '../../../server/core/types.js';

describe('benchmarkImpact engine', () => {
  const mockSessions: DetailedSession[] = [
    {
      id: 'session-bahrain-gt3',
      trackVenue: 'Bahrain',
      trackCourse: 'Grand Prix',
      sessionType: 'Practice 1',
      sessionName: 'FP1 Bahrain',
      drivers: [
        {
          driverName: 'Driver GT3',
          carClass: 'LMGT3',
          carType: 'Aston Martin Vantage LMGT3',
          laps: [
            {
              lapNum: 1,
              lapNumber: 1,
              lapTime: 120.5,
              isValid: true,
            },
            {
              lapNum: 2,
              lapNumber: 2,
              lapTime: 121.5,
              isValid: true,
            },
            {
              lapNum: 3,
              lapNumber: 3,
              lapTime: 0, // invalid / out lap
              isValid: false,
            },
          ],
        },
      ],
    } as unknown as DetailedSession,
    {
      id: 'session-monza-gt3',
      trackVenue: 'Monza',
      trackCourse: 'Grand Prix',
      sessionType: 'Qualifying',
      drivers: [
        {
          driverName: 'Driver Monza',
          carClass: 'LMGT3',
          laps: [{ lapNumber: 1, lapTime: 110.0, isValid: true }],
        },
      ],
    } as unknown as DetailedSession,
    {
      id: 'session-bahrain-hyper',
      trackVenue: 'Bahrain',
      trackCourse: 'Grand Prix',
      sessionType: 'Race',
      drivers: [
        {
          driverName: 'Driver Hyper',
          carClass: 'LMH',
          laps: [{ lapNumber: 1, lapTime: 98.0, isValid: true }],
        },
      ],
    } as unknown as DetailedSession,
  ];

  it('computes affected sessions and category shifts for a modified target', () => {
    // Target moves from 120.0s to 118.0s (target becomes faster)
    // Lap 1: 120.5s -> oldPct = 100.41% (Alien) -> newPct = 102.11% (Good) => SHIFT
    // Lap 2: 121.5s -> oldPct = 101.25% (Competitive) -> newPct = 102.96% (Good) => SHIFT
    const item: ReferenceBenchmarkDiffItem = {
      key: 'bahrain_lmgt3',
      trackName: 'Bahrain',
      carClass: 'LMGT3',
      patch: '1.4+',
      type: 'updated',
      oldAlienSec: 120.0,
      newAlienSec: 118.0,
    };

    const impact = computeBenchmarkItemImpact(item, mockSessions);

    expect(impact.affectedSessionsCount).toBe(1);
    expect(impact.affectedLapsCount).toBe(2);
    expect(impact.categoryShiftsCount).toBe(2);
    expect(impact.categoryShifts).toHaveLength(2);

    expect(impact.categoryShifts[0]).toMatchObject({
      driverName: 'Driver GT3',
      lapNumber: 1,
      lapTimeSec: 120.5,
      oldCategory: 'Alien',
      newCategory: 'Good',
      sessionId: 'session-bahrain-gt3',
    });

    expect(impact.categoryShifts[1]).toMatchObject({
      driverName: 'Driver GT3',
      lapNumber: 2,
      lapTimeSec: 121.5,
      oldCategory: 'Competitive',
      newCategory: 'Good',
    });
  });

  it('reports 0 affected sessions if track or class does not match', () => {
    const item: ReferenceBenchmarkDiffItem = {
      key: 'spa_lmgt3',
      trackName: 'Circuit de Spa-Francorchamps',
      carClass: 'LMGT3',
      patch: '1.4+',
      type: 'updated',
      oldAlienSec: 135.0,
      newAlienSec: 134.0,
    };

    const impact = computeBenchmarkItemImpact(item, mockSessions);
    expect(impact.affectedSessionsCount).toBe(0);
    expect(impact.affectedLapsCount).toBe(0);
    expect(impact.categoryShiftsCount).toBe(0);
    expect(impact.categoryShifts).toEqual([]);
  });

  it('enriches a full benchmark diff with aggregate statistics', () => {
    const diff: ReferenceBenchmarkDiff = {
      timestamp: '2026-10-01T12:00:00Z',
      hasChanges: true,
      addedCount: 0,
      updatedCount: 2,
      removedCount: 0,
      totalEntries: 2,
      added: [],
      updated: [
        {
          key: 'bahrain_lmgt3',
          trackName: 'Bahrain',
          carClass: 'LMGT3',
          patch: '1.4+',
          type: 'updated',
          oldAlienSec: 120.0,
          newAlienSec: 118.0,
        },
        {
          key: 'monza_lmgt3',
          trackName: 'Monza',
          carClass: 'LMGT3',
          patch: '1.4+',
          type: 'updated',
          oldAlienSec: 110.0,
          newAlienSec: 110.0, // unchanged time, e.g. patch note update only
        },
      ],
      removed: [],
    };

    const enriched = enrichBenchmarkDiffWithImpact(diff, mockSessions);

    expect(enriched.updated[0].impact).toBeDefined();
    expect(enriched.updated[0].impact?.categoryShiftsCount).toBe(2);
    expect(enriched.updated[1].impact).toBeDefined();
    expect(enriched.updated[1].impact?.categoryShiftsCount).toBe(0);

    expect(enriched.totalAffectedSessions).toBe(2); // Bahrain + Monza
    expect(enriched.totalCategoryShifts).toBe(2);
  });
});
