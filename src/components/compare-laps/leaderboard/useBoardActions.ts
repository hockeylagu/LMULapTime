import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Leaderboard, LeaderboardEntry } from '../../../../shared/types/leaderboard.js';
import { buildTelemetryComparePath } from '../../../utils/telemetryCompareLink.js';
import type { ComparePairRequest } from '../useCompareLapsData.js';
import { boardLapTelemetryRef, boardLapToComparable } from './leaderboardLaps.js';

export interface BoardActions {
  /** The pair the compare section should show, asked for by the last Compare click. */
  pairRequest: ComparePairRequest | null;
  /** The compare section, scrolled into view when a pair is asked for. */
  compareRef: React.RefObject<HTMLDivElement | null>;
  /** Your best lap against a driver's; undefined while you have no lap on the board. */
  onCompare?: (entry: LeaderboardEntry) => void;
  /** The telemetry of your best lap against a driver's; undefined while you have no lap on the board. */
  onTelemetry?: (entry: LeaderboardEntry) => void;
}

/** What the leaderboard rows do: compare the player's best lap with a driver's, here or in telemetry. */
export function useBoardActions(board: Leaderboard | null, carClass: string | null): BoardActions {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pairRequest, setPairRequest] = useState<ComparePairRequest | null>(null);
  const compareRef = useRef<HTMLDivElement | null>(null);
  const player = board?.player ?? null;
  if (!player || !carClass) return { pairRequest, compareRef };

  const onCompare = (entry: LeaderboardEntry) => {
    setPairRequest((previous) => ({
      key: (previous?.key ?? 0) + 1,
      reference: boardLapToComparable(entry, carClass, `🎯 P${entry.rank} ${entry.driverName}`),
      lap: boardLapToComparable(player, carClass, '⭐ Your best'),
    }));
    compareRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const onTelemetry = (entry: LeaderboardEntry) => {
    const yours = boardLapTelemetryRef(player);
    const theirs = boardLapTelemetryRef(entry);
    if (yours && theirs) navigate(buildTelemetryComparePath(searchParams, yours, theirs));
  };

  return { pairRequest, compareRef, onCompare, onTelemetry };
}
