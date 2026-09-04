import { ReferenceLaptimeEntry, ReferenceLaptimesCache, ReferenceBenchmarkDiff, ReferenceBenchmarkDiffItem, PaceCategoryInfo } from './types.js';
import { parseTimeStringToSeconds, formatTime } from '../src/utils/formatters.js';
import {
  normalizeTrackName,
  getPaceCategoryFromPercentage,
  findReferenceEntry,
} from '../src/utils/paceCategory.js';
import { getSessionDatabase } from './db.js';

export { normalizeTrackName };

export const PUBLISHED_SPREADSHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pub?output=csv&gid=1766901750';

let cachedData: ReferenceLaptimesCache | null = null;

export function computeReferenceBenchmarkDiff(
  oldEntries: Record<string, ReferenceLaptimeEntry> = {},
  newEntries: Record<string, ReferenceLaptimeEntry> = {}
): ReferenceBenchmarkDiff {
  const added: ReferenceBenchmarkDiffItem[] = [];
  const updated: ReferenceBenchmarkDiffItem[] = [];
  const removed: ReferenceBenchmarkDiffItem[] = [];

  const oldKeysCount = Object.keys(oldEntries).length;

  for (const [key, newEntry] of Object.entries(newEntries)) {
    const oldEntry = oldEntries[key];
    const newAlien = newEntry.targets?.alienSec ?? newEntry.target100Sec;

    if (!oldEntry) {
      if (oldKeysCount > 0) {
        added.push({
          key,
          trackName: newEntry.trackName,
          carClass: newEntry.carClass,
          patch: newEntry.patch,
          type: 'added',
          newAlienSec: newAlien,
          newAlienTimeString: formatTime(newAlien),
        });
      }
    } else {
      const oldAlien = oldEntry.targets?.alienSec ?? oldEntry.target100Sec;
      const diffSec = parseFloat((newAlien - oldAlien).toFixed(3));
      const patchChanged = (oldEntry.patch || '').trim() !== (newEntry.patch || '').trim();
      const timeChanged = Math.abs(diffSec) >= 0.001;

      if (timeChanged || patchChanged) {
        updated.push({
          key,
          trackName: newEntry.trackName,
          carClass: newEntry.carClass,
          patch: newEntry.patch,
          oldPatch: oldEntry.patch,
          newPatch: newEntry.patch,
          type: 'updated',
          oldAlienSec: oldAlien,
          newAlienSec: newAlien,
          oldAlienTimeString: formatTime(oldAlien),
          newAlienTimeString: formatTime(newAlien),
          diffSec,
        });
      }
    }
  }

  if (oldKeysCount > 0) {
    for (const [key, oldEntry] of Object.entries(oldEntries)) {
      if (!newEntries[key]) {
        const oldAlien = oldEntry.targets?.alienSec ?? oldEntry.target100Sec;
        removed.push({
          key,
          trackName: oldEntry.trackName,
          carClass: oldEntry.carClass,
          patch: oldEntry.patch,
          type: 'removed',
          oldAlienSec: oldAlien,
          oldAlienTimeString: formatTime(oldAlien),
        });
      }
    }
  }

  const hasChanges = added.length > 0 || updated.length > 0 || removed.length > 0;

  return {
    timestamp: new Date().toISOString(),
    hasChanges,
    addedCount: added.length,
    updatedCount: updated.length,
    removedCount: removed.length,
    totalEntries: Object.keys(newEntries).length,
    added,
    updated,
    removed,
  };
}

// Simple CSV parser for quoted or unquoted cells
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseReferenceCsv(csvText: string): ReferenceLaptimesCache {
  const lines = csvText.split(/\r?\n/);
  const entries: Record<string, ReferenceLaptimeEntry> = {};

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (cols.length < 12) continue;

    const rawKey = cols[0];
    const trackName = cols[1];
    const patch = cols[2];

    const target100Str = cols[4];
    const target100Sec = parseTimeStringToSeconds(target100Str);

    // Filter out header or invalid rows
    if (!trackName || !target100Sec || target100Str === '~100%' || target100Str === 'calculated:') continue;

    const carClass = cols[16] || (rawKey.replace(trackName, '') || 'General');

    const getTarget = (colIdx: number, multiplier: number) =>
      parseTimeStringToSeconds(cols[colIdx]) || target100Sec * multiplier;

    const entryKey = `${trackName}_${carClass}`.toLowerCase().replace(/[^a-z0-9_]/g, '');

    entries[entryKey] = {
      key: entryKey,
      trackName,
      carClass,
      patch,
      target100Sec,
      targets: {
        alienSec: getTarget(4, 1.0),
        competitiveSec: getTarget(5, 1.01),
        goodSec: getTarget(6, 1.02),
        goodMidpackSec: getTarget(7, 1.03),
        midpackSec: getTarget(8, 1.04),
        midpackTailSec: getTarget(9, 1.05),
        tailEnderSec: getTarget(10, 1.06),
        offlineSec: getTarget(11, 1.07),
      },
      fastestCar: cols[12] || undefined,
      recordLaptimeSec: parseTimeStringToSeconds(cols[13]) || undefined,
    };
  }

  return {
    lastUpdated: new Date().toISOString(),
    sourceUrl: PUBLISHED_SPREADSHEET_CSV_URL,
    entriesCount: Object.keys(entries).length,
    entries,
  };
}

export function resetCachedReferenceLaptimes(): void {
  cachedData = null;
}

export function loadReferenceLaptimesFromCache(): ReferenceLaptimesCache | null {
  if (cachedData) return cachedData;

  try {
    const db = getSessionDatabase();
    const dbCache = db.getReferenceLaptimesCache();
    if (dbCache && dbCache.entriesCount > 0) {
      cachedData = dbCache;
      return cachedData;
    }
  } catch (err) {
    console.warn('[SQLite Reference Laptimes] Failed to read from database:', err);
  }

  return null;
}

export async function fetchAndCacheReferenceLaptimes(): Promise<ReferenceLaptimesCache> {
  console.log(`Fetching reference laptimes from Google Sheets: ${PUBLISHED_SPREADSHEET_CSV_URL}`);
  const res = await fetch(PUBLISHED_SPREADSHEET_CSV_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch spreadsheet CSV: ${res.statusText} (${res.status})`);
  }

  const csvText = await res.text();
  const currentCache = loadReferenceLaptimesFromCache();
  const cache = parseReferenceCsv(csvText);

  // Compute diff against previous cache
  const diff = computeReferenceBenchmarkDiff(currentCache?.entries || {}, cache.entries);
  cache.lastUpdateDiff = diff;

  // Persist directly to SQLite database
  try {
    const db = getSessionDatabase();
    db.saveReferenceLaptimes(cache);
    console.log(`[SQLite Reference Laptimes] Saved ${cache.entriesCount} reference laptimes to SQLite database (changes: ${diff.hasChanges ? 'yes' : 'no'})`);
  } catch (err) {
    console.error('[SQLite Reference Laptimes] Failed to save reference laptimes to database:', err);
  }

  cachedData = cache;
  return cache;
}

// Car Class Normalization Helper
export function normalizeCarClass(carClass: string, carType: string = ''): string {
  const combined = `${carClass} ${carType}`.toLowerCase();

  if (/hyper|lmh|lmdh/.test(combined)) return 'LMH';
  if (/gt3|lmgt3/.test(combined)) return 'LMGT3';
  if (combined.includes('gte')) return 'GTE';
  if (combined.includes('lmp3')) return 'LMP3';
  if (combined.includes('lmp2')) {
    return /elms|lmp2_elms/.test(combined) ? 'LMP2elms' : 'LMP2wec';
  }

  return carClass;
}

// Find reference entry
export function getReferenceEntry(
  venue: string,
  course: string,
  carClass: string,
  carType: string
): ReferenceLaptimeEntry | null {
  const cache = loadReferenceLaptimesFromCache();
  if (!cache) return null;

  const normClass = normalizeCarClass(carClass, carType);
  return findReferenceEntry(cache.entries, venue, course, normClass, carType);
}

// Calculate Pace Category for a Lap Time
export function calculatePaceCategory(
  lapTimeSec: number | null,
  venue: string,
  course: string,
  carClass: string,
  carType: string
): PaceCategoryInfo | null {
  if (!lapTimeSec || lapTimeSec <= 0) return null;

  const ref = getReferenceEntry(venue, course, carClass, carType);
  if (!ref || !ref.target100Sec) return null;

  const percentage = parseFloat(((lapTimeSec / ref.target100Sec) * 100).toFixed(2));
  const deltaToTargetSec = parseFloat((lapTimeSec - ref.target100Sec).toFixed(3));
  const category = getPaceCategoryFromPercentage(percentage);

  return {
    category,
    percentage,
    target100Sec: ref.target100Sec,
    deltaToTargetSec,
  };
}
