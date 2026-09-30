import React from 'react';
import { Check } from 'lucide-react';
import type { LeaderboardEntry, RivalTarget } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { formatDrivenAgo } from '../board/leaderboardFormat.js';

export interface RivalLadderProps {
  beaten: RivalTarget[];
  /** The drivers after the rival, nearest first. */
  nextUp: LeaderboardEntry[];
  onPin: (driverName: string) => void;
  /** A change is on its way: the chips wait for it. */
  pending?: boolean;
}

/** The next rivals as chips (one click makes one your rival), and the rivals beaten on demand. */
export const RivalLadder: React.FC<RivalLadderProps> = ({ beaten, nextUp, onPin, pending = false }) => {
  if (nextUp.length === 0 && beaten.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {nextUp.length > 0 && <span className="text-[10px] uppercase tracking-wider text-lmu-muted mr-0.5">Next up</span>}
      {nextUp.map((e) => (
        <button
          key={e.driverName}
          type="button"
          onClick={() => onPin(e.driverName)}
          disabled={pending}
          aria-label={`Make ${e.driverName} your rival`}
          title={`Make ${e.driverName} your rival`}
          className="inline-flex items-center gap-1.5 max-w-64 px-2 py-0.5 rounded-lg border border-lmu-border bg-lmu-bg/60 text-lmu-text-soft enabled:hover:text-white enabled:hover:border-lmu-warn/40 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent"
        >
          <span className="font-mono text-lmu-muted shrink-0">P{e.rank}</span>
          <span className="truncate">{e.driverName}</span>
          <span className="font-mono text-lmu-muted shrink-0">{formatTime(e.bestLap.lapTime)}</span>
        </button>
      ))}
      {beaten.length > 0 && (
        <details className="relative ml-1">
          <summary
            className="list-none cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-lmu-gain-strong/30 text-lmu-gain"
            aria-label={`${beaten.length} rivals beaten`}
          >
            <Check className="w-3 h-3" /> Beaten {beaten.length}
          </summary>
          <ul className="absolute z-10 mt-1 min-w-56 max-h-40 overflow-y-auto p-2 space-y-1 rounded-xl border border-lmu-border bg-lmu-card shadow-xl">
            {beaten.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <span className="truncate" title={t.driverName ?? undefined}>{t.driverName ?? `Ghost ${formatTime(t.targetTime)}`}</span>
                <span className="text-lmu-muted shrink-0">
                  <span className="font-mono text-lmu-gain mr-1">{formatTime(t.beatenTime)}</span>
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
