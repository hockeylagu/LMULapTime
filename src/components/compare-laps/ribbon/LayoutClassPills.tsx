import React from 'react';
import type { LeaderboardLayout } from '../../../../shared/types/leaderboard.js';
import { carClassLabel } from '../leaderboard/leaderboardFormat.js';

export interface LayoutClassPillsProps {
  layout: LeaderboardLayout;
  selectedCarClass: string;
  onSelect: (carClass: string) => void;
}

/** The classes the player drove on the selected layout, most recent first, with the rank in each. */
export const LayoutClassPills: React.FC<LayoutClassPillsProps> = ({ layout, selectedCarClass, onSelect }) => (
  <div role="group" aria-label="Car class" className="flex flex-wrap items-center gap-2">
    {layout.classes.map((c) => {
      const selected = c.carClass === selectedCarClass;
      return (
        <button
          key={c.carClass}
          type="button"
          aria-pressed={selected}
          onClick={() => onSelect(c.carClass)}
          className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            selected
              ? 'bg-lmu-accent text-white border-lmu-accent'
              : 'bg-lmu-bg border-lmu-border text-lmu-muted hover:text-white hover:border-lmu-accent/50'
          }`}
        >
          <span>{carClassLabel(c.carClass)}</span>
          {c.playerRank !== null && (
            <span className={`font-mono ${selected ? 'text-white/90' : 'text-slate-400'}`}>
              P{c.playerRank}/{c.fieldSize}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
