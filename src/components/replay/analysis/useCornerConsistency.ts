import {hasCompatibleTrackStations} from '../../../../shared/domain/trackGeometry.js';
import { isCleanReplayLap } from '../../../../shared/domain/lapComparison.js';
import { useEffect, useState } from 'react';
import { ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { computeCornerConsistencyStats, CornerConsistencyLapInput, CornerConsistencyStat } from '../../../utils/cornerConsistency.js';
import { applyTelemetryPostProcessing } from '../../../utils/telemetryPostProcessing.js';
import { fetchSessionTelemetry } from '../../../api/replayApi.js';

// Kept small since these laps are only used for corner-window timing, not full detail rendering.
const CONSISTENCY_MAX_POINTS = 400;
const EMPTY_LAP_SUMMARIES: NonNullable<ReplayTrajectoryData['laps']> = [];

export interface UseCornerConsistencyResult {
  cornerStats: CornerConsistencyStat[];
  isLoading: boolean;
  lapsSampled: number;
}

/**
 * Fetches every other valid lap of the current session driver (lazily - only when `enabled`)
 * and times each one through the same corner windows as the currently displayed lap, to
 * surface which corners are driven consistently vs. which vary lap to lap. Results live only
 * for this mounted selection and are recomputed from the current trajectory inputs.
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
  const lapSummaries = trajectory?.laps || metadata?.laps || EMPTY_LAP_SUMMARIES;
  const currentLap = trajectory?.currentLap;
  const points = trajectory?.points;
  const trackLengthM = trajectory?.trackLengthM;
  const source = trajectory?.source;
  const stationSource = trajectory?.stationSource;
  const geometryRevision = trajectory?.geometryRevision;

  useEffect(() => {
    if (!enabled || !activeReplayName || !points?.length || stationSource === 'odometer') {
      setCornerStats([]);
      setLapsSampled(0);
      setIsLoading(false);
      return;
    }

    // Sourced from trajectory.laps first, same as computeLapConsistencyStats, so this hook's
    // notion of "valid" always agrees with the sector-level consistency stats.
    const isLapValid = (lapNumber: number) => {
      const summary = lapSummaries.find(l => l.lapNumber === lapNumber);
      return summary ? isCleanReplayLap(summary) : true;
    };
    const otherLaps = lapSummaries.filter(l =>
      isCleanReplayLap(l) && l.lapNumber !== currentLap
    );
    // The currently displayed lap is only usable as a data point if it's itself valid - an
    // invalid/outlap current lap still supplies the corner-boundary geometry (referencePoints
    // below) but must not contribute its own times/speeds to the aggregated stats.
    const currentLapIsValid = currentLap === undefined || isLapValid(currentLap);
    if (otherLaps.length === 0 && !currentLapIsValid) {
      setCornerStats([]);
      setLapsSampled(0);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let isCurrent = true;
    setCornerStats([]);
    setLapsSampled(0);
    setIsLoading(true);

    const driver = metadata?.drivers.find(item => item.slot === selectedDriverSlot);
    const driverOrdinal = trajectory?.driverOrdinal ?? driver?.sessionDriverOrdinal;
    if (driverOrdinal === undefined) {
      setIsLoading(false);
      return;
    }
    Promise.all(
      otherLaps.map(l => {
        const lapOrdinal = driver?.sessionLapOrdinals?.[String(l.lapNumber)];
        if (lapOrdinal === undefined) return Promise.resolve({ lapNumber: l.lapNumber, points: [] });
        return fetchSessionTelemetry(activeReplayName, { resolutionQuery: `maxPoints=${CONSISTENCY_MAX_POINTS}`, lapOrdinal, driverOrdinal, source }, { signal: controller.signal })
          .then((data: ReplayTrajectoryData | null): CornerConsistencyLapInput => ({ lapNumber: l.lapNumber, points: data && hasCompatibleTrackStations({stationSource,geometryRevision}, data) ? applyTelemetryPostProcessing(data.points || []) : [] }))
          .catch((): CornerConsistencyLapInput => ({ lapNumber: l.lapNumber, points: [] }))
      })
    ).then(results => {
      if (!isCurrent || controller.signal.aborted) return;
      const laps: CornerConsistencyLapInput[] = [
        ...(currentLapIsValid ? [{ lapNumber: currentLap ?? 0, points }] : []),
        ...results.filter(r => r.points.length > 0),
      ];
      const computedStats = computeCornerConsistencyStats(laps, points, trackLengthM);
      setLapsSampled(laps.length);
      setCornerStats(computedStats);
      setIsLoading(false);
    });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [enabled, activeReplayName, selectedDriverSlot, currentLap, points, trackLengthM, lapSummaries, source, stationSource, geometryRevision]);


  return { cornerStats, isLoading, lapsSampled };
}
