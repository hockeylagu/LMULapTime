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
    badgeClass: 'bg-lmu-purple-deep/60 text-lmu-purple-soft border-lmu-purple-strong/40 shadow-lmu-purple-deep/20',
    textClass: 'text-lmu-purple',
    bgClass: 'bg-lmu-purple-strong/10',
    borderClass: 'border-lmu-purple-strong/30',
  },
  Competitive: {
    category: 'Competitive',
    label: 'Competitive',
    emoji: '🏆',
    badgeClass: 'bg-lmu-warn-deep/60 text-lmu-warn-soft border-lmu-warn-strong/40 shadow-lmu-warn-deep/20',
    textClass: 'text-lmu-warn',
    bgClass: 'bg-lmu-warn-strong/10',
    borderClass: 'border-lmu-warn-strong/30',
  },
  Good: {
    category: 'Good',
    label: 'Good',
    emoji: '⭐',
    badgeClass: 'bg-lmu-gain-deep/60 text-lmu-gain-soft border-lmu-gain-strong/40 shadow-lmu-gain-deep/20',
    textClass: 'text-lmu-gain',
    bgClass: 'bg-lmu-gain-strong/10',
    borderClass: 'border-lmu-gain-strong/30',
  },
  Midpack: {
    category: 'Midpack',
    label: 'Midpack',
    emoji: '🏎️',
    badgeClass: 'bg-lmu-info-deep/60 text-lmu-info-soft border-lmu-info-strong/40 shadow-lmu-info-deep/20',
    textClass: 'text-lmu-info',
    bgClass: 'bg-lmu-info-strong/10',
    borderClass: 'border-lmu-info-strong/30',
  },
  'Tail-ender': {
    category: 'Tail-ender',
    label: 'Tail-ender',
    emoji: '🐢',
    badgeClass: 'bg-lmu-orange-deep/60 text-lmu-orange-soft border-lmu-orange-strong/40 shadow-lmu-orange-deep/20',
    textClass: 'text-lmu-orange',
    bgClass: 'bg-lmu-orange-strong/10',
    borderClass: 'border-lmu-orange-strong/30',
  },
  Offline: {
    category: 'Offline',
    label: 'Offline',
    emoji: '💤',
    badgeClass: 'bg-lmu-raised/60 text-lmu-muted border-lmu-rule/40',
    textClass: 'text-lmu-muted',
    bgClass: 'bg-lmu-raised/20',
    borderClass: 'border-lmu-rule/30',
  },
};

export function getPaceCategoryStyle(category?: PaceCategory | null): PaceCategoryStyle {
  if (!category || !PACE_CATEGORY_STYLES[category]) {
    return PACE_CATEGORY_STYLES.Offline;
  }
  return PACE_CATEGORY_STYLES[category];
}
