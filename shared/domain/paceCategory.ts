import { PaceCategory, ReferenceLaptimeEntry } from '../types/index.js';
import { getDisplayTrackName } from './formatters.js';
import { getCircuitSpecification } from './circuitSpecs.js';

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
  return matchingTrackEntries(entryList, trackVenue, course, trackLengthMeters);
}

function matchingTrackEntries(
  entryList: ReferenceLaptimeEntry[], trackVenue: string, course: string, trackLengthMeters?: number | null,
  layouts?: ReadonlyMap<string, string>
): ReferenceLaptimeEntry[] {
  if (entryList.length === 0) return [];

  const targetSpec = getCircuitSpecification(trackVenue, course, null, null, null, trackLengthMeters);

  // 1. Exact match on resolved benchmark circuit and layout
  let matches = entryList.filter(e => {
    const layoutKey = layouts?.get(e.trackName) ?? getCircuitSpecification(e.trackName).layoutKey;
    if (targetSpec.layoutKey !== 'unknown' && layoutKey !== 'unknown') {
      return layoutKey === targetSpec.layoutKey;
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
 * Finds the single best matching benchmark entry for a track and canonical car class.
 */
export function findReferenceEntry(
  entries: Record<string, ReferenceLaptimeEntry> | ReferenceLaptimeEntry[],
  venue: string = '',
  course: string = '',
  carClass: string = '',
  trackLengthMeters?: number | null
): ReferenceLaptimeEntry | null {
  const trackMatches = findMatchingTrackBenchmarkEntries(entries, venue, course, trackLengthMeters);
  return trackMatches.find(entry => entry.carClass === carClass) ?? null;
}

/** One batch's benchmark snapshot: resolve each benchmark layout once, preserving track matching order. */
export function createBenchmarkLookup(entries: Record<string, ReferenceLaptimeEntry> | ReferenceLaptimeEntry[]) {
  const entryList = Array.isArray(entries) ? entries : Object.values(entries);
  const layouts = new Map<string, string>();
  for (const entry of entryList) {
    if (!layouts.has(entry.trackName)) layouts.set(entry.trackName, getCircuitSpecification(entry.trackName).layoutKey);
  }
  const findTrackEntries = (venue: string, course = '', trackLengthMeters?: number | null) =>
    matchingTrackEntries(entryList, venue, course, trackLengthMeters, layouts);
  return {
    findTrackEntries,
    findReferenceEntry: (venue: string, course = '', carClass = '', trackLengthMeters?: number | null) =>
      findTrackEntries(venue, course, trackLengthMeters).find(entry => entry.carClass === carClass) ?? null,
  };
}
