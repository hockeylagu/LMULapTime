import React from 'react';
import { PaceCategory } from '../../../shared/types/index.js';
import { formatPacePercentage } from '../../../shared/domain/paceCategory.js';
import { getPaceCategoryStyle } from '../../utils/paceCategoryStyles.js';

export interface PaceBadgeProps {
  category?: PaceCategory | null;
  percentage?: number | null;
  showPercentage?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

/**
 * The benchmark pace of a lap, flat and the same everywhere: the band's color as a dot, its name in that
 * color, the percentage as a muted readout. No box, so it reads the same in tables, cards and headers.
 */
export const PaceBadge: React.FC<PaceBadgeProps> = ({
  category,
  percentage,
  showPercentage = false,
  size = 'sm',
  className = '',
}) => {
  if (!category) return null;

  const style = getPaceCategoryStyle(category);

  const sizeClasses = {
    xs: 'text-[11px] gap-1.5',
    sm: 'text-xs gap-1.5',
    md: 'text-sm gap-2',
  }[size];

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
