import React from 'react';
import { Check } from 'lucide-react';
import type { LeaderboardEntry, RivalTarget } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { formatDrivenAgo } from '../leaderboard/leaderboardFormat.js';

export interface RivalLadderProps {
  beaten: RivalTarget[];
  /** The drivers after the rival, nearest first. */
  nextUp: LeaderboardEntry[];
  onPin: (driverName: string) => void;
}

/** The next rivals as chips (one click makes one your rival), and the rivals beaten on demand. */
export const RivalLadder: React.FC<RivalLadderProps> = ({ beaten, nextUp, onPin }) => {
  if (nextUp.length === 0 && beaten.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {nextUp.length > 0 && <span className="text-[10px] uppercase tracking-wider text-lmu-muted mr-0.5">Next up</span>}
      {nextUp.map((e) => (
        <button
          key={e.driverName}
          type="button"
          onClick={() => onPin(e.driverName)}
          aria-label={`Make ${e.driverName} your rival`}
          title={`Make ${e.driverName} your rival`}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-lmu-border bg-lmu-bg/60 text-slate-300 hover:text-white hover:border-amber-400/40 cursor-pointer transition-colors"
        >
          <span className="font-mono text-lmu-muted">P{e.rank}</span>
          {e.driverName}
          <span className="font-mono text-lmu-muted">{formatTime(e.bestLap.lapTime)}</span>
        </button>
      ))}
      {beaten.length > 0 && (
        <details className="relative ml-1">
          <summary
            className="list-none cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-emerald-500/30 text-emerald-400"
            aria-label={`${beaten.length} rivals beaten`}
          >
            <Check className="w-3 h-3" /> Beaten {beaten.length}
          </summary>
          <ul className="absolute z-10 mt-1 min-w-56 max-h-40 overflow-y-auto p-2 space-y-1 rounded-xl border border-lmu-border bg-lmu-card shadow-xl">
            {beaten.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{t.driverName ?? `Ghost ${formatTime(t.targetTime)}`}</span>
                <span className="text-lmu-muted shrink-0">
                  <span className="font-mono text-emerald-400 mr-1">{formatTime(t.beatenTime)}</span>
                  {t.endedAt ? formatDrivenAgo(t.endedAt) : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};
