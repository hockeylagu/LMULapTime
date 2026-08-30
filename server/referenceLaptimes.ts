import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ReferenceLaptimeEntry, ReferenceLaptimesCache, PaceCategoryInfo } from './types.js';
import { parseTimeStringToSeconds } from '../src/utils/formatters.js';
import {
  normalizeTrackName,
  getPaceCategoryFromPercentage,
  findReferenceEntry,
} from '../src/utils/paceCategory.js';

export { normalizeTrackName };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PUBLISHED_SPREADSHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pub?output=csv&gid=1766901750';

const CACHE_FILE_PATH = path.join(__dirname, 'laptimes_cache.json');

let cachedData: ReferenceLaptimesCache | null = null;

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
        alienSec: parseTimeStringToSeconds(cols[4]) || target100Sec,
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

export function loadReferenceLaptimesFromCache(): ReferenceLaptimesCache | null {
  if (cachedData) return cachedData;

  if (fs.existsSync(CACHE_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      cachedData = JSON.parse(raw);
      console.log(`Loaded ${cachedData?.entriesCount || 0} reference laptimes from cache file`);
      return cachedData;
    } catch (err) {
      console.error('Failed to read reference laptimes cache:', err);
    }
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
  const cache = parseReferenceCsv(csvText);

  try {
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
    console.log(`Saved ${cache.entriesCount} reference laptimes to ${CACHE_FILE_PATH}`);
  } catch (err) {
    console.error('Failed to write reference laptimes cache file:', err);
  }

  cachedData = cache;
  return cache;
}

// Car Class Normalization Helper
export function normalizeCarClass(carClass: string, carType: string = ''): string {
  const combined = `${carClass} ${carType}`.toLowerCase();

  if (combined.includes('hyper') || combined.includes('lmh') || combined.includes('lmdh')) return 'LMH';
  if (combined.includes('gt3') || combined.includes('lmgt3')) return 'LMGT3';
  if (combined.includes('gte')) return 'GTE';
  if (combined.includes('lmp3')) return 'LMP3';
  if (combined.includes('lmp2')) {
    if (combined.includes('elms') || combined.includes('lmp2_elms')) return 'LMP2elms';
    return 'LMP2wec';
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
