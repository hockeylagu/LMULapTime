import React from 'react';
import { CloudRain } from 'lucide-react';
import { PaceCategory } from '../../../shared/types/index.js';
import { formatPacePercentage } from '../../../shared/domain/paceCategory.js';
import { getPaceCategoryStyle } from '../../utils/paceCategoryStyles.js';

/** A lap's benchmark rating, or `wet` when it was run in the wet and has no dry rating. */
export interface PaceBadgeValue {
  category?: PaceCategory | null;
  percentage?: number | null;
  wet?: boolean;
}

export interface PaceBadgeProps extends PaceBadgeValue {
  showPercentage?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

/**
 * The benchmark pace of a lap, flat and the same everywhere: the band's color as a dot, its name in that
 * color, the percentage as a muted readout. No box, so it reads the same in tables, cards and headers.
 * A wet lap reads "Wet" in the rain hue instead: the benchmark targets are dry laps.
 */
export const PaceBadge: React.FC<PaceBadgeProps> = ({
  category,
  percentage,
  showPercentage = false,
  size = 'sm',
  className = '',
  wet = false,
}) => {
  const sizeClasses = {
    xs: 'text-[11px] gap-1.5',
    sm: 'text-xs gap-1.5',
    md: 'text-sm gap-2',
  }[size];

  if (wet) {
    return (
      <span
        className={`inline-flex shrink-0 items-center whitespace-nowrap leading-none font-bold text-lmu-azure ${sizeClasses} ${className}`}
        title="Run in the wet: not rated, the benchmark targets are dry laps"
      >
        <CloudRain className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span className="tracking-[0.02em]">Wet</span>
      </span>
    );
  }

  if (!category) return null;

  const style = getPaceCategoryStyle(category);

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap leading-none font-bold ${style.textClass} ${sizeClasses} ${className}`}
      title={`Benchmark Pace: ${style.label}${percentage != null ? ` (${formatPacePercentage(percentage)})` : ''}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
      <span className="tracking-[0.02em]">{style.label}</span>
      {showPercentage && percentage != null && (
        <span className="font-mono text-lmu-muted">{formatPacePercentage(percentage)}</span>
      )}
    </span>
  );
};
