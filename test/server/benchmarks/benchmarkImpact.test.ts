import { describe, it, expect } from 'vitest';
import {
  computeBenchmarkItemImpact,
  enrichBenchmarkDiffWithImpact,
  enrichBenchmarkDiffWithCompactImpact,
  BENCHMARK_IMPACT_RULE,
} from '../../../server/benchmarks/benchmarkImpact.js';
import type {
  DetailedSession,
  ReferenceBenchmarkDiff,
  ReferenceBenchmarkDiffItem,
} from '../../../server/core/types.js';
import { SessionDatabase } from '../../../server/core/db.js';

describe('benchmarkImpact engine', () => {
  const mockSessions: DetailedSession[] = [
    {
      id: 'session-bahrain-gt3',
      filename: 'session-bahrain-gt3.xml',
      filePath: 'session-bahrain-gt3.xml',
      timestamp: 1,
      timeString: '2026/01/01 00:00:00',
      trackVenue: 'Bahrain',
      trackCourse: 'Grand Prix',
      sessionType: 'Practice 1',
      sessionName: 'FP1 Bahrain',
      drivers: [
        {
          name: 'Driver GT3',
          isPlayer: true,
          carClass: 'LMGT3',
          carType: 'Aston Martin Vantage LMGT3',
          laps: [
            {
              lapNum: 1,
              lapNumber: 1,
              lapTime: 120.5,
              isValid: true,
              isPitStop: false,
            },
            {
              lapNum: 2,
              lapNumber: 2,
              lapTime: 121.5,
              isValid: true,
              isPitStop: false,
            },
            {
              lapNum: 3,
              lapNumber: 3,
              lapTime: 0, // invalid / out lap
              isValid: false,
              isPitStop: false,
            },
          ],
        },
        {
          name: 'Rival GT3',
          isPlayer: false,
          carClass: 'LMGT3',
          carType: 'Aston Martin Vantage LMGT3',
          laps: [{ lapNum: 1, lapNumber: 1, lapTime: 120.6, isValid: true, isPitStop: false }],
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
          name: 'Driver Monza',
          isPlayer: true,
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
          name: 'Driver Hyper',
          isPlayer: true,
          carClass: 'LMH',
          laps: [{ lapNumber: 1, lapTime: 98.0, isValid: true }],
        },
      ],
    } as unknown as DetailedSession,
  ];

  it('matches legacy impact counts and samples from compact lap facts', () => {
    const database = new SessionDatabase(':memory:');
    database.upsertSession(mockSessions[0], `${mockSessions[0].id}.xml`, 1, 1);
    const item: ReferenceBenchmarkDiffItem = {
      key: 'bahrain_lmgt3', trackName: 'Bahrain', carClass: 'LMGT3', patch: '1.0', type: 'updated',
      oldAlienSec: 121, newAlienSec: 120,
    };
    const expected = computeBenchmarkItemImpact(item, [mockSessions[0]]);
    const diff: ReferenceBenchmarkDiff = {
      timestamp: new Date(0).toISOString(), hasChanges: true, addedCount: 0, updatedCount: 1, removedCount: 0,
      totalEntries: 1, added: [], updated: [{ ...item }], removed: [],
    };
    const actual = enrichBenchmarkDiffWithCompactImpact(diff, database.getDb()).updated[0].impact;
    expect(actual).toEqual(expected);
    database.close();
  });

  it('aggregates full counts in SQL while returning only a bounded sample and retaining zero-lap sessions', () => {
    const database = new SessionDatabase(':memory:');
    const source = mockSessions[0];
    const sourcePlayer = source.drivers?.find(driver => driver.isPlayer);
    if (!sourcePlayer) throw new Error('Expected player fixture');
    const sourceLap = sourcePlayer.laps?.[0];
    if (!sourceLap) throw new Error('Expected player lap fixture');
    const many = { ...source, id: 'many-laps', drivers: [{ ...sourcePlayer, laps: Array.from({ length: 40 }, (_, index) => ({
      ...sourceLap, lapNum: index + 1, lapNumber: index + 1, lapTime: 120.5, isValid: true,
    })) }] } as unknown as DetailedSession;
    const noLaps = { ...source, id: 'player-no-laps', drivers: [{ ...sourcePlayer, laps: [] }] } as unknown as DetailedSession;
    database.upsertSession(many, 'many-laps.xml', 1, 1);
    database.upsertSession(noLaps, 'player-no-laps.xml', 2, 1);
    const item: ReferenceBenchmarkDiffItem = {
      key: 'bahrain_lmgt3', trackName: 'Bahrain', carClass: 'LMGT3', patch: '1.0', type: 'updated',
      oldAlienSec: 120, newAlienSec: 118,
    };
    const diff: ReferenceBenchmarkDiff = {
      timestamp: new Date(0).toISOString(), hasChanges: true, addedCount: 0, updatedCount: 1, removedCount: 0,
      totalEntries: 1, added: [], updated: [{ ...item }], removed: [],
    };

    const enriched = enrichBenchmarkDiffWithCompactImpact(diff, database.getDb());
    expect(enriched.updated[0].impact).toMatchObject({ affectedSessionsCount: 2, affectedLapsCount: 40, categoryShiftsCount: 40 });
    expect(enriched.updated[0].impact?.categoryShifts).toHaveLength(25);
    expect(enriched.totalAffectedSessions).toBe(2);
    expect(enriched.totalCategoryShifts).toBe(40);
    database.close();
  });

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

  it('counts only the player laps, never the other drivers', () => {
    const item: ReferenceBenchmarkDiffItem = {
      key: 'bahrain_lmgt3', trackName: 'Bahrain', carClass: 'LMGT3', patch: '1.4+', type: 'updated',
      oldAlienSec: 120.0, newAlienSec: 118.0,
    };
    const impact = computeBenchmarkItemImpact(item, mockSessions);
    expect(impact.categoryShifts.map(shift => shift.driverName)).not.toContain('Rival GT3');
    expect(impact.affectedLapsCount).toBe(2);
  });

  it('marks an enriched diff with the current impact rule', () => {
    const diff: ReferenceBenchmarkDiff = {
      timestamp: '2026-10-01T12:00:00Z', hasChanges: false, addedCount: 0, updatedCount: 0, removedCount: 0,
      totalEntries: 0, added: [], updated: [], removed: [],
    };
    expect(enrichBenchmarkDiffWithImpact(diff, mockSessions).impactRule).toBe(BENCHMARK_IMPACT_RULE);
  });
});
