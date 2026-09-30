import { PaceCategory } from '../../shared/types/index.js';

export interface PaceCategoryStyle {
  category: PaceCategory;
  label: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}

export const PACE_CATEGORY_STYLES: Record<PaceCategory, PaceCategoryStyle> = {
  Alien: {
    category: 'Alien',
    label: 'Alien',
    textClass: 'text-lmu-purple',
    bgClass: 'bg-lmu-purple-strong/10',
    borderClass: 'border-lmu-purple-strong/30',
  },
  Competitive: {
    category: 'Competitive',
    label: 'Competitive',
    textClass: 'text-lmu-warn',
    bgClass: 'bg-lmu-warn-strong/10',
    borderClass: 'border-lmu-warn-strong/30',
  },
  Good: {
    category: 'Good',
    label: 'Good',
    textClass: 'text-lmu-gain',
    bgClass: 'bg-lmu-gain-strong/10',
    borderClass: 'border-lmu-gain-strong/30',
  },
  Midpack: {
    category: 'Midpack',
    label: 'Midpack',
    textClass: 'text-lmu-info',
    bgClass: 'bg-lmu-info-strong/10',
    borderClass: 'border-lmu-info-strong/30',
  },
  'Tail-ender': {
    category: 'Tail-ender',
    label: 'Tail-ender',
    textClass: 'text-lmu-orange',
    bgClass: 'bg-lmu-orange-strong/10',
    borderClass: 'border-lmu-orange-strong/30',
  },
  Offline: {
    category: 'Offline',
    label: 'Offline',
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
