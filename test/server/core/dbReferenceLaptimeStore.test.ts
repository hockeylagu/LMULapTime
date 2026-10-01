import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDbSchema } from '../../../server/core/dbSchema.js';
import {
  saveReferenceLaptimes,
  recordBenchmarkDiff,
  getBenchmarkDiffHistory,
  getBenchmarkDiffById,
  clearReferenceLaptimes,
} from '../../../server/core/dbReferenceLaptimeStore.js';
import type { ReferenceBenchmarkDiff, ReferenceLaptimesCache } from '../../../server/core/types.js';

describe('dbReferenceLaptimeStore', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(':memory:');
    initDbSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('records benchmark diffs and retrieves history summaries and single diff by id', () => {
    const diff1: ReferenceBenchmarkDiff = {
      timestamp: '2026-09-01T10:00:00Z',
      hasChanges: true,
      addedCount: 1,
      updatedCount: 2,
      removedCount: 0,
      totalEntries: 180,
      totalAffectedSessions: 5,
      totalCategoryShifts: 3,
      added: [
        {
          key: 'cota_gt3',
          trackName: 'Circuit of the Americas',
          carClass: 'LMGT3',
          patch: '1.4+',
          type: 'added',
          newAlienSec: 125.0,
        },
      ],
      updated: [],
      removed: [],
    };

    const diff2: ReferenceBenchmarkDiff = {
      timestamp: '2026-10-01T10:00:00Z',
      hasChanges: false,
      addedCount: 0,
      updatedCount: 0,
      removedCount: 0,
      totalEntries: 180,
      totalAffectedSessions: 0,
      totalCategoryShifts: 0,
      added: [],
      updated: [],
      removed: [],
    };

    const id1 = recordBenchmarkDiff(db, diff1, 'https://example.com/sheet1.csv');
    const id2 = recordBenchmarkDiff(db, diff2, 'https://example.com/sheet2.csv');

    expect(id1).toBeGreaterThan(0);
    expect(id2).toBeGreaterThan(id1);

    const history = getBenchmarkDiffHistory(db, 10);
    expect(history).toHaveLength(2);
    expect(history[0].id).toBe(id2);
    expect(history[0].hasChanges).toBe(false);
    expect(history[1].id).toBe(id1);
    expect(history[1].hasChanges).toBe(true);
    expect(history[1].totalAffectedSessions).toBe(5);
    expect(history[1].totalCategoryShifts).toBe(3);

    const loaded1 = getBenchmarkDiffById(db, id1);
    expect(loaded1).not.toBeNull();
    expect(loaded1?.added[0].trackName).toBe('Circuit of the Americas');
    expect(loaded1?.id).toBe(id1);

    const nonExistent = getBenchmarkDiffById(db, 9999);
    expect(nonExistent).toBeNull();
  });

  it('records diff automatically during saveReferenceLaptimes when lastUpdateDiff is provided', () => {
    const setMetadata = (key: string, value: string) => {
      db.prepare('INSERT OR REPLACE INTO cache_metadata (key, value) VALUES (?, ?)').run(key, value);
    };

    const cache: ReferenceLaptimesCache = {
      lastUpdated: '2026-10-01T12:00:00Z',
      sourceUrl: 'https://example.com/sheet.csv',
      entriesCount: 1,
      entries: {
        bahrain_gt3: {
          key: 'bahrain_gt3',
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
        },
      },
      lastUpdateDiff: {
        timestamp: '2026-10-01T12:00:00Z',
        hasChanges: true,
        addedCount: 1,
        updatedCount: 0,
        removedCount: 0,
        totalEntries: 1,
        totalAffectedSessions: 1,
        totalCategoryShifts: 0,
        added: [],
        updated: [],
        removed: [],
      },
    };

    saveReferenceLaptimes(db, cache, setMetadata);

    const history = getBenchmarkDiffHistory(db, 10);
    expect(history).toHaveLength(1);
    expect(history[0].hasChanges).toBe(true);

    clearReferenceLaptimes(db);
    expect(getBenchmarkDiffHistory(db, 10)).toHaveLength(0);
  });
});
