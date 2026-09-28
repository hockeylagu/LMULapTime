import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Leaderboard, LeaderboardEntry } from '../../../../shared/types/leaderboard.js';
import { buildTelemetryComparePath } from '../../../utils/telemetryCompareLink.js';
import type { CompareRequest } from '../useCompareLapsData.js';
import { boardLapTelemetryRef, boardLapToComparable } from './leaderboardLaps.js';

export interface BoardActions {
  /** What the compare section should show, asked for by the last click on the board. */
  compareRequest: CompareRequest | null;
  /** The compare section, scrolled into view when a pair is asked for. */
  compareRef: React.RefObject<HTMLDivElement | null>;
  /** Adds a driver's best lap to the comparison, or takes it out. */
  onPick?: (entry: LeaderboardEntry) => void;
  /** Your best lap against a driver's; undefined while you have no lap on the board. */
  onCompare?: (entry: LeaderboardEntry) => void;
  /** As onCompare, and works out where the time is straight away. */
  onAnalyse?: (entry: LeaderboardEntry) => void;
  /**
   * The telemetry of your best lap against a driver's, or alone from your own row; undefined while
   * you have no lap on the board.
   */
  onTelemetry?: (entry: LeaderboardEntry) => void;
}

/** The tag a board lap carries in the comparison. */
export function boardLapTag(entry: LeaderboardEntry): string {
  return entry.isPlayer ? '⭐ Your best' : `🎯 P${entry.rank} ${entry.driverName}`;
}

/** What the leaderboard rows do: pick laps to compare, compare the player's best with a driver's, here or in telemetry. */
export function useBoardActions(board: Leaderboard | null, carClass: string | null): BoardActions {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [compareRequest, setCompareRequest] = useState<CompareRequest | null>(null);
  const compareRef = useRef<HTMLDivElement | null>(null);
  if (!board || !carClass) return { compareRequest, compareRef };

  const onPick = (entry: LeaderboardEntry) => {
    setCompareRequest((previous) => ({
      key: (previous?.key ?? 0) + 1,
      lap: boardLapToComparable(entry, carClass, boardLapTag(entry)),
    }));
  };

  const player = board.player;
  if (!player) return { compareRequest, compareRef, onPick };

  const compare = (entry: LeaderboardEntry, analyse: boolean) => {
    setCompareRequest((previous) => ({
      key: (previous?.key ?? 0) + 1,
      reference: boardLapToComparable(entry, carClass, boardLapTag(entry)),
      lap: boardLapToComparable(player, carClass, boardLapTag(player)),
      analyse,
    }));
    compareRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  const onCompare = (entry: LeaderboardEntry) => compare(entry, false);
  const onAnalyse = (entry: LeaderboardEntry) => compare(entry, true);

  const onTelemetry = (entry: LeaderboardEntry) => {
    const yours = boardLapTelemetryRef(player);
    if (!yours) return;
    if (entry.isPlayer) {
      navigate(buildTelemetryComparePath(searchParams, yours, null));
      return;
    }
    const theirs = boardLapTelemetryRef(entry);
    if (theirs) navigate(buildTelemetryComparePath(searchParams, yours, theirs));
  };

  return { compareRequest, compareRef, onPick, onCompare, onAnalyse, onTelemetry };
}
