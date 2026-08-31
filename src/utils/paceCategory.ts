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

import { getDisplayTrackName } from './formatters.js';

export interface TrackLayoutDef {
  layoutId: string;
  match: RegExp;
  benchmarkName: string;
}

export interface CircuitDef {
  circuitId: string;
  match: RegExp;
  defaultLayout: string;
  defaultBenchmarkName: string;
  layouts: TrackLayoutDef[];
}

export const CIRCUIT_DEFINITIONS: CircuitDef[] = [
  {
    circuitId: 'sebring',
    match: /sebring/i,
    defaultLayout: 'full',
    defaultBenchmarkName: 'Sebring',
    layouts: [
      { layoutId: 'school', match: /\b(school|club|short)\b/i, benchmarkName: 'Sebring (school)' },
      { layoutId: 'full', match: /\b(12h|12\s*hours?|full|grand\s*prix|\bgp\b)\b/i, benchmarkName: 'Sebring' },
    ],
  },
  {
    circuitId: 'bahrain',
    match: /bahrain/i,
    defaultLayout: 'wec',
    defaultBenchmarkName: 'Bahrain (wec)',
    layouts: [
      { layoutId: 'endurance', match: /\bendurance\b/i, benchmarkName: 'Bahrain (endurance)' },
      { layoutId: 'outer', match: /\bouter\b/i, benchmarkName: 'Bahrain (outer)' },
      { layoutId: 'paddock', match: /\b(paddock|oasis)\b/i, benchmarkName: 'Bahrain (paddock)' },
      { layoutId: 'wec', match: /\b(wec|grand\s*prix|\bgp\b|full)\b/i, benchmarkName: 'Bahrain (wec)' },
    ],
  },
  {
    circuitId: 'paul_ricard',
    match: /paul\s*ricard|ricard/i,
    defaultLayout: '1a_v2',
    defaultBenchmarkName: 'Paul Ricard (1A v2)',
    layouts: [
      { layoutId: '1a_v2_short', match: /\b(short|v2\s*short|1a\s*v2\s*short)\b/i, benchmarkName: 'Paul Ricard (1A v2 short)' },
      { layoutId: '1a_v2', match: /\b(1a\s*v2|v2)(?!.*short)\b/i, benchmarkName: 'Paul Ricard (1A v2)' },
      { layoutId: '1a', match: /\b1a\b(?!.*v2)/i, benchmarkName: 'Paul Ricard (1A)' },
      { layoutId: '3a', match: /\b3a\b/i, benchmarkName: 'Paul Ricard (3A)' },
    ],
  },
  {
    circuitId: 'silverstone',
    match: /silverstone/i,
    defaultLayout: 'gp',
    defaultBenchmarkName: 'Silverstone (GP)',
    layouts: [
      { layoutId: 'national', match: /\b(?<!inter)national\b/i, benchmarkName: 'Silverstone (National)' },
      { layoutId: 'international', match: /\binternational\b/i, benchmarkName: 'Silverstone (International)' },
      { layoutId: 'gp', match: /\b(grand\s*prix|\bgp\b|historic|full)\b/i, benchmarkName: 'Silverstone (GP)' },
    ],
  },
  {
    circuitId: 'sarthe',
    match: /sarthe|mans/i,
    defaultLayout: 'full',
    defaultBenchmarkName: 'Circuit de la Sarthe',
    layouts: [
      { layoutId: 'straight', match: /\b(straight|chicaneless|sans\s*chicanes?|mulsanne)\b/i, benchmarkName: 'Circuit de la Sarthe (straight)' },
      { layoutId: 'full', match: /\b(24\s*heures?|24h|full)\b/i, benchmarkName: 'Circuit de la Sarthe' },
    ],
  },
  {
    circuitId: 'monza',
    match: /monza/i,
    defaultLayout: 'gp',
    defaultBenchmarkName: 'Monza',
    layouts: [
      { layoutId: 'curvagrande', match: /\b(curva\s*grande|curvagrande|junior)\b/i, benchmarkName: 'Monza (curvagrande)' },
      { layoutId: 'gp', match: /\b(grand\s*prix|\bgp\b|full)\b/i, benchmarkName: 'Monza' },
    ],
  },
  {
    circuitId: 'cota',
    match: /cota|americas|austin/i,
    defaultLayout: 'gp',
    defaultBenchmarkName: 'COTA',
    layouts: [
      { layoutId: 'national', match: /\b(national|short)\b/i, benchmarkName: 'COTA (national)' },
      { layoutId: 'gp', match: /\b(grand\s*prix|\bgp\b|full)\b/i, benchmarkName: 'COTA' },
    ],
  },
  {
    circuitId: 'fuji',
    match: /fuji/i,
    defaultLayout: 'chicane',
    defaultBenchmarkName: 'Fuji (chicane)',
    layouts: [
      { layoutId: 'classic', match: /\b(classic|old)\b/i, benchmarkName: 'Fuji (classic)' },
      { layoutId: 'chicane', match: /\b(chicane|grand\s*prix|\bgp\b|full)\b/i, benchmarkName: 'Fuji (chicane)' },
    ],
  },
  {
    circuitId: 'qatar',
    match: /qatar|lusail|losail/i,
    defaultLayout: 'gp',
    defaultBenchmarkName: 'Qatar',
    layouts: [
      { layoutId: 'short', match: /\b(short|club|national)\b/i, benchmarkName: 'Qatar (short)' },
      { layoutId: 'gp', match: /\b(grand\s*prix|\bgp\b|full)\b/i, benchmarkName: 'Qatar' },
    ],
  },
  {
    circuitId: 'spa',
    match: /spa|francorchamps/i,
    defaultLayout: 'gp',
    defaultBenchmarkName: 'Spa',
    layouts: [
      { layoutId: 'gp', match: /.*/i, benchmarkName: 'Spa' },
    ],
  },
  {
    circuitId: 'barcelona',
    match: /barcelona|catalunya/i,
    defaultLayout: 'gp',
    defaultBenchmarkName: 'Barcelona',
    layouts: [
      { layoutId: 'gp', match: /.*/i, benchmarkName: 'Barcelona' },
    ],
  },
  {
    circuitId: 'daytona',
    match: /daytona/i,
    defaultLayout: 'road',
    defaultBenchmarkName: 'Daytona',
    layouts: [
      { layoutId: 'road', match: /.*/i, benchmarkName: 'Daytona' },
    ],
  },
  {
    circuitId: 'imola',
    match: /imola|ferrari/i,
    defaultLayout: 'gp',
    defaultBenchmarkName: 'Imola',
    layouts: [
      { layoutId: 'gp', match: /.*/i, benchmarkName: 'Imola' },
    ],
  },
  {
    circuitId: 'interlagos',
    match: /interlagos|pace|sao\s*paulo|são\s*paulo/i,
    defaultLayout: 'gp',
    defaultBenchmarkName: 'Interlagos',
    layouts: [
      { layoutId: 'gp', match: /.*/i, benchmarkName: 'Interlagos' },
    ],
  },
  {
    circuitId: 'laguna_seca',
    match: /laguna|seca/i,
    defaultLayout: 'gp',
    defaultBenchmarkName: 'Laguna Seca',
    layouts: [
      { layoutId: 'gp', match: /.*/i, benchmarkName: 'Laguna Seca' },
    ],
  },
  {
    circuitId: 'portimao',
    match: /portimao|portimão|algarve/i,
    defaultLayout: 'gp',
    defaultBenchmarkName: 'Portimao',
    layouts: [
      { layoutId: 'gp', match: /.*/i, benchmarkName: 'Portimao' },
    ],
  },
];

export interface ResolvedTrackInfo {
  circuit: string;
  layout: string;
  benchmarkName: string;
  isKnown: boolean;
}

export function getTrackAndLayout(venue: string = '', course: string = ''): ResolvedTrackInfo {
  const combined = `${venue} ${course}`.trim();
  const vLower = venue.toLowerCase();
  const cLower = course.toLowerCase().trim();
  const combLower = combined.toLowerCase();

  for (const circuit of CIRCUIT_DEFINITIONS) {
    if (circuit.match.test(combLower)) {
      // 1. Check if course or combined specifies an explicit non-default layout
      for (const layout of circuit.layouts) {
        if (cLower && layout.match.test(cLower)) {
          return {
            circuit: circuit.circuitId,
            layout: layout.layoutId,
            benchmarkName: layout.benchmarkName,
            isKnown: true,
          };
        }
      }

      for (const layout of circuit.layouts) {
        // If layout matches inside combined text e.g. "Sebring (school)"
        if (layout.match.test(combLower)) {
          return {
            circuit: circuit.circuitId,
            layout: layout.layoutId,
            benchmarkName: layout.benchmarkName,
            isKnown: true,
          };
        }
      }

      // 2. Default layout for this circuit
      return {
        circuit: circuit.circuitId,
        layout: circuit.defaultLayout,
        benchmarkName: circuit.defaultBenchmarkName,
        isKnown: true,
      };
    }
  }

  return {
    circuit: vLower.replace(/[^a-z0-9]/g, '') || 'unknown',
    layout: cLower.replace(/[^a-z0-9]/g, '') || 'default',
    benchmarkName: venue.trim(),
    isKnown: false,
  };
}

export function normalizeTrackName(venue: string = '', course: string = ''): string {
  const resolved = getTrackAndLayout(venue, course);
  return resolved.benchmarkName;
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

  const qInfo = getTrackAndLayout(queryTrack, '');
  const sInfo = getTrackAndLayout(venue, course);

  // If both are known standard circuits:
  if (qInfo.isKnown && sInfo.isKnown) {
    if (qInfo.circuit !== sInfo.circuit) return false;
    return qInfo.layout === sInfo.layout;
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
  course: string = ''
): ReferenceLaptimeEntry[] {
  const entryList: ReferenceLaptimeEntry[] = Array.isArray(entries) ? entries : Object.values(entries || {});
  if (entryList.length === 0) return [];

  const targetInfo = getTrackAndLayout(trackVenue, course);

  // 1. Exact match on resolved benchmark circuit and layout
  let matches = entryList.filter(e => {
    const eInfo = getTrackAndLayout(e.trackName, '');
    return eInfo.circuit === targetInfo.circuit && eInfo.layout === targetInfo.layout;
  });

  // 2. Direct string equality match on cleaned name
  if (matches.length === 0) {
    const cleanTarget = targetInfo.benchmarkName.toLowerCase().replace(/[^a-z0-9]/g, '');
    matches = entryList.filter(e => {
      const cleanE = (e.trackName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanE === cleanTarget;
    });
  }

  // 3. Fallback for custom / mod tracks
  if (matches.length === 0 && !targetInfo.isKnown) {
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
