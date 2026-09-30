import React from 'react';
import type { LeaderboardLayout } from '../../../../shared/types/leaderboard.js';
import { getCarClassBadgeConfig } from '../../common/CarClassBadge.js';
import { carClassLabel } from '../board/leaderboardFormat.js';

export interface LayoutClassPillsProps {
  layout: LeaderboardLayout;
  selectedCarClass: string;
  onSelect: (carClass: string) => void;
}

/**
 * The classes the player drove on the selected layout, most recent first, with the rank in each.
 * Each pill wears its class badge colours, as the class filters elsewhere do.
 */
export const LayoutClassPills: React.FC<LayoutClassPillsProps> = ({ layout, selectedCarClass, onSelect }) => (
  <div role="group" aria-label="Car class" className="flex flex-wrap items-center gap-2">
    {layout.classes.map((c) => {
      const selected = c.carClass === selectedCarClass;
      const badge = getCarClassBadgeConfig(c.carClass);
      return (
        <button
          key={c.carClass}
          type="button"
          aria-pressed={selected}
          onClick={() => onSelect(c.carClass)}
          title={badge?.title}
          className={`h-7 px-3 rounded-[5px] border font-mono text-xs font-bold uppercase tracking-wider transition-[filter] cursor-pointer inline-flex items-center gap-2 ${
            badge ? `${badge.borderClass} ${badge.textClass} ${badge.bgClass}` : 'border-lmu-border text-lmu-muted'
          } ${selected ? 'brightness-110' : 'grayscale hover:grayscale-0'}`}
        >
          <span>{carClassLabel(c.carClass)}</span>
          {c.playerRank !== null && (
            <span className="text-lmu-text-soft font-semibold normal-case">
              P{c.playerRank}/{c.fieldSize}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
