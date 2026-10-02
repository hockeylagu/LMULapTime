import React, { useMemo, useState } from 'react';
import { ArrowUp, ListOrdered } from 'lucide-react';
import type { Leaderboard, LeaderboardEntry, LeaderboardScope } from '../../../../shared/types/leaderboard.js';
import { LoadingState } from '../../common/LoadingState.js';
import { buildLeaderboardRows, COMPACT_THRESHOLD, LeaderboardSort } from './leaderboardRows.js';
import { LeaderboardRow } from './LeaderboardRow.js';
import { StandingHeader } from './StandingHeader.js';
import { carClassLabel } from './leaderboardFormat.js';
import { boardLapId } from './leaderboardLaps.js';
import { CompareBar } from './CompareBar.js';
import { LoadError } from '../LoadError.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';

export interface LeaderboardSectionProps {
  board: Leaderboard | null;
  loading: boolean;
  error: string | null;
  carClass: string;
  scope: LeaderboardScope;
  /** The car the "my car" scope limits the board to. */
  playerCarType: string | null;
  onScopeChange: (scope: LeaderboardScope) => void;
  onCompare?: (entry: LeaderboardEntry) => void;
  onTelemetry?: (entry: LeaderboardEntry) => void;
  /** The rival driver, marked on the board. */
  rivalName?: string | null;
  /** Makes a driver ahead the player rival. */
  onPin?: (driverName: string) => void;
  /** The ids of the laps in the comparison. */
  comparedLapIds?: readonly string[];
  /** Adds a driver's best lap to the comparison, or takes it out. */
  onPick?: (entry: LeaderboardEntry) => void;
  /** Opens the session of the player's best lap. */
  onOpenSession?: (sessionId: string) => void;
  /** Brings the comparison below the board into view. */
  onGoToCompare?: () => void;
  /** Loads the board again after an error. */
  retry?: () => void;
}

const pill = (active: boolean) =>
  `px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
    active ? 'bg-lmu-accent text-white' : 'text-lmu-muted hover:text-white'
  }`;

/** The board of the selected layout and class: the player's standing, then every driver met there. */
/** The board's sectors are each driver's best, which may come from different laps than the best lap. */
const BEST_SECTOR_HINT = 'Best sector from any clean lap, not always from the best lap';

export const LeaderboardSection: React.FC<LeaderboardSectionProps> = ({
  board, loading, error, carClass, scope, playerCarType, onScopeChange, onCompare, onTelemetry, rivalName, onPin,
  comparedLapIds = [], onPick, onOpenSession, onGoToCompare, retry,
}) => {
  const [sort, setSort] = useState<LeaderboardSort>('lap');
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(
    () => (board ? buildLeaderboardRows(board, sort, !showAll, rivalName ?? null) : []),
    [board, sort, showAll, rivalName]
  );
  const sortHeader = (column: LeaderboardSort, label: string, title?: string) => (
    <th scope="col" className="px-3 py-3 text-right" aria-sort={sort === column ? 'ascending' : undefined}>
      <button
        type="button"
        onClick={() => setSort(column)}
        className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wider hover:text-white rounded ${
          sort === column ? 'text-lmu-text-soft' : ''
        } ${FOCUS_RING}`}
        title={`${title ? `${title}. ` : ''}Sort by ${label}`}
      >
        {label}
        {sort === column && <ArrowUp className="h-3 w-3" aria-hidden="true" />}
      </button>
    </th>
  );

  return (
    <section className="bg-lmu-card border border-lmu-border p-6 rounded-2xl space-y-4" aria-label="Leaderboard">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-lmu-accent-text" />
            {carClassLabel(carClass)} board
          </h3>
          <p className="text-xs text-lmu-muted mt-0.5">
            Best clean dry lap of every driver you met online here{board?.benchmark ? ', with the community pace bands' : ''}.
            {onCompare && ' Compare puts a driver\'s best lap against yours; hover a row for more.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Board scope" className="flex items-center gap-1 bg-lmu-bg p-1 rounded-xl border border-lmu-border">
            <button type="button" aria-pressed={scope === 'class'} onClick={() => onScopeChange('class')} className={`${pill(scope === 'class')} ${FOCUS_RING}`}>
              Whole class
            </button>
            <button
              type="button"
              aria-pressed={scope === 'car'}
              disabled={!playerCarType}
              onClick={() => onScopeChange('car')}
              className={`${pill(scope === 'car')} disabled:text-lmu-faint disabled:cursor-not-allowed ${FOCUS_RING}`}
              title={playerCarType ?? 'No lap of yours in this class yet to pick your car from'}
            >
              My car
            </button>
          </div>
        </div>
      </div>

      {error && (
        <LoadError message={error} onRetry={retry} />
      )}
      {loading && <LoadingState size="compact" title="Loading leaderboard" showQuote={false} />}

      {board && (
        <>
          <StandingHeader board={board} scope={scope} />
          {board.entries.length === 0 ? (
            <p className="text-sm text-lmu-muted">Nobody has a clean dry lap here in this {scope === 'car' ? 'car' : 'class'} yet.</p>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-lmu-muted">
                <thead className="bg-lmu-bg/80 uppercase tracking-wider font-semibold text-[11px] text-lmu-muted border-b border-lmu-border">
                  <tr>
                    <th scope="col" className="px-3 py-3">Pos</th>
                    <th scope="col" className="px-3 py-3">Driver</th>
                    {sortHeader('lap', 'Best Lap')}
                    <th scope="col" className="px-3 py-3 text-center">Benchmark Pace</th>
                    <th scope="col" className="px-3 py-3 text-right" title="Behind the fastest driver's best lap">Gap</th>
                    <th scope="col" className="px-3 py-3 text-right" title="Their best lap against yours: negative means faster than you">Vs You</th>
                    {sortHeader('s1', 'Best S1', BEST_SECTOR_HINT)}
                    {sortHeader('s2', 'Best S2', BEST_SECTOR_HINT)}
                    {sortHeader('s3', 'Best S3', BEST_SECTOR_HINT)}
                    {sortHeader('pace', 'Race Pace', 'Best average of three clean laps in one session')}
                    <th scope="col" className="px-2 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-lmu-border/50 font-mono">
                  {rows.map((row, i) => (
                    <LeaderboardRow
                      key={row.kind === 'driver' ? row.entry.driverName : `${row.kind}-${i}`}
                      row={row}
                      player={board.player}
                      benchmark={board.benchmark}
                      onShowAll={() => setShowAll(true)}
                      onCompare={onCompare}
                      onTelemetry={onTelemetry}
                      isRival={row.kind === 'driver' && row.entry.driverName === rivalName}
                      onPin={onPin}
                      isCompared={row.kind === 'driver' && comparedLapIds.includes(boardLapId(row.entry))}
                      onPick={onPick}
                      onOpenSession={onOpenSession}
                    />
                  ))}
                </tbody>
              </table>
              {showAll && board.entries.length > COMPACT_THRESHOLD && (
                <button type="button" onClick={() => setShowAll(false)} className={`mt-2 text-[11px] text-lmu-muted hover:text-white cursor-pointer ${FOCUS_RING}`}>
                  Show the top and the drivers around you only
                </button>
              )}
            </div>
          )}
        </>
      )}
      {board && <CompareBar board={board} comparedLapIds={comparedLapIds} onGoToCompare={onGoToCompare} />}
    </section>
  );
};
