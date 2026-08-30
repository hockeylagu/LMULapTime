import { PaceCategory, ReferenceLaptimeEntry } from '../../server/types';

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

export function normalizeCarClassGroup(carClass?: string, carType?: string): string {
  const combined = `${carClass || ''} ${carType || ''}`.toLowerCase();

  if (combined.includes('hyper') || combined.includes('lmh') || combined.includes('lmdh')) return 'LMH';
  if (combined.includes('gt3') || combined.includes('lmgt3')) return 'LMGT3';
  if (combined.includes('lmp3')) return 'LMP3';
  if (combined.includes('lmp2')) return 'LMP2';
  if (combined.includes('gte')) return 'GTE';

  return (carClass || carType || 'General').toUpperCase();
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

interface TrackRule {
  match: RegExp;
  layouts?: { match: RegExp; name: string }[];
  default: string;
}

const TRACK_RULES: TrackRule[] = [
  {
    match: /paul ricard|ricard/,
    layouts: [
      { match: /short|v2 short|1a v2 short/, name: 'Paul Ricard (1A v2 short)' },
      { match: /1a v2/, name: 'Paul Ricard (1A v2)' },
      { match: /1a/, name: 'Paul Ricard (1A)' },
      { match: /3a/, name: 'Paul Ricard (3A)' },
    ],
    default: 'Paul Ricard (1A v2)',
  },
  { match: /\bspa\b/, default: 'Spa' },
  {
    match: /monza/,
    layouts: [{ match: /curva|grande/, name: 'Monza (curvagrande)' }],
    default: 'Monza',
  },
  { match: /barcelona|catalunya/, default: 'Barcelona' },
  {
    match: /sarthe|mans/,
    layouts: [{ match: /straight|chicaneless/, name: 'Circuit de la Sarthe (straight)' }],
    default: 'Circuit de la Sarthe',
  },
  {
    match: /cota|americas/,
    layouts: [{ match: /national/, name: 'COTA (national)' }],
    default: 'COTA',
  },
  { match: /daytona/, default: 'Daytona' },
  {
    match: /fuji/,
    layouts: [{ match: /classic/, name: 'Fuji (classic)' }],
    default: 'Fuji (chicane)',
  },
  { match: /imola|ferrari/, default: 'Imola' },
  { match: /interlagos|pace/, default: 'Interlagos' },
  { match: /laguna|seca/, default: 'Laguna Seca' },
  { match: /portimao|algarve/, default: 'Portimao' },
  {
    match: /qatar|lusail/,
    layouts: [{ match: /short/, name: 'Qatar (short)' }],
    default: 'Qatar',
  },
  {
    match: /sebring/,
    layouts: [{ match: /school/, name: 'Sebring (school)' }],
    default: 'Sebring',
  },
  {
    match: /silverstone/,
    layouts: [
      { match: /international/, name: 'Silverstone (International)' },
      { match: /national/, name: 'Silverstone (National)' },
    ],
    default: 'Silverstone (GP)',
  },
  {
    match: /bahrain/,
    layouts: [
      { match: /endurance/, name: 'Bahrain (endurance)' },
      { match: /outer/, name: 'Bahrain (outer)' },
      { match: /paddock/, name: 'Bahrain (paddock)' },
    ],
    default: 'Bahrain (wec)',
  },
];

export function normalizeTrackName(venue: string = '', course: string = ''): string {
  const combined = `${venue} ${course}`.toLowerCase().trim();

  for (const rule of TRACK_RULES) {
    if (rule.match.test(combined)) {
      if (rule.layouts) {
        for (const layout of rule.layouts) {
          if (layout.match.test(combined)) return layout.name;
        }
      }
      return rule.default;
    }
  }

  return venue;
}

/**
 * Finds all matching benchmark entries for a given track venue and optional course.
 */
export function findMatchingTrackBenchmarkEntries(
  entries: Record<string, ReferenceLaptimeEntry> | ReferenceLaptimeEntry[],
  trackVenue: string = '',
  course: string = ''
): ReferenceLaptimeEntry[] {
  const entryList: ReferenceLaptimeEntry[] = Array.isArray(entries) ? entries : Object.values(entries || {});
  if (entryList.length === 0) return [];

  const normTrack = normalizeTrackName(trackVenue, course);
  const normClean = normTrack.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Try exact normalized match first
  let matches = entryList.filter(e => {
    const eNorm = normalizeTrackName(e.trackName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const eRaw = (e.trackName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return eNorm === normClean || eRaw === normClean;
  });

  // 2. Fallback to substring matching
  if (matches.length === 0) {
    matches = entryList.filter(e => {
      const eNorm = normalizeTrackName(e.trackName).toLowerCase().replace(/[^a-z0-9]/g, '');
      const eRaw = (e.trackName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return eNorm.includes(normClean) || normClean.includes(eNorm) || eRaw.includes(normClean) || normClean.includes(eRaw);
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
  carType: string = ''
): ReferenceLaptimeEntry | null {
  const trackMatches = findMatchingTrackBenchmarkEntries(entries, venue, course);
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
