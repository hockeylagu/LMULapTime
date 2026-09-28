import React, { useMemo, useState } from 'react';
import { ArrowUp, ListOrdered } from 'lucide-react';
import type { Leaderboard, LeaderboardEntry, LeaderboardScope } from '../../../../shared/types/leaderboard.js';
import { LoadingState } from '../../common/LoadingState.js';
import { buildLeaderboardRows, COMPACT_THRESHOLD, LeaderboardSort } from './leaderboardRows.js';
import { LeaderboardRow } from './LeaderboardRow.js';
import { StandingHeader } from './StandingHeader.js';
import { carClassLabel } from './leaderboardFormat.js';
import { boardLapId } from './leaderboardLaps.js';

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
}

const pill = (active: boolean) =>
  `px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
    active ? 'bg-lmu-accent text-white' : 'text-lmu-muted hover:text-white'
  }`;

/** The board of the selected layout and class: the player's standing, then every driver met there. */
export const LeaderboardSection: React.FC<LeaderboardSectionProps> = ({
  board, loading, error, carClass, scope, playerCarType, onScopeChange, onCompare, onTelemetry, rivalName, onPin,
  comparedLapIds = [], onPick, onOpenSession,
}) => {
  const [sort, setSort] = useState<LeaderboardSort>('lap');
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(
    () => (board ? buildLeaderboardRows(board, sort, !showAll, rivalName ?? null) : []),
    [board, sort, showAll, rivalName]
  );
  const sortHeader = (column: LeaderboardSort, label: string, title?: string) => (
    <th className="px-3 py-3 text-right" title={title} aria-sort={sort === column ? 'ascending' : undefined}>
      <button
        type="button"
        onClick={() => setSort(column)}
        className="inline-flex items-center gap-1 uppercase hover:text-white"
        title={`Order by ${label.toLowerCase()}`}
      >
        {label}
        {sort === column && <ArrowUp className="h-3 w-3" />}
      </button>
    </th>
  );

  return (
    <section className="bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] p-6 rounded-2xl space-y-4" aria-label="Leaderboard">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-lmu-accent" />
            Leaderboard · {carClassLabel(carClass)}
          </h3>
          <p className="text-xs text-lmu-muted mt-0.5">
            Best clean dry lap of every driver you met online here{board?.benchmark ? ', with the community pace bands' : ''}.
            {onPick && ' Tick two drivers to compare their laps.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Board scope" className="flex items-center gap-1 bg-lmu-bg p-1 rounded-xl border border-lmu-border">
            <button type="button" aria-pressed={scope === 'class'} onClick={() => onScopeChange('class')} className={pill(scope === 'class')}>
              Whole class
            </button>
            <button
              type="button"
              aria-pressed={scope === 'car'}
              disabled={!playerCarType}
              onClick={() => onScopeChange('car')}
              className={`${pill(scope === 'car')} disabled:opacity-40 disabled:cursor-default`}
              title={playerCarType ?? undefined}
            >
              My car
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-300">{error}</p>
      )}
      {loading && <LoadingState size="compact" title="Loading leaderboard" showQuote={false} />}

      {board && (
        <>
          <StandingHeader board={board} />
          {board.entries.length === 0 ? (
            <p className="text-sm text-lmu-muted">Nobody has a clean dry lap here in this {scope === 'car' ? 'car' : 'class'} yet.</p>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-lmu-muted">
                <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border">
                  <tr>
                    <th className="px-3 py-3">Pos</th>
                    <th className="px-3 py-3">Driver</th>
                    {sortHeader('lap', 'Best Lap')}
                    <th className="px-3 py-3 text-center">Pace Category</th>
                    <th className="px-3 py-3 text-right">Gap</th>
                    <th className="px-3 py-3 text-right">Vs You</th>
                    {sortHeader('s1', 'Sector 1')}
                    {sortHeader('s2', 'Sector 2')}
                    {sortHeader('s3', 'Sector 3')}
                    {sortHeader('pace', 'Race Pace', 'Best average of three clean laps in one session')}
                    <th className="px-2 py-3 text-center">Actions</th>
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
                <button type="button" onClick={() => setShowAll(false)} className="mt-2 text-[11px] text-lmu-muted hover:text-white cursor-pointer">
                  Show the top and the drivers around you only
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
};
