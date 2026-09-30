import React from 'react';
import { ArrowDown } from 'lucide-react';
import type { Leaderboard } from '../../../../shared/types/leaderboard.js';
import { boardLapId } from './leaderboardLaps.js';

interface CompareBarProps {
  board: Leaderboard;
  comparedLapIds: readonly string[];
  onGoToCompare?: () => void;
}

/** Stays at the bottom of the board while other drivers' laps are in the comparison below it. */
export const CompareBar: React.FC<CompareBarProps> = ({ board, comparedLapIds, onGoToCompare }) => {
  if (!onGoToCompare) return null;
  const count = board.entries.filter((e) => !e.isPlayer && comparedLapIds.includes(boardLapId(e))).length;
  if (count === 0) return null;
  return (
    <div className="sticky bottom-4 z-10 flex justify-center pointer-events-none">
      <div
        role="status"
        className="pointer-events-auto inline-flex items-center gap-3 rounded-xl border border-lmu-border bg-lmu-raised/95 px-4 py-2 text-xs text-lmu-text-soft shadow-lg shadow-black/40"
      >
        <span>
          <span className="font-mono font-bold text-white">{count}</span> {count === 1 ? 'lap' : 'laps'} from the board in the comparison
        </span>
        <button
          type="button"
          onClick={onGoToCompare}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-lmu-accent-text hover:bg-lmu-border cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent"
        >
          Go to compare
          <ArrowDown className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
