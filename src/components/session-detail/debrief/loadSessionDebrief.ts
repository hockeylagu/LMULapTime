import type { ComparableLap, DetailedSession, DriverData, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { getBestLapNumber, getDisplayTrackName } from '../../../../shared/domain/formatters.js';
import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';
import { selectCleanLapCandidates } from '../../../../shared/domain/lapComparison.js';
import { resolveDriverCarClass } from '../../../../shared/domain/vehicleMapping.js';
import { fetchJson } from '../../../api/apiClient.js';
import { fetchReplayTrajectory } from '../../../api/replayApi.js';
import { computeLapSegmentComparisons } from '../../../utils/cornerAnalysis.js';
import { computeCornerConsistencyStats, CornerConsistencyLapInput } from '../../../utils/cornerConsistency.js';
import { pickFastestSameCarLap } from '../../../utils/referenceLaps.js';
import { comparisonConfidence, DebriefCorner, rankDebriefCorners } from '../../../utils/sessionDebrief.js';
import { applyTelemetryPostProcessing, applyTelemetryPostProcessingToTrajectory } from '../../../utils/telemetryPostProcessing.js';
import { DEFAULT_TELEMETRY_RESOLUTION, trajectoryResolutionQuery } from '../../replay/telemetry/telemetryResolution.js';
import { describeComparisonCaveats } from '../../replay/inspector/ComparisonAccuracyNotice.js';

/** The session's other laps are only timed through each corner, so a light trace is enough. */
const REPEATABILITY_LAP_MAX_POINTS = 400;

export interface SessionDebrief {
  replayName: string;
  driverName: string;
  lapNumber: number;
  lapTimeSec: number | null;
  reference: ComparableLap;
  /** Analysed lap time minus the reference lap time (seconds). */
  lapDeltaSec: number | null;
  corners: DebriefCorner[];
  /** Laps of the session timed through each corner for repeatability (the analysed lap included). */
  lapsTimed: number;
  confidence: number;
  caveats: string[];
}

/** Why the session has no debrief, in words the driver can act on. */
export class DebriefUnavailableError extends Error {}

/**
 * Compares the driver's best lap of the session with the fastest same-car lap on this layout
 * (see pickFastestSameCarLap) and ranks the corners to work on. The analysed lap and the
 * reference are loaded exactly as the telemetry view loads them, so a debrief corner opens there
 * with the same numbers; the session's other clean laps are timed through the same corners for
 * repeatability.
 */
export async function loadSessionDebrief(session: DetailedSession, driver: DriverData, signal?: AbortSignal): Promise<SessionDebrief> {
  const replayName = session.matchingReplayFile?.name;
  if (!replayName) throw new DebriefUnavailableError('This session has no replay to analyse.');
  const lapNumber = getBestLapNumber(driver);
  const lap = driver.laps?.find(l => l.lapNum === lapNumber);
  if (!lap || !lap.lapTime) throw new DebriefUnavailableError('No timed lap to analyse in this session.');

  const query = new URLSearchParams({
    track: getDisplayTrackName(session.trackVenue, session.trackCourse),
    carModel: driver.carType,
    playerOnly: 'false',
  });
  const carClass = resolveDriverCarClass(driver);
  if (carClass) query.set('carClass', carClass);
  const { laps = [] } = await fetchJson<{ laps?: ComparableLap[] }>(`/api/compare/laps?${query.toString()}`, { signal });
  const reference = pickFastestSameCarLap(laps, { sessionId: session.id, driverName: driver.name, lapNum: lapNumber, carType: driver.carType });
  if (!reference?.matchingReplayFile) {
    throw new DebriefUnavailableError(`No other ${driver.carType} lap with replay data on this layout to compare with yet.`);
  }

  const resolutionQuery = trajectoryResolutionQuery(DEFAULT_TELEMETRY_RESOLUTION);
  const [rawTarget, rawReference] = await Promise.all([
    fetchReplayTrajectory(replayName, { resolutionQuery, lap: lapNumber, driverName: driver.name }, { signal }),
    fetchReplayTrajectory(reference.matchingReplayFile, { resolutionQuery, lap: reference.lapNum, driverName: reference.driverName }, { signal }),
  ]);
  const target: ReplayTrajectoryData = applyTelemetryPostProcessingToTrajectory(rawTarget);
  const referenceTrajectory: ReplayTrajectoryData = applyTelemetryPostProcessingToTrajectory(rawReference);
  if (!target.points?.length || !referenceTrajectory.points?.length) {
    throw new DebriefUnavailableError('The replay has no telemetry for one of the two laps.');
  }

  const spec = target.layoutKey ? getCircuitSpecification(target.layoutKey) : undefined;
  const segments = computeLapSegmentComparisons(target.points, referenceTrajectory.points, 6, target.trackLengthM, spec?.nominalWidthM);

  const otherLapNumbers = selectCleanLapCandidates(driver.laps || [])
    .map(l => l.lapNum)
    .filter(n => n !== lapNumber);
  const otherLaps = await Promise.all(otherLapNumbers.map(n =>
    fetchReplayTrajectory(replayName, { resolutionQuery: `maxPoints=${REPEATABILITY_LAP_MAX_POINTS}`, lap: n, driverName: driver.name }, { signal })
      .then((data): CornerConsistencyLapInput => ({ lapNumber: n, points: applyTelemetryPostProcessing(data?.points || []) }))
      .catch((err: unknown): CornerConsistencyLapInput => {
        if (signal?.aborted) throw err;
        return { lapNumber: n, points: [] };
      })
  ));
  const timedLaps = [{ lapNumber, points: target.points }, ...otherLaps.filter(l => l.points.length > 0)];
  const cornerStats = timedLaps.length > 1 ? computeCornerConsistencyStats(timedLaps, target.points, target.trackLengthM) : null;

  const confidence = comparisonConfidence(target, referenceTrajectory);
  return {
    replayName,
    driverName: driver.name,
    lapNumber,
    lapTimeSec: lap.lapTime,
    reference,
    lapDeltaSec: typeof reference.lapTime === 'number' ? Number((lap.lapTime - reference.lapTime).toFixed(3)) : null,
    corners: rankDebriefCorners(segments, cornerStats, confidence),
    lapsTimed: timedLaps.length,
    confidence,
    caveats: describeComparisonCaveats(target, referenceTrajectory),
  };
}

/** The telemetry view on one debrief corner, with the reference lap loaded as the comparison. */
export function debriefCornerLink(debrief: SessionDebrief, cornerNumber: number): string {
  const params = new URLSearchParams({
    replayName: debrief.replayName,
    lap: String(debrief.lapNumber),
    driverName: debrief.driverName,
    baselineReplay: debrief.reference.matchingReplayFile ?? '',
    compareDriver: debrief.reference.driverName,
    compareLapNum: String(debrief.reference.lapNum ?? 1),
    corner: String(cornerNumber),
  });
  if (debrief.reference.sessionId) params.set('compareSessionId', String(debrief.reference.sessionId));
  return `/telemetry?${params.toString()}`;
}
