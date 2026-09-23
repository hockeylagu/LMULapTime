import { PaceCategory, ReferenceLaptimeEntry } from '../../server/core/types';

export interface PaceCategoryStyle {
  category: PaceCategory;
  label: string;
  emoji: string;
  badgeClass: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}

export const PACE_CATEGORY_STYLES: Record<PaceCategory, PaceCategoryStyle> = {
  Alien: {
    category: 'Alien',
    label: 'Alien',
    emoji: '👾',
    badgeClass: 'bg-purple-950/60 text-purple-300 border-purple-500/40 shadow-purple-900/20',
    textClass: 'text-purple-400',
    bgClass: 'bg-purple-500/10',
    borderClass: 'border-purple-500/30',
  },
  Competitive: {
    category: 'Competitive',
    label: 'Competitive',
    emoji: '🏆',
    badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-500/40 shadow-amber-900/20',
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/30',
  },
  Good: {
    category: 'Good',
    label: 'Good',
    emoji: '⭐',
    badgeClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 shadow-emerald-900/20',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/30',
  },
  Midpack: {
    category: 'Midpack',
    label: 'Midpack',
    emoji: '🏎️',
    badgeClass: 'bg-sky-950/60 text-sky-300 border-sky-500/40 shadow-sky-900/20',
    textClass: 'text-sky-400',
    bgClass: 'bg-sky-500/10',
    borderClass: 'border-sky-500/30',
  },
  'Tail-ender': {
    category: 'Tail-ender',
    label: 'Tail-ender',
    emoji: '🐢',
    badgeClass: 'bg-orange-950/60 text-orange-300 border-orange-500/40 shadow-orange-900/20',
    textClass: 'text-orange-400',
    bgClass: 'bg-orange-500/10',
    borderClass: 'border-orange-500/30',
  },
  Offline: {
    category: 'Offline',
    label: 'Offline',
    emoji: '💤',
    badgeClass: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/40',
    textClass: 'text-zinc-400',
    bgClass: 'bg-zinc-800/20',
    borderClass: 'border-zinc-700/30',
  },
};

export function getPaceCategoryStyle(category?: PaceCategory | null): PaceCategoryStyle {
  if (!category || !PACE_CATEGORY_STYLES[category]) {
    return PACE_CATEGORY_STYLES.Offline;
  }
  return PACE_CATEGORY_STYLES[category];
}

export function getPaceCategoryFromPercentage(percentage: number): PaceCategory {
  if (percentage <= 100.5) return 'Alien';
  if (percentage <= 101.5) return 'Competitive';
  if (percentage <= 103.5) return 'Good';
  if (percentage <= 105.5) return 'Midpack';
  if (percentage <= 107.0) return 'Tail-ender';
  return 'Offline';
}

export function formatPacePercentage(percentage?: number | null): string {
  if (percentage === undefined || percentage === null || isNaN(percentage)) return '--%';
  return `${percentage.toFixed(1)}%`;
}

// Car Class Normalization Helper
export function normalizeCarClass(carClass?: string, carType: string = ''): string {
  const combined = `${carClass || ''} ${carType || ''}`.toLowerCase();

  if (/hyper|lmh|lmdh/.test(combined)) return 'LMH';
  if (/gt3|lmgt3/.test(combined)) return 'LMGT3';
  if (combined.includes('gte')) return 'GTE';
  if (combined.includes('lmp3')) return 'LMP3';
  if (combined.includes('lmp2')) {
    return /elms|lmp2_elms/.test(combined) ? 'LMP2elms' : 'LMP2wec';
  }

  return carClass || '';
}

export interface CarClassOption {
  id: string;
  label: string;
}

export const VEHICLE_CLASS_OPTIONS: CarClassOption[] = [
  { id: 'All', label: 'All Classes' },
  { id: 'LMGT3', label: 'LMGT3' },
  { id: 'LMH', label: 'Hypercar' },
  { id: 'LMP3', label: 'LMP3' },
  { id: 'LMP2elms', label: 'LMP2 (ELMS)' },
  { id: 'LMP2wec', label: 'LMP2 (WEC)' },
  { id: 'GTE', label: 'GTE' },
];

export function matchesCarClass(carClass: string = '', carType: string = '', targetClass: string = 'All'): boolean {
  if (!targetClass || targetClass === 'All') return true;

  const combined = `${carClass} ${carType}`.toLowerCase();
  const target = targetClass.toLowerCase();

  switch (target) {
    case 'lmh':
    case 'hypercar':
    case 'hyper':
    case 'lmdh':
      return /hyper|lmh|lmdh/.test(combined);
    case 'lmgt3':
    case 'gt3':
      return /gt3|lmgt3/.test(combined);
    case 'lmp2elms':
    case 'lmp2 (elms)':
    case 'lmp2_elms':
    case 'elms':
      return /elms|lmp2_elms/.test(combined);
    case 'lmp2wec':
    case 'lmp2 (wec)':
    case 'lmp2':
    case 'wec':
      return combined.includes('lmp2') && !combined.includes('elms');
    case 'lmp3':
      return combined.includes('lmp3');
    case 'gte':
      return combined.includes('gte');
    default:
      return combined.includes(target);
  }
}

/**
 * Checks if a session matches a target car class by evaluating either playerDriver
 * or any participating driver in the session.
 */
export function matchesSessionCarClass(
  session: {
    playerDriver?: { carClass?: string | null; carType?: string | null } | null;
    drivers?: Array<{ carClass?: string | null; carType?: string | null }> | null;
  },
  targetClass: string = 'All'
): boolean {
  if (!targetClass || targetClass === 'All') return true;

  if (
    session.playerDriver &&
    matchesCarClass(session.playerDriver.carClass || '', session.playerDriver.carType || '', targetClass)
  ) {
    return true;
  }

  if (session.drivers && session.drivers.length > 0) {
    return session.drivers.some(d =>
      matchesCarClass(d.carClass || '', d.carType || '', targetClass)
    );
  }

  return false;
}


import { getDisplayTrackName } from './formatters.js';
import { getCircuitSpecification } from './circuitSpecs.js';


/**
 * Robust track matching comparing any query track against a session venue and course.
 */
export function matchesTrack(
  queryTrack: string = '',
  venue: string = '',
  course: string = ''
): boolean {
  if (!queryTrack || queryTrack === 'All' || queryTrack.trim() === '') return true;

  const qSpec = getCircuitSpecification(queryTrack);
  const sSpec = getCircuitSpecification(venue, course);

  // If both are known standard circuits:
  if (qSpec.layoutKey !== 'unknown' && sSpec.layoutKey !== 'unknown') {
    return qSpec.layoutKey === sSpec.layoutKey;
  }

  // Fallback for custom / mod tracks:
  const qClean = queryTrack.toLowerCase().replace(/[^a-z0-9]/g, '');
  const sClean = `${venue} ${course}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  const vClean = (venue || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const displayClean = getDisplayTrackName(venue, course).toLowerCase().replace(/[^a-z0-9]/g, '');

  if (qClean === sClean || qClean === vClean || qClean === displayClean) return true;
  if (sClean.includes(qClean) || qClean.includes(sClean) || displayClean.includes(qClean) || qClean.includes(displayClean)) {
    return true;
  }

  return false;
}

/**
 * Finds all matching benchmark entries for a given track venue and optional course.
 */
export function findMatchingTrackBenchmarkEntries(
  entries: Record<string, ReferenceLaptimeEntry> | ReferenceLaptimeEntry[],
  trackVenue: string = '',
  course: string = '',
  trackLengthMeters?: number | null
): ReferenceLaptimeEntry[] {
  const entryList: ReferenceLaptimeEntry[] = Array.isArray(entries) ? entries : Object.values(entries || {});
  if (entryList.length === 0) return [];

  const targetSpec = getCircuitSpecification(trackVenue, course, null, null, null, trackLengthMeters);

  // 1. Exact match on resolved benchmark circuit and layout
  let matches = entryList.filter(e => {
    const eSpec = getCircuitSpecification(e.trackName);
    if (targetSpec.layoutKey !== 'unknown' && eSpec.layoutKey !== 'unknown') {
      return eSpec.layoutKey === targetSpec.layoutKey;
    }
    return false;
  });

  // 2. Direct string equality match on cleaned name
  if (matches.length === 0 && targetSpec.benchmarkName) {
    const cleanTarget = targetSpec.benchmarkName.toLowerCase().replace(/[^a-z0-9]/g, '');
    matches = entryList.filter(e => {
      const cleanE = (e.trackName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanE === cleanTarget;
    });
  }

  // 3. Fallback for custom / mod tracks
  if (matches.length === 0 && targetSpec.layoutKey === 'unknown') {
    const cleanVenue = trackVenue.toLowerCase().replace(/[^a-z0-9]/g, '');
    matches = entryList.filter(e => {
      const cleanE = (e.trackName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanE.includes(cleanVenue) || cleanVenue.includes(cleanE);
    });
  }

  return matches;
}

/**
 * Finds the single best matching benchmark entry for a track and car class/type.
 */
export function findReferenceEntry(
  entries: Record<string, ReferenceLaptimeEntry> | ReferenceLaptimeEntry[],
  venue: string = '',
  course: string = '',
  carClass: string = '',
  carType: string = '',
  trackLengthMeters?: number | null
): ReferenceLaptimeEntry | null {
  const trackMatches = findMatchingTrackBenchmarkEntries(entries, venue, course, trackLengthMeters);
  if (trackMatches.length === 0) return null;

  const targetClass = carClass || carType || '';
  if (targetClass && targetClass !== 'All') {
    const classMatch = trackMatches.find(e =>
      matchesCarClass(e.carClass, e.carClass, targetClass) ||
      matchesCarClass(targetClass, carType, e.carClass)
    );
    if (classMatch) return classMatch;
  }

  return trackMatches[0];
}
