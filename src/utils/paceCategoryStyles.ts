import { PaceCategory } from '../../shared/types/index.js';

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
