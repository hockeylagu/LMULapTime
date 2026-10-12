import { PaceCategory, ReferenceLaptimeEntry } from '../types/index.js';
import { CIRCUIT_SPECIFICATIONS } from './circuitDefinitions.js';
import { getCircuitSpecification } from './circuitSpecs.js';

/** Ordered upper bounds used by both JavaScript pace ratings and persisted queries. */
export const PACE_CATEGORY_BANDS = [
  { category: 'Alien', maxPercentage: 100.5 },
  { category: 'Competitive', maxPercentage: 101.5 },
  { category: 'Good', maxPercentage: 103.5 },
  { category: 'Midpack', maxPercentage: 105.5 },
  { category: 'Tail-ender', maxPercentage: 107.0 },
  { category: 'Offline', maxPercentage: Number.POSITIVE_INFINITY },
] as const satisfies readonly { category: PaceCategory; maxPercentage: number }[];

export function getPaceCategoryFromPercentage(percentage: number): PaceCategory {
  for (const band of PACE_CATEGORY_BANDS) {
    if (percentage <= band.maxPercentage) return band.category;
  }
  return PACE_CATEGORY_BANDS[PACE_CATEGORY_BANDS.length - 1].category;
}

export function formatPacePercentage(percentage?: number | null): string {
  if (percentage === undefined || percentage === null || isNaN(percentage)) return '--%';
  return `${percentage.toFixed(1)}%`;
}





/** A filter scope: known layouts compare keys; unknown layouts compare explicit venue/course pairs. */
export function matchesTrack(
  queryTrack: string = '',
  venue: string = '',
  course: string = '',
  queryCourse: string = ''
): boolean {
  if (!queryTrack || queryTrack === 'All' || queryTrack.trim() === '') return true;

  const qSpec = getCircuitSpecification(queryTrack, queryCourse);
  const sSpec = getCircuitSpecification(venue, course);

  const queryKnown = Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, qSpec.layoutKey);
  const sessionKnown = Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, sSpec.layoutKey);
  if (queryKnown && sessionKnown) {
    return qSpec.layoutKey === sSpec.layoutKey;
  }
  return !queryKnown && !sessionKnown && Boolean(queryTrack) && queryTrack === venue && queryCourse === course;
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

  if (!Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, targetSpec.layoutKey)) return [];
  return entryList.filter(entry => (layouts?.get(entry.trackName) ?? getCircuitSpecification(entry.trackName).layoutKey) === targetSpec.layoutKey);
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
