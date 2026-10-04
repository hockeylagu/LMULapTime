import {hasCompatibleTrackStations} from '../../../../shared/domain/trackGeometry.js';
import type { ComparableLap, DetailedSession, DriverData, LapData, LapTraffic, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { getBestLapNumber, getDisplayTrackName } from '../../../../shared/domain/formatters.js';
import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';
import { selectCleanLapCandidates } from '../../../../shared/domain/lapComparison.js';
import { resolveDriverCarClass } from '../../../../shared/domain/vehicleMapping.js';
import { fetchJson, isAbortError } from '../../../api/apiClient.js';
import { fetchReplayTraffic, fetchReplayTrajectory } from '../../../api/replayApi.js';
import { computeLapSegmentComparisons } from '../../../utils/cornerAnalysis/index.js';
import { computeCornerConsistencyStats, CornerConsistencyLapInput } from '../../../utils/cornerConsistency.js';
import { pickAttainableSameCarLap, pickFastestSameCarLap } from '../../../utils/referenceLaps.js';
import { describeLapTraffic } from '../../../utils/lapTrafficText.js';
import { comparisonConfidence, DebriefCorner, DebriefTraffic, rankDebriefCorners } from '../../../utils/sessionDebrief.js';
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
  /** The realistic reference: about 0.5% faster than the analysed lap. Time loss and ranking are against it. */
  reference: ComparableLap;
  /** The technique reference: the fastest same-car lap, when it is not the reference itself. */
  technique: ComparableLap | null;
  /** Analysed lap time minus the reference lap time (seconds). */
  lapDeltaSec: number | null;
  /** Analysed lap time minus the technique lap time (seconds). */
  techniqueDeltaSec: number | null;
  corners: DebriefCorner[];
  /** Laps of the session timed through each corner for repeatability (the analysed lap included). */
  lapsTimed: number;
  confidence: number;
  caveats: string[];
  /** Whether the replay placed every car on track, so traffic is known corner by corner. */
  trafficKnown: boolean;
}

/** Why the session has no debrief, in words the driver can act on. */
export class DebriefUnavailableError extends Error {}

const deltaTo = (lapTime: number, reference: ComparableLap | null) =>
  reference && typeof reference.lapTime === 'number' ? Number((lapTime - reference.lapTime).toFixed(3)) : null;

/**
 * Who was close to the driver, lap by lap, from the replay; null when the replay cannot tell
 * (then traffic is only known lap by lap, from the parser's flags).
 */
async function loadTraffic(replayName: string, driverName: string, signal?: AbortSignal): Promise<DebriefTraffic | null> {
  try {
    const response = await fetchReplayTraffic(replayName, driverName, { signal });
    return response.available ? new Map(response.laps.map(lap => [lap.lapNumber, lap.spells])) : null;
  } catch (err: unknown) {
    if (isAbortError(err) || signal?.aborted) throw err;
    return null;
  }
}

/**
 * The laps to time for repeatability. When the replay tells where the traffic was, a lap the
 * parser left out for traffic is timed too: only its corners driven with a car close are dropped.
 */
function repeatabilityLaps(laps: LapData[], trafficKnown: boolean): LapData[] {
  const candidates = trafficKnown
    ? laps.map(lap => (lap.nonRepresentativeReason === 'traffic' ? { ...lap, nonRepresentativeReason: undefined } : lap))
    : laps;
  return selectCleanLapCandidates(candidates);
}

/**
 * Compares the driver's best lap of the session with two same-car laps on this layout: a
 * realistic one about 0.5% faster (what to expect to gain, and the ranking) and the fastest
 * there is (how to drive each corner). The laps are loaded exactly as the telemetry view loads
 * them, so a debrief corner opens there with the same numbers; the session's other clean laps
 * are timed through the same corners for repeatability, leaving out passes with traffic.
 */
export async function loadSessionDebrief(session: DetailedSession, driver: DriverData, signal?: AbortSignal): Promise<SessionDebrief> {
  const replayName = session.matchingReplayFile?.name;
  if (!replayName) throw new DebriefUnavailableError('This session has no replay to analyse.');
  const lapNumber = getBestLapNumber(driver);
  const lap = driver.laps?.find(l => l.lapNum === lapNumber);
  if (!lap || !lap.lapTime) throw new DebriefUnavailableError('No timed lap to analyse in this session.');
  // Started first: the first request for a race builds its positions index, the slowest step.
  const trafficRequest = loadTraffic(replayName, driver.name, signal);
  trafficRequest.catch(() => undefined); // awaited below; an early throw here must not leave it unhandled

  const query = new URLSearchParams({
    track: getDisplayTrackName(session.trackVenue, session.trackCourse),
    carModel: driver.carType,
    playerOnly: 'false',
  });
  const carClass = resolveDriverCarClass(driver);
  if (carClass) query.set('carClass', carClass);
  const { laps = [] } = await fetchJson<{ laps?: ComparableLap[] }>(`/api/compare/laps?${query.toString()}`, { signal });
  const analysed = { sessionId: session.id, driverName: driver.name, lapNum: lapNumber, carType: driver.carType, lapTime: lap.lapTime };
  const fastest = pickFastestSameCarLap(laps, analysed);
  const reference = pickAttainableSameCarLap(laps, analysed) ?? fastest;
  if (!reference?.matchingReplayFile) {
    throw new DebriefUnavailableError(`No other ${driver.carType} lap with replay data on this layout to compare with yet.`);
  }
  const technique = fastest && fastest !== reference && (fastest.lapTime as number) < (reference.lapTime as number) ? fastest : null;

  const resolutionQuery = trajectoryResolutionQuery(DEFAULT_TELEMETRY_RESOLUTION);
  const loadLap = (ref: ComparableLap) =>
    fetchReplayTrajectory(ref.matchingReplayFile as string, { resolutionQuery, lap: ref.lapNum, driverName: ref.driverName }, { signal })
      .then(applyTelemetryPostProcessingToTrajectory);
  const [target, referenceTrajectory, techniqueTrajectory, traffic] = await Promise.all([
    fetchReplayTrajectory(replayName, { resolutionQuery, lap: lapNumber, driverName: driver.name }, { signal }).then(applyTelemetryPostProcessingToTrajectory),
    loadLap(reference),
    technique ? loadLap(technique) : Promise.resolve(null),
    trafficRequest,
  ]);
  if (!target.points?.length || !referenceTrajectory.points?.length) {
    throw new DebriefUnavailableError('The replay has no telemetry for one of the two laps.');
  }

  if (!hasCompatibleTrackStations(target, referenceTrajectory)) {
    throw new DebriefUnavailableError('Detailed local track data is required for corner analysis.');
  }
  const spec = target.layoutKey ? getCircuitSpecification(target.layoutKey) : undefined;
  const compare = (other: ReplayTrajectoryData) =>
    computeLapSegmentComparisons(target.points, other.points, 6, target.trackLengthM, spec?.nominalWidthM);
  const segments = compare(referenceTrajectory);
  const techniqueSegments = techniqueTrajectory?.points?.length && hasCompatibleTrackStations(target, techniqueTrajectory) ? compare(techniqueTrajectory) : undefined;

  const otherLapNumbers = repeatabilityLaps(driver.laps || [], traffic !== null)
    .map(l => l.lapNum)
    .filter(n => n !== lapNumber);
  const otherLaps = await Promise.all(otherLapNumbers.map(n =>
    fetchReplayTrajectory(replayName, { resolutionQuery: `maxPoints=${REPEATABILITY_LAP_MAX_POINTS}`, lap: n, driverName: driver.name }, { signal })
      .then((data): CornerConsistencyLapInput => ({ lapNumber: n, points: hasCompatibleTrackStations(target, data) ? applyTelemetryPostProcessing(data?.points || []) : [] }))
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
    technique,
    lapDeltaSec: deltaTo(lap.lapTime, reference),
    techniqueDeltaSec: deltaTo(lap.lapTime, technique),
    corners: rankDebriefCorners(segments, cornerStats, confidence, undefined, { technique: techniqueSegments, traffic, lapNumber }),
    lapsTimed: timedLaps.length,
    confidence,
    // With the replay's traffic, each corner says whether a car was close; otherwise warn for the lap.
    caveats: [...describeComparisonCaveats(target, referenceTrajectory), ...(traffic ? [] : describeLapTrafficCaveat(lap.traffic))],
    trafficKnown: traffic !== null,
  };
}

/** A best lap run in traffic is not a clean read: a tow flatters the straights and a pass costs corners. */
function describeLapTrafficCaveat(traffic: LapTraffic | undefined): string[] {
  const events = describeLapTraffic(traffic);
  return events.length > 0 ? [`Your lap was run in traffic (${events.join('; ')}): a tow or a pass changes the numbers.`] : [];
}

/**
 * The telemetry view on one debrief corner, with the realistic reference (or, for `technique`,
 * the fastest lap) loaded as the comparison lap.
 */
export function debriefCornerLink(debrief: SessionDebrief, cornerNumber: number, against: 'reference' | 'technique' = 'reference'): string {
  const lap = against === 'technique' && debrief.technique ? debrief.technique : debrief.reference;
  const params = new URLSearchParams({
    replayName: debrief.replayName,
    lap: String(debrief.lapNumber),
    driverName: debrief.driverName,
    baselineReplay: lap.matchingReplayFile ?? '',
    compareDriver: lap.driverName,
    compareLapNum: String(lap.lapNum ?? 1),
    corner: String(cornerNumber),
  });
  if (lap.sessionId) params.set('compareSessionId', String(lap.sessionId));
  return `/telemetry?${params.toString()}`;
}
