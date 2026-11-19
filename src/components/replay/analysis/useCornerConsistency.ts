import { useEffect, useMemo, useState } from 'react';
import { lapCounts } from '../cornerCard/cornerInsight.js';
import type { CornerSegmentKind, SessionCornerPasses } from '../../../../shared/types/corners/cornerPasses.js';
import { ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { computeCornerConsistencyStats, CornerConsistencyStat, placeStatsOnLap } from '../../../utils/cornerConsistency.js';
import { fetchSessionCornerPasses, fetchSessionSequencePasses } from '../../../api/replayApi.js';
import { isAbortError } from '../../../api/apiClient.js';

const NO_CORNER_STATS: CornerConsistencyStat[] = [];
const NO_EXCLUDED_LAPS: ReadonlySet<number> = new Set();

export interface UseCornerConsistencyResult {
  cornerStats: CornerConsistencyStat[];
  isLoading: boolean;
  /** Why there are no corner stats (no replay, passes not built), when the load said so. */
  unavailableReason: string | null;
}

/** The displayed lap, to place each turn on: its distances, and its corners. */
export interface CornerConsistencyPlacement {
  dists: readonly number[];
  corners: ReadonlyArray<{ cornerNumber: number; entryDistM: number; exitDistM: number }>;
}

/**
 * The selected driver's corner passes for the session (lazily - only when `enabled`), one request, and how
 * repeatably they drive each corner (their class's sequences, or the official turns: `segments`) over the laps the
 * corner card counts, less the laps left out. Each corner is placed on the displayed lap (`placement`): its apex's (a
 * sequence's slowest point's) lap distance and the lap's corner holding it.
 */
export function useCornerConsistency(
  enabled: boolean,
  activeSessionId: string | null,
  metadata: ReplayMetadata | null,
  selectedDriverSlot: number | null,
  trajectory: ReplayTrajectoryData | null,
  excludedLaps: ReadonlySet<number> = NO_EXCLUDED_LAPS,
  placement?: CornerConsistencyPlacement,
  segments: CornerSegmentKind = 'turns'
): UseCornerConsistencyResult {
  const driverOrdinal = trajectory?.driverOrdinal
    ?? metadata?.drivers.find(item => item.slot === selectedDriverSlot)?.sessionDriverOrdinal;

  const key = enabled && activeSessionId && driverOrdinal !== undefined ? `${activeSessionId}|${driverOrdinal}|${segments}` : null;
  const [loaded, setLoaded] = useState<{ key: string; response: SessionCornerPasses | null; reason: string | null } | null>(null);

  useEffect(() => {
    if (!key || !activeSessionId || driverOrdinal === undefined) return;
    const controller = new AbortController();
    const fetchPasses = segments === 'sequences' ? fetchSessionSequencePasses : fetchSessionCornerPasses;
    fetchPasses(activeSessionId, driverOrdinal, { signal: controller.signal })
      .then(response => {
        // A late answer for a session no longer shown must not replace the current one.
        if (controller.signal.aborted) return;
        setLoaded({ key, response, reason: response.available ? null : response.reason });
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setLoaded({ key, response: null, reason: error instanceof Error ? error.message : 'Corner times are unavailable.' });
      });
    return () => controller.abort();
  }, [key, activeSessionId, driverOrdinal, segments]);

  const answered = key !== null && loaded?.key === key;
  const passes = answered && loaded.response?.available ? loaded.response : null;
  const points = trajectory?.points;
  const shownLap = trajectory?.currentLap;
  const cornerStats = useMemo(() => {
    if (!passes) return NO_CORNER_STATS;
    // The laps the corner card counts (`lapCounts`), in the shown lap's conditions, less the laps left out.
    const slot = passes.passes[0]?.slot;
    const laps = passes.laps.filter(lap => lap.slot === slot);
    const wet = laps.find(lap => lap.lapNumber === shownLap)?.wet ?? false;
    const counted = new Set(laps.filter(lap => lapCounts(lap) && lap.wet === wet && !excludedLaps.has(lap.lapNumber)).map(lap => lap.lapNumber));
    const stats = computeCornerConsistencyStats(passes.passes, passes.turns, counted);
    if (!placement || !points) return stats;
    return placeStatsOnLap(stats, { points, dists: placement.dists }, passes.startStationM, passes.trackLengthM, placement.corners);
  }, [passes, shownLap, excludedLaps, placement, points]);

  return {
    cornerStats,
    isLoading: key !== null && !answered,
    unavailableReason: answered ? loaded.reason : null,
  };
}
