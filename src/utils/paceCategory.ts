import { PaceCategory } from '../../server/types';

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

  if (target === 'lmh' || target === 'hypercar' || target === 'hyper' || target === 'lmdh') {
    return combined.includes('hyper') || combined.includes('lmh') || combined.includes('lmdh');
  }

  if (target === 'lmgt3' || target === 'gt3') {
    return combined.includes('gt3') || combined.includes('lmgt3');
  }

  if (target === 'lmp2elms' || target === 'lmp2 (elms)' || target === 'lmp2_elms' || target === 'elms') {
    return combined.includes('elms') || combined.includes('lmp2_elms');
  }

  if (target === 'lmp2wec' || target === 'lmp2 (wec)' || target === 'lmp2' || target === 'wec') {
    return combined.includes('lmp2') && !combined.includes('elms');
  }

  if (target === 'lmp3') {
    return combined.includes('lmp3');
  }

  if (target === 'gte') {
    return combined.includes('gte');
  }

  return combined.includes(target);
}

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
