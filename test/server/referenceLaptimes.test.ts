import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseReferenceCsv,
  normalizeTrackName,
  normalizeCarClass,
  getReferenceEntry,
  calculatePaceCategory,
  loadReferenceLaptimesFromCache,
  fetchAndCacheReferenceLaptimes,
} from '../../server/referenceLaptimes';
import fs from 'fs';

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
      // Mock cache loaded
      const cache = parseReferenceCsv(sampleCsv);
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(cache));

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
    it('loads cached data from disk or memory', () => {
      const result = loadReferenceLaptimesFromCache();
      expect(result).toBeDefined();
    });

    it('fetches from network and saves to cache', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(sampleCsv),
      });
      global.fetch = mockFetch;
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const result = await fetchAndCacheReferenceLaptimes();
      expect(result.entriesCount).toBe(3);
      expect(writeSpy).toHaveBeenCalled();
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
});
