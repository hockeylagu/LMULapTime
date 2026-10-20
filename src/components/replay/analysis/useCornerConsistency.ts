import {hasCompatibleTrackStations} from '../../../../shared/domain/trackGeometry.js';
import { isCleanReplayLap } from '../../../../shared/domain/lapComparison.js';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { computeCornerConsistencyStats, CornerConsistencyLapInput, CornerConsistencyStat } from '../../../utils/cornerConsistency.js';
import { applyTelemetryPostProcessing } from '../../../utils/telemetryPostProcessing.js';
import { fetchSessionTelemetry } from '../../../api/replayApi.js';

// Kept small since these laps are only used for corner-window timing, not full detail rendering.
const CONSISTENCY_MAX_POINTS = 400;
const EMPTY_LAP_SUMMARIES: NonNullable<ReplayTrajectoryData['laps']> = [];
const NO_CORNER_STATS: CornerConsistencyStat[] = [];

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
  activeSessionId: string | null,
  metadata: ReplayMetadata | null,
  selectedDriverSlot: number | null,
  trajectory: ReplayTrajectoryData | null
): UseCornerConsistencyResult {
  const lapSummaries = trajectory?.laps || metadata?.laps || EMPTY_LAP_SUMMARIES;
  const currentLap = trajectory?.currentLap;
  const points = trajectory?.points;
  const trackLengthM = trajectory?.trackLengthM;
  const source = trajectory?.source;
  const stationSource = trajectory?.stationSource;
  const geometryRevision = trajectory?.geometryRevision;
  const driverOrdinal = trajectory?.driverOrdinal
    ?? metadata?.drivers.find(item => item.slot === selectedDriverSlot)?.sessionDriverOrdinal;

  // The load this selection asks for; null when there is nothing to load.
  const request = useMemo(() => {
    if (!enabled || !activeSessionId || !points?.length || stationSource === 'odometer' || driverOrdinal === undefined) return null;
    // Sourced from trajectory.laps first, same as computeLapConsistencyStats, so this hook's
    // notion of "valid" always agrees with the sector-level consistency stats.
    const isLapValid = (lapNumber: number) => {
      const summary = lapSummaries.find(l => l.lapNumber === lapNumber);
      return summary ? isCleanReplayLap(summary) : true;
    };
    const otherLaps = lapSummaries.filter(l => isCleanReplayLap(l) && l.lapNumber !== currentLap);
    // The currently displayed lap is only usable as a data point if it's itself valid - an
    // invalid/outlap current lap still supplies the corner-boundary geometry (referencePoints
    // below) but must not contribute its own times/speeds to the aggregated stats.
    const currentLapIsValid = currentLap === undefined || isLapValid(currentLap);
    if (otherLaps.length === 0 && !currentLapIsValid) return null;
    return { sessionId: activeSessionId, selectedDriverSlot, driverOrdinal, currentLap, currentLapIsValid, otherLaps,
      points, trackLengthM, source, stationSource, geometryRevision };
  }, [enabled, activeSessionId, selectedDriverSlot, driverOrdinal, currentLap, points, trackLengthM, lapSummaries, source, stationSource, geometryRevision]);

  const [result, setResult] = useState<{ request: NonNullable<typeof request>; cornerStats: CornerConsistencyStat[]; lapsSampled: number } | null>(null);
  const answered = !!request && result?.request === request;

  // Metadata and driver object identity must not retrigger the load: the lap ordinals are read when it starts.
  const driverLapOrdinals = useEffectEvent(() => metadata?.drivers.find(item => item.slot === selectedDriverSlot)?.sessionLapOrdinals);
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    const lapOrdinals = driverLapOrdinals();
    const { sessionId, driverOrdinal: ordinal, source: lapSource, stationSource: stations, geometryRevision: revision } = request;
    void Promise.all(
      request.otherLaps.map(l => {
        const lapOrdinal = lapOrdinals?.[String(l.lapNumber)];
        if (lapOrdinal === undefined) return Promise.resolve({ lapNumber: l.lapNumber, points: [] });
        return fetchSessionTelemetry(sessionId, { resolutionQuery: `maxPoints=${CONSISTENCY_MAX_POINTS}`, lapOrdinal, driverOrdinal: ordinal, source: lapSource }, { signal: controller.signal })
          .then((data: ReplayTrajectoryData | null): CornerConsistencyLapInput => ({ lapNumber: l.lapNumber, points: data && hasCompatibleTrackStations({ stationSource: stations, geometryRevision: revision }, data) ? applyTelemetryPostProcessing(data.points || []) : [] }))
          .catch((): CornerConsistencyLapInput => ({ lapNumber: l.lapNumber, points: [] }));
      })
    ).then(results => {
      if (controller.signal.aborted) return;
      const laps: CornerConsistencyLapInput[] = [
        ...(request.currentLapIsValid ? [{ lapNumber: request.currentLap ?? 0, points: request.points }] : []),
        ...results.filter(r => r.points.length > 0),
      ];
      setResult({ request, cornerStats: computeCornerConsistencyStats(laps, request.points, request.trackLengthM), lapsSampled: laps.length });
    });
    return () => controller.abort();
  }, [request]);

  return {
    cornerStats: answered ? result.cornerStats : NO_CORNER_STATS,
    isLoading: !!request && !answered,
    lapsSampled: answered ? result.lapsSampled : 0,
  };
}
