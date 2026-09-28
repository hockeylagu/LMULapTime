import React from 'react';
import { Check, Crosshair } from 'lucide-react';
import type { LeaderboardEntry, RivalTarget } from '../../../../shared/types/leaderboard.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { formatDrivenAgo } from '../leaderboard/leaderboardFormat.js';

export interface RivalLadderProps {
  beaten: RivalTarget[];
  nextUp: LeaderboardEntry[];
  onPin: (driverName: string) => void;
}

/** The rungs climbed (rivals beaten) and the next ones up. */
export const RivalLadder: React.FC<RivalLadderProps> = ({ beaten, nextUp, onPin }) => (
  <div className="grid sm:grid-cols-2 gap-3 text-xs">
    <div>
      <div className="text-[10px] uppercase tracking-wider text-lmu-muted mb-1">Next up</div>
      {nextUp.length === 0 ? (
        <p className="text-lmu-muted">Nobody ahead of this one: you are chasing the top.</p>
      ) : (
        <ul className="space-y-1">
          {nextUp.map((e) => (
            <li key={e.driverName} className="flex items-center justify-between gap-2">
              <span className="truncate">
                <span className="font-mono text-lmu-muted mr-1">P{e.rank}</span>
                {e.driverName}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <span className="font-mono">{formatTime(e.bestLap.lapTime)}</span>
                <button
                  type="button"
                  onClick={() => onPin(e.driverName)}
                  aria-label={`Make ${e.driverName} your rival`}
                  title={`Make ${e.driverName} your rival`}
                  className="p-1 rounded-lg text-lmu-muted hover:text-white hover:bg-lmu-border cursor-pointer"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
    <div>
      <div className="text-[10px] uppercase tracking-wider text-lmu-muted mb-1">Beaten ({beaten.length})</div>
      {beaten.length === 0 ? (
        <p className="text-lmu-muted">Your first scalp is the one above.</p>
      ) : (
        <ul className="space-y-1 max-h-28 overflow-y-auto pr-1">
          {beaten.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2">
              <span className="truncate flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                {t.driverName ?? `Ghost ${formatTime(t.targetTime)}`}
              </span>
              <span className="text-lmu-muted shrink-0">
                <span className="font-mono text-emerald-400 mr-1">{formatTime(t.beatenTime)}</span>
                {t.endedAt ? formatDrivenAgo(t.endedAt) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);
