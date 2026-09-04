import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseReferenceCsv,
  normalizeTrackName,
  normalizeCarClass,
  calculatePaceCategory,
  loadReferenceLaptimesFromCache,
  fetchAndCacheReferenceLaptimes,
  computeReferenceBenchmarkDiff,
  resetCachedReferenceLaptimes,
} from '../../server/referenceLaptimes';
import { getSessionDatabase, resetSessionDatabaseForTest } from '../../server/db';

describe('referenceLaptimes server module', () => {
  const sampleCsv = `Key,Track,Patch,~100%,~100%,101%,102%,103%,104%,105%,106%,107%,Fastest Car,Record,Diff,Diff%,Class
Bahrain (wec)LMGT3,Bahrain (wec),1.4+,1:58.910,1:58.910,2:00.100,2:01.288,2:02.477,2:03.666,2:04.855,2:06.044,2:07.233,Porsche 911 GT3,1:58.850,0.060,0.05%,LMGT3
SpaLMH,Spa,1.4+,2:00.000,2:00.000,2:01.200,2:02.400,2:03.600,2:04.800,2:06.000,2:07.200,2:08.400,Ferrari 499P,1:59.950,0.050,0.04%,LMH
MonzaLMP2wec,Monza,1.4+,1:35.000,1:35.000,1:35.950,1:36.900,1:37.850,1:38.800,1:39.750,1:40.700,1:41.650,Oreca 07,1:34.900,0.100,0.10%,LMP2wec
HeaderRow,Track,Patch,~100%,~100%,101%,102%,103%,104%,105%,106%,107%,Fastest,Record,Diff,Diff%,Class
`;

  describe('parseReferenceCsv', () => {
    it('parses valid spreadsheet rows into entries and ignores header rows', () => {
      const cache = parseReferenceCsv(sampleCsv);
      expect(cache.entriesCount).toBe(3);
      expect(cache.entries['bahrainwec_lmgt3']).toBeDefined();
      const entry = cache.entries['bahrainwec_lmgt3'];
      expect(entry.trackName).toBe('Bahrain (wec)');
      expect(entry.carClass).toBe('LMGT3');
      expect(entry.target100Sec).toBeCloseTo(118.91);
      expect(entry.targets.competitiveSec).toBeCloseTo(120.10);
      expect(entry.fastestCar).toBe('Porsche 911 GT3');
      expect(entry.recordLaptimeSec).toBeCloseTo(118.85);
    });

    it('handles quotes in CSV fields', () => {
      const csvWithQuotes = `Key,Track,Patch,~100%,~100%,101%,102%,103%,104%,105%,106%,107%,Fastest Car,Record,Diff,Diff%,Class\n"ImolaLMGT3","Imola","1.4+","1:40.000","1:40.000","1:41.000","1:42.000","1:43.000","1:44.000","1:45.000","1:46.000","1:47.000","Ferrari 296","1:39.900","0.100","0.10%","LMGT3"`;
      const cache = parseReferenceCsv(csvWithQuotes);
      expect(cache.entriesCount).toBe(1);
      expect(cache.entries['imola_lmgt3'].trackName).toBe('Imola');
    });
  });

  describe('normalizeTrackName and normalizeCarClass', () => {
    it('normalizes tracks properly', () => {
      expect(normalizeTrackName('Circuit de Spa-Francorchamps')).toBe('Spa');
      expect(normalizeTrackName('Autodromo Nazionale Monza')).toBe('Monza');
      expect(normalizeTrackName('Circuit Paul Ricard', '1A v2')).toBe('Paul Ricard (1A v2)');
    });

    it('normalizes car classes properly', () => {
      expect(normalizeCarClass('Hypercar')).toBe('LMH');
      expect(normalizeCarClass('LMGT3')).toBe('LMGT3');
      expect(normalizeCarClass('LMP2', 'ELMS')).toBe('LMP2elms');
      expect(normalizeCarClass('LMP2', 'WEC')).toBe('LMP2wec');
      expect(normalizeCarClass('LMP3')).toBe('LMP3');
      expect(normalizeCarClass('GTE')).toBe('GTE');
      expect(normalizeCarClass('UnknownClass')).toBe('UnknownClass');
    });
  });

  describe('calculatePaceCategory', () => {
    it('returns null for null, 0, or negative lap times', () => {
      expect(calculatePaceCategory(null, 'Spa', 'GP', 'LMH', 'Ferrari')).toBeNull();
      expect(calculatePaceCategory(0, 'Spa', 'GP', 'LMH', 'Ferrari')).toBeNull();
      expect(calculatePaceCategory(-10, 'Spa', 'GP', 'LMH', 'Ferrari')).toBeNull();
    });

    it('correctly maps Alien (<100.5%), Competitive (100.5-101.5%), Good (101.5-103.5%), Midpack, Tail-ender, Offline', () => {
      // Save cache directly to DB
      const db = getSessionDatabase();
      const cache = parseReferenceCsv(sampleCsv);
      db.saveReferenceLaptimes(cache);
      resetCachedReferenceLaptimes();

      // 120s reference for Spa LMH
      // Alien: <= 120.6s (100.5%)
      const alien = calculatePaceCategory(120.2, 'Spa', 'GP', 'LMH', 'Ferrari');
      expect(alien?.category).toBe('Alien');
      expect(alien?.percentage).toBeCloseTo(100.17);

      // Competitive: <= 121.8s (101.5%)
      const competitive = calculatePaceCategory(121.0, 'Spa', 'GP', 'LMH', 'Ferrari');
      expect(competitive?.category).toBe('Competitive');

      // Good: <= 124.2s (103.5%)
      const good = calculatePaceCategory(123.0, 'Spa', 'GP', 'LMH', 'Ferrari');
      expect(good?.category).toBe('Good');

      // Midpack: <= 126.6s (105.5%)
      const midpack = calculatePaceCategory(125.0, 'Spa', 'GP', 'LMH', 'Ferrari');
      expect(midpack?.category).toBe('Midpack');

      // Tail-ender: <= 128.4s (107.0%)
      const tail = calculatePaceCategory(127.5, 'Spa', 'GP', 'LMH', 'Ferrari');
      expect(tail?.category).toBe('Tail-ender');

      // Offline: > 107.0%
      const offline = calculatePaceCategory(135.0, 'Spa', 'GP', 'LMH', 'Ferrari');
      expect(offline?.category).toBe('Offline');
    });

    it('returns null if track or class does not exist in reference data', () => {
      const unknown = calculatePaceCategory(100, 'NonExistentTrack12345', '', 'LMH', '');
      expect(unknown).toBeNull();
    });
  });

  describe('loadReferenceLaptimesFromCache and fetchAndCacheReferenceLaptimes', () => {
    beforeEach(() => {
      resetSessionDatabaseForTest();
      resetCachedReferenceLaptimes();
    });

    it('loads and saves benchmark data directly to SQLite database', () => {
      const db = getSessionDatabase();
      const parsed = parseReferenceCsv(sampleCsv);

      // Initially empty in memory DB
      expect(db.getReferenceLaptimesCache()).toBeNull();

      // Save to SQLite
      db.saveReferenceLaptimes(parsed);

      // Retrieve from SQLite
      const retrieved = db.getReferenceLaptimesCache();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.entriesCount).toBe(3);
      expect(retrieved?.entries['bahrainwec_lmgt3']?.target100Sec).toBeCloseTo(118.91);

      // Direct lookup from SQLite table
      const single = db.getReferenceLaptimeEntry('bahrainwec_lmgt3');
      expect(single).not.toBeNull();
      expect(single?.trackName).toBe('Bahrain (wec)');

      // loadReferenceLaptimesFromCache retrieves from SQLite
      resetCachedReferenceLaptimes();
      const cacheResult = loadReferenceLaptimesFromCache();
      expect(cacheResult).not.toBeNull();
      expect(cacheResult?.entriesCount).toBe(3);
    });

    it('fetches from network and saves to SQLite database cache', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(sampleCsv),
      });
      global.fetch = mockFetch;

      const result = await fetchAndCacheReferenceLaptimes();
      expect(result.entriesCount).toBe(3);

      // Verify stored in SQLite
      const db = getSessionDatabase();
      const dbCache = db.getReferenceLaptimesCache();
      expect(dbCache?.entriesCount).toBe(3);
      expect(dbCache?.entries['bahrainwec_lmgt3']).toBeDefined();
    });

    it('throws error if network fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(fetchAndCacheReferenceLaptimes()).rejects.toThrow('Failed to fetch spreadsheet CSV');
    });
  });

  describe('computeReferenceBenchmarkDiff', () => {
    const oldEntries: any = {
      bahrain_lmgt3: {
        key: 'bahrain_lmgt3',
        trackName: 'Bahrain',
        carClass: 'LMGT3',
        patch: '1.3',
        target100Sec: 120.0,
        targets: { alienSec: 120.0, competitiveSec: 121.2, goodSec: 122.4, goodMidpackSec: 123.6, midpackSec: 124.8, midpackTailSec: 126.0, tailEnderSec: 127.2, offlineSec: 128.4 },
      },
      spa_lmh: {
        key: 'spa_lmh',
        trackName: 'Spa',
        carClass: 'LMH',
        patch: '1.4',
        target100Sec: 122.0,
        targets: { alienSec: 122.0, competitiveSec: 123.2, goodSec: 124.4, goodMidpackSec: 125.6, midpackSec: 126.8, midpackTailSec: 128.0, tailEnderSec: 129.2, offlineSec: 130.4 },
      },
      monza_lmp2: {
        key: 'monza_lmp2',
        trackName: 'Monza',
        carClass: 'LMP2',
        patch: '1.4',
        target100Sec: 95.0,
        targets: { alienSec: 95.0, competitiveSec: 95.95, goodSec: 96.9, goodMidpackSec: 97.85, midpackSec: 98.8, midpackTailSec: 99.75, tailEnderSec: 100.7, offlineSec: 101.65 },
      },
    };

    it('identifies added, updated, and removed benchmark entries accurately', () => {
      const newEntries: any = {
        // bahrain_lmgt3: faster time & new patch -> UPDATED
        bahrain_lmgt3: {
          ...oldEntries.bahrain_lmgt3,
          patch: '1.4+',
          target100Sec: 119.5,
          targets: { ...oldEntries.bahrain_lmgt3.targets, alienSec: 119.5 },
        },
        // spa_lmh: unchanged -> NO CHANGE
        spa_lmh: { ...oldEntries.spa_lmh },
        // monza_lmp2: removed
        // lemans_hypercar: brand new entry -> ADDED
        lemans_hypercar: {
          key: 'lemans_hypercar',
          trackName: 'Le Mans',
          carClass: 'Hypercar',
          patch: '1.4+',
          target100Sec: 205.0,
          targets: { alienSec: 205.0, competitiveSec: 207.0, goodSec: 209.0, goodMidpackSec: 211.0, midpackSec: 213.0, midpackTailSec: 215.0, tailEnderSec: 217.0, offlineSec: 219.0 },
        },
      };

      const diff = computeReferenceBenchmarkDiff(oldEntries, newEntries);
      expect(diff.hasChanges).toBe(true);
      expect(diff.addedCount).toBe(1);
      expect(diff.updatedCount).toBe(1);
      expect(diff.removedCount).toBe(1);

      // Added checks
      expect(diff.added[0].trackName).toBe('Le Mans');
      expect(diff.added[0].newAlienTimeString).toBe('3:25.000');

      // Updated checks
      expect(diff.updated[0].trackName).toBe('Bahrain');
      expect(diff.updated[0].oldAlienTimeString).toBe('2:00.000');
      expect(diff.updated[0].newAlienTimeString).toBe('1:59.500');
      expect(diff.updated[0].diffSec).toBe(-0.5);
      expect(diff.updated[0].oldPatch).toBe('1.3');
      expect(diff.updated[0].newPatch).toBe('1.4+');

      // Removed checks
      expect(diff.removed[0].trackName).toBe('Monza');
    });

    it('returns hasChanges: false when benchmarks are identical', () => {
      const diff = computeReferenceBenchmarkDiff(oldEntries, { ...oldEntries });
      expect(diff.hasChanges).toBe(false);
      expect(diff.addedCount).toBe(0);
      expect(diff.updatedCount).toBe(0);
      expect(diff.removedCount).toBe(0);
    });
  });
});
