import React from 'react';

export interface RankBadgeProps {
  rank: number; // 1-indexed (e.g. 1, 2, 3...)
  firstPlaceColor?: string;
  color?: string | ((rank: number) => string);
  className?: string;
}

export const RankBadge: React.FC<RankBadgeProps> = ({
  rank,
  firstPlaceColor = 'text-lmu-gold',
  color,
  className = '',
}) => {
  let colorClass: string;

  if (typeof color === 'function') {
    colorClass = color(rank);
  } else if (typeof color === 'string') {
    colorClass = color;
  } else {
    colorClass =
      rank === 1
        ? firstPlaceColor
        : rank === 2
        ? 'text-slate-300'
        : rank === 3
        ? 'text-amber-600'
        : 'text-lmu-muted';
  }

  return (
    <span className={`font-mono text-[11px] font-bold shrink-0 ${colorClass} ${className}`}>
      #{rank}
    </span>
  );
};
