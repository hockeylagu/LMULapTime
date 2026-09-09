import { useEffect, useState } from 'react';
import { ReplayMetadata, ReplayTrajectoryData } from '../../../server/types.js';
import { computeCornerConsistencyStats, CornerConsistencyLapInput, CornerConsistencyStat } from '../../utils/cornerAnalysis.js';

// Kept small since these laps are only used for corner-window timing, not full detail rendering.
const CONSISTENCY_MAX_POINTS = 400;

interface CachedResult {
  cornerStats: CornerConsistencyStat[];
  lapsSampled: number;
}

// Module-level so the result survives tab toggles and modal re-opens for the same replay/lap,
// avoiding an expensive re-fetch-and-recompute every time the Consistency sub-view is revisited.
const consistencyCache = new Map<string, CachedResult>();
const MAX_CACHE_ENTRIES = 30;

function cacheKeyFor(replayName: string, driverSlot: number | null, referenceLap: number | undefined): string {
  return `${replayName}|${driverSlot ?? 'x'}|${referenceLap ?? 0}`;
}

function storeInCache(key: string, result: CachedResult): void {
  if (consistencyCache.size >= MAX_CACHE_ENTRIES && !consistencyCache.has(key)) {
    const oldestKey = consistencyCache.keys().next().value;
    if (oldestKey !== undefined) consistencyCache.delete(oldestKey);
  }
  consistencyCache.set(key, result);
}

export interface UseCornerConsistencyResult {
  cornerStats: CornerConsistencyStat[];
  isLoading: boolean;
  lapsSampled: number;
}

/**
 * Fetches every other valid lap of the current replay/driver (lazily - only when `enabled`)
 * and times each one through the same corner windows as the currently displayed lap, to
 * surface which corners are driven consistently vs. which vary lap to lap. Results are cached
 * per replay/driver/reference-lap so re-opening the same lap's Consistency view is instant.
 */
export function useCornerConsistency(
  enabled: boolean,
  activeReplayName: string | null,
  metadata: ReplayMetadata | null,
  selectedDriverSlot: number | null,
  trajectory: ReplayTrajectoryData | null
): UseCornerConsistencyResult {
  const [cornerStats, setCornerStats] = useState<CornerConsistencyStat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lapsSampled, setLapsSampled] = useState(0);

  useEffect(() => {
    if (!enabled || !activeReplayName || !trajectory?.points?.length) {
      setCornerStats([]);
      setLapsSampled(0);
      return;
    }

    const cacheKey = cacheKeyFor(activeReplayName, selectedDriverSlot, trajectory.currentLap);
    const cached = consistencyCache.get(cacheKey);
    if (cached) {
      setCornerStats(cached.cornerStats);
      setLapsSampled(cached.lapsSampled);
      setIsLoading(false);
      return;
    }

    // Sourced from trajectory.laps first, same as computeLapConsistencyStats, so this hook's
    // notion of "valid" always agrees with the sector-level consistency stats.
    const lapSummaries = trajectory.laps || metadata?.laps || [];
    const isLapValid = (lapNumber: number) => {
      const summary = lapSummaries.find(l => l.lapNumber === lapNumber);
      return summary ? summary.isValid !== false && !summary.isOutlap : true;
    };
    const otherLaps = lapSummaries.filter(l =>
      l.isValid !== false && !l.isOutlap && l.lapTimeSec > 0 && l.lapNumber !== trajectory.currentLap
    );
    // The currently displayed lap is only usable as a data point if it's itself valid - an
    // invalid/outlap current lap still supplies the corner-boundary geometry (referencePoints
    // below) but must not contribute its own times/speeds to the aggregated stats.
    const currentLapIsValid = trajectory.currentLap === undefined || isLapValid(trajectory.currentLap);
    if (otherLaps.length === 0 && !currentLapIsValid) {
      storeInCache(cacheKey, { cornerStats: [], lapsSampled: 0 });
      setCornerStats([]);
      setLapsSampled(0);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    const slotParam = typeof selectedDriverSlot === 'number' ? `&driverSlot=${selectedDriverSlot}` : '';

    Promise.all(
      otherLaps.map(l =>
        fetch(`http://localhost:3001/api/replays/${encodeURIComponent(activeReplayName)}/trajectory?maxPoints=${CONSISTENCY_MAX_POINTS}&lap=${l.lapNumber}${slotParam}`)
          .then(r => (r.ok ? r.json() : null))
          .then((data: ReplayTrajectoryData | null): CornerConsistencyLapInput => ({ lapNumber: l.lapNumber, points: data?.points || [] }))
          .catch((): CornerConsistencyLapInput => ({ lapNumber: l.lapNumber, points: [] }))
      )
    ).then(results => {
      if (!isMounted) return;
      const laps: CornerConsistencyLapInput[] = [
        ...(currentLapIsValid ? [{ lapNumber: trajectory.currentLap ?? 0, points: trajectory.points }] : []),
        ...results.filter(r => r.points.length > 0),
      ];
      const computedStats = computeCornerConsistencyStats(laps, trajectory.points);
      storeInCache(cacheKey, { cornerStats: computedStats, lapsSampled: laps.length });
      setLapsSampled(laps.length);
      setCornerStats(computedStats);
      setIsLoading(false);
    });

    return () => { isMounted = false; };
  }, [enabled, activeReplayName, metadata, selectedDriverSlot, trajectory]);


  return { cornerStats, isLoading, lapsSampled };
}
