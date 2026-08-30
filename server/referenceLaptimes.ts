import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ReferenceLaptimeEntry, ReferenceLaptimesCache, PaceCategory, PaceCategoryInfo } from './types.js';
import { parseTimeStringToSeconds } from '../src/utils/formatters.js';

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

    // Check if line is a valid track row e.g. "Bahrain (wec)LMGT3", "Bahrain (wec)"
    const rawKey = cols[0];
    const trackName = cols[1];
    const patch = cols[2];

    // Col 4 is ~100% target time string e.g. "1:58.91"
    const target100Str = cols[4];
    const target100Sec = parseTimeStringToSeconds(target100Str);

    // Filter out header or invalid rows
    if (!trackName || !target100Sec || target100Str === '~100%' || target100Str === 'calculated:') continue;

    // Col 16 is Car Class (e.g. LMGT3, LMH, LMP3, LMP2elms, LMP2wec, GTE)
    const carClass = cols[16] || (rawKey.replace(trackName, '') || 'General');

    // Thresholds: ~100%, 101%, 102%, 103%, 104%, 105%, 106%, 107%
    const alienSec = parseTimeStringToSeconds(cols[4]) || target100Sec;
    const competitiveSec = parseTimeStringToSeconds(cols[5]) || target100Sec * 1.01;
    const goodSec = parseTimeStringToSeconds(cols[6]) || target100Sec * 1.02;
    const goodMidpackSec = parseTimeStringToSeconds(cols[7]) || target100Sec * 1.03;
    const midpackSec = parseTimeStringToSeconds(cols[8]) || target100Sec * 1.04;
    const midpackTailSec = parseTimeStringToSeconds(cols[9]) || target100Sec * 1.05;
    const tailEnderSec = parseTimeStringToSeconds(cols[10]) || target100Sec * 1.06;
    const offlineSec = parseTimeStringToSeconds(cols[11]) || target100Sec * 1.07;

    const fastestCar = cols[12] || undefined;
    const recordLaptimeSec = parseTimeStringToSeconds(cols[13]) || undefined;

    const entryKey = `${trackName}_${carClass}`.toLowerCase().replace(/[^a-z0-9_]/g, '');

    entries[entryKey] = {
      key: entryKey,
      trackName,
      carClass,
      patch,
      target100Sec,
      targets: {
        alienSec,
        competitiveSec,
        goodSec,
        goodMidpackSec,
        midpackSec,
        midpackTailSec,
        tailEnderSec,
        offlineSec,
      },
      fastestCar,
      recordLaptimeSec,
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

// Track Normalization Helper
export function normalizeTrackName(venue: string = '', course: string = ''): string {
  const combined = `${venue} ${course}`.toLowerCase().trim();

  if (combined.includes('paul ricard') || combined.includes('ricard')) {
    if (combined.includes('short') || combined.includes('v2 short') || combined.includes('1a v2 short')) {
      return 'Paul Ricard (1A v2 short)';
    }
    if (combined.includes('1a v2')) return 'Paul Ricard (1A v2)';
    if (combined.includes('1a')) return 'Paul Ricard (1A)';
    if (combined.includes('3a')) return 'Paul Ricard (3A)';
    return 'Paul Ricard (1A v2)';
  }
  if (combined.includes('spa')) return 'Spa';
  if (combined.includes('monza')) {
    if (combined.includes('curva') || combined.includes('grande')) return 'Monza (curvagrande)';
    return 'Monza';
  }
  if (combined.includes('barcelona') || combined.includes('catalunya')) return 'Barcelona';
  if (combined.includes('sarthe') || combined.includes('mans')) {
    if (combined.includes('straight') || combined.includes('chicaneless')) return 'Circuit de la Sarthe (straight)';
    return 'Circuit de la Sarthe';
  }
  if (combined.includes('cota') || combined.includes('americas')) {
    if (combined.includes('national')) return 'COTA (national)';
    return 'COTA';
  }
  if (combined.includes('daytona')) return 'Daytona';
  if (combined.includes('fuji')) {
    if (combined.includes('classic')) return 'Fuji (classic)';
    return 'Fuji (chicane)';
  }
  if (combined.includes('imola') || combined.includes('ferrari')) return 'Imola';
  if (combined.includes('interlagos') || combined.includes('pace')) return 'Interlagos';
  if (combined.includes('laguna') || combined.includes('seca')) return 'Laguna Seca';
  if (combined.includes('portimao') || combined.includes('algarve')) return 'Portimao';
  if (combined.includes('qatar') || combined.includes('lusail')) {
    if (combined.includes('short')) return 'Qatar (short)';
    return 'Qatar';
  }
  if (combined.includes('sebring')) {
    if (combined.includes('school')) return 'Sebring (school)';
    return 'Sebring';
  }
  if (combined.includes('silverstone')) {
    if (combined.includes('international')) return 'Silverstone (International)';
    if (combined.includes('national')) return 'Silverstone (National)';
    return 'Silverstone (GP)';
  }
  if (combined.includes('bahrain')) {
    if (combined.includes('endurance')) return 'Bahrain (endurance)';
    if (combined.includes('outer')) return 'Bahrain (outer)';
    if (combined.includes('paddock')) return 'Bahrain (paddock)';
    return 'Bahrain (wec)';
  }

  return venue;
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

  const normTrack = normalizeTrackName(venue, course);
  const normClass = normalizeCarClass(carClass, carType);

  const exactKey = `${normTrack}_${normClass}`.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (cache.entries[exactKey]) {
    return cache.entries[exactKey];
  }

  // Match by track name
  const normClean = normTrack.toLowerCase().replace(/[^a-z0-9]/g, '');
  let trackEntries = Object.values(cache.entries).filter(
    e => {
      const eNorm = normalizeTrackName(e.trackName).toLowerCase().replace(/[^a-z0-9]/g, '');
      const eRaw = e.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
      return eNorm === normClean || eRaw === normClean;
    }
  );

  if (trackEntries.length === 0) {
    trackEntries = Object.values(cache.entries).filter(
      e => {
        const eNorm = normalizeTrackName(e.trackName).toLowerCase().replace(/[^a-z0-9]/g, '');
        return eNorm.includes(normClean) || normClean.includes(eNorm);
      }
    );
  }

  if (trackEntries.length > 0) {
    const targetGroup = normClass.toLowerCase();
    const classMatch = trackEntries.find(e => {
      const eClass = e.carClass.toLowerCase();
      if ((targetGroup.includes('lmh') || targetGroup.includes('hyper') || targetGroup.includes('lmdh')) &&
          (eClass.includes('lmh') || eClass.includes('hyper') || eClass.includes('lmdh'))) return true;
      if ((targetGroup.includes('gt3') || targetGroup.includes('lmgt3')) &&
          (eClass.includes('gt3') || eClass.includes('lmgt3'))) return true;
      if (targetGroup.includes('lmp3') && eClass.includes('lmp3')) return true;
      if (targetGroup === 'lmp2elms' || targetGroup.includes('elms')) {
        return eClass.includes('elms') || eClass === 'lmp2elms';
      }
      if (targetGroup === 'lmp2wec' || targetGroup.includes('wec') || targetGroup === 'lmp2') {
        return eClass.includes('wec') || eClass === 'lmp2wec' || (eClass === 'lmp2' && !eClass.includes('elms'));
      }
      if (targetGroup.includes('gte') && eClass.includes('gte')) return true;
      return eClass === targetGroup;
    });

    return classMatch || trackEntries[0];
  }

  return null;
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

  let category: PaceCategory = 'Offline';

  if (percentage <= 100.5) {
    category = 'Alien';
  } else if (percentage <= 101.5) {
    category = 'Competitive';
  } else if (percentage <= 103.5) {
    category = 'Good';
  } else if (percentage <= 105.5) {
    category = 'Midpack';
  } else if (percentage <= 107.0) {
    category = 'Tail-ender';
  } else {
    category = 'Offline';
  }

  return {
    category,
    percentage,
    target100Sec: ref.target100Sec,
    deltaToTargetSec,
  };
}
