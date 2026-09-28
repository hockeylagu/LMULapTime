import React from 'react';
import { MapPin } from 'lucide-react';
import type { LeaderboardLayout } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { CarClassBadge } from '../../common/CarClassBadge.js';
import { carClassLabel, formatDrivenAgo } from '../leaderboard/leaderboardFormat.js';

export interface TrackRibbonCardProps {
  layout: LeaderboardLayout;
  selected: boolean;
  onSelect: (layout: LeaderboardLayout) => void;
}

/** One layout of the ribbon: its outline, when it was driven last, and where the player stands. */
export const TrackRibbonCard: React.FC<TrackRibbonCardProps> = ({ layout, selected, onSelect }) => {
  const latest = layout.classes.find((c) => c.carClass === layout.lastCarClass) ?? layout.classes[0];
  return (
    <button
      type="button"
      onClick={() => onSelect(layout)}
      aria-pressed={selected}
      title={`${layout.trackName} — ${layout.layoutName}`}
      className={`snap-start shrink-0 w-56 rounded-xl border p-3 text-left transition-all cursor-pointer ${
        selected
          ? 'border-lmu-accent/70 bg-lmu-accent/10 shadow-[0_0_0_1px_rgba(230,57,70,0.35)]'
          : 'border-lmu-border bg-lmu-bg/60 hover:border-lmu-accent/40 hover:bg-lmu-card'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        {layout.outlinePath ? (
          <svg viewBox="0 0 100 100" className="w-14 h-14 shrink-0" aria-hidden="true">
            <path
              d={layout.outlinePath}
              fill="none"
              strokeWidth={4}
              strokeLinejoin="round"
              className={selected ? 'stroke-lmu-accent' : 'stroke-slate-400'}
            />
          </svg>
        ) : (
          <div className="w-14 h-14 shrink-0 rounded-lg bg-lmu-card border border-lmu-border flex items-center justify-center text-2xl" aria-hidden="true">
            {layout.flagEmoji || <MapPin className="w-5 h-5 text-lmu-muted" />}
          </div>
        )}
        <div className="text-right min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-lmu-muted">{formatDrivenAgo(layout.lastDriven)}</div>
          {latest?.playerRank ? (
            <div className="text-lg font-extrabold font-mono text-white leading-tight">
              P{latest.playerRank}
              <span className="text-xs font-bold text-lmu-muted">/{latest.fieldSize}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-2 text-xs font-bold text-white truncate">
        {layout.outlinePath && layout.flagEmoji ? `${layout.flagEmoji} ` : ''}
        {layout.trackName}
      </div>
      <div className="text-[11px] text-lmu-muted truncate">{layout.layoutName}</div>
      {latest && (
        <div className="mt-1.5 flex items-center justify-between text-[11px]">
          <CarClassBadge carClass={latest.carClass} size="xs" title={carClassLabel(latest.carClass)} />
          <span className="font-mono text-white">{formatTime(latest.playerBest)}</span>
        </div>
      )}
    </button>
  );
};
