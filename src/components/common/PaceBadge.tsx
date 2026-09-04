import React from 'react';
import { PaceCategory } from '../../../server/types';
import { getPaceCategoryStyle, formatPacePercentage } from '../../utils/paceCategory';

export interface PaceBadgeProps {
  category?: PaceCategory | null;
  percentage?: number | null;
  showPercentage?: boolean;
  showEmoji?: boolean;
  size?: 'xs' | 'sm' | 'md';
  rounded?: 'full' | 'default';
  className?: string;
}

export const PaceBadge: React.FC<PaceBadgeProps> = ({
  category,
  percentage,
  showPercentage = false,
  showEmoji = true,
  size = 'sm',
  rounded = 'default',
  className = '',
}) => {
  if (!category) return null;

  const style = getPaceCategoryStyle(category);

  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0.5 gap-1',
    sm: 'text-xs px-2 py-0.5 gap-1.5',
    md: 'text-sm px-2.5 py-1 gap-1.5',
  }[size];

  const roundClass = rounded === 'full' ? 'rounded-full' : 'rounded';

  return (
    <span
      className={`inline-flex items-center font-bold border shadow-sm ${roundClass} ${style.badgeClass} ${sizeClasses} ${className}`}
      title={`Benchmark Pace: ${style.label}${percentage != null ? ` (${formatPacePercentage(percentage)})` : ''}`}
    >
      {showEmoji && <span>{style.emoji}</span>}
      <span>{style.label}</span>
      {showPercentage && percentage != null && (
        <span className="opacity-80">({formatPacePercentage(percentage)})</span>
      )}
    </span>
  );
};
