import type { ComparableLap, DetailedSession, DriverData, LapData } from '../../../../shared/types/index.js';
import type { CornerPass, SessionCornerPasses } from '../../../../shared/types/corners/cornerPasses.js';
import { getBestLapNumber, getDisplayTrackName } from '../../../../shared/domain/formatters.js';
import { selectCleanLapCandidates } from '../../../../shared/domain/lapComparison.js';
import { resolveDriverCarClass } from '../../../../shared/domain/vehicleMapping.js';
import { fetchJson, isAbortError } from '../../../api/apiClient.js';
import { fetchSessionCornerPasses, fetchSessionTelemetry } from '../../../api/replayApi.js';
import { computeLapSegmentComparisons } from '../../../utils/cornerAnalysis/segmentComparisons.js';
import { getTrajectoryDistances } from '../../../utils/lapAlignment.js';
import { lapDistanceAtStation } from '../../../utils/cornerConsistency.js';
import { pickReferenceLaps } from '../../../utils/referenceLaps.js';
import { DebriefCorner, passTrafficSpell, rankTurnCorners } from '../../../utils/sessionDebrief.js';
import { applyTelemetryPostProcessingToTrajectory } from '../../../utils/telemetryPostProcessing.js';
import { DEFAULT_TELEMETRY_RESOLUTION, trajectoryResolutionQuery } from '../../replay/telemetry/telemetryResolution.js';

export interface SessionDebrief {
  sessionId: string;
  driverOrdinal: number;
  lapOrdinal: number;
  driverName: string;
  lapNumber: number;
  lapTimeSec: number | null;
  /** The realistic reference: about 0.5% faster than the analysed lap. Time loss and ranking are against it. */
  reference: ComparableLap;
  /** The technique reference: the fastest lap, when it is not the reference itself. */
  technique: ComparableLap | null;
  /** `class`: no lap in the driver's car was clearly faster, so both references are other cars of the class in this session. */
  pool: 'car' | 'class';
  /** Analysed lap time minus the reference lap time (seconds). */
  lapDeltaSec: number | null;
  /** Analysed lap time minus the technique lap time (seconds). */
  techniqueDeltaSec: number | null;
  corners: DebriefCorner[];
  /** Laps of the session whose passes count for repeatability (the analysed lap included). */
  lapsTimed: number;
  caveats: string[];
}

/** Why the session has no debrief, in words the driver can act on. */
export class DebriefUnavailableError extends Error {}

const deltaTo = (lapTime: number, reference: ComparableLap | null) =>
  reference && typeof reference.lapTime === 'number' ? Number((lapTime - reference.lapTime).toFixed(3)) : null;

/**
 * The laps whose passes count for repeatability: the clean laps, and the laps the parser left out for traffic
 * (the passes know where the traffic was: only those with a car close in front drop out).
 */
function repeatabilityLaps(laps: LapData[]): LapData[] {
  return selectCleanLapCandidates(laps.map(lap => (lap.nonRepresentativeReason === 'traffic' ? { ...lap, nonRepresentativeReason: undefined } : lap)));
}

/** This session's laps in the driver's class, any car, as comparison laps. */
function sessionClassLaps(session: DetailedSession, carClass: string | null): ComparableLap[] {
  if (!carClass) return [];
  return session.drivers.flatMap((driver, driverOrdinal) => resolveDriverCarClass(driver) !== carClass ? [] :
    driver.laps.map((lap, lapOrdinal): ComparableLap => ({
      ...lap,
      id: `${session.id}_${driverOrdinal}_${lap.lapNumber}`,
      sessionId: session.id,
      driverOrdinal,
      lapOrdinal,
      sessionType: session.sessionType,
      timeString: session.timeString,
      driverName: driver.name,
      carType: driver.carType,
      carClass,
      matchingReplayFile: session.matchingReplayFile?.name,
    })));
}

type BuiltPasses = Extract<SessionCornerPasses, { available: true }>;

/** A comparison lap's passes, from its session's corner passes. */
async function lapPasses(lap: ComparableLap, signal?: AbortSignal): Promise<CornerPass[]> {
  const response = await fetchSessionCornerPasses(lap.sessionId as string, lap.driverOrdinal, { signal });
  if (!response.available) throw new DebriefUnavailableError(`The reference lap's session: ${response.reason}`);
  return response.passes.filter(pass => pass.lapNumber === lap.lapNumber);
}

/**
 * The corner the analysed lap's own detection finds at each turn (where a debrief corner opens in telemetry):
 * null when the lap has no track stations or no corner holds the turn's apex.
 */
async function cornerFinder(session: DetailedSession, driverOrdinal: number, lapOrdinal: number, passes: BuiltPasses, signal?: AbortSignal) {
  const resolutionQuery = trajectoryResolutionQuery(DEFAULT_TELEMETRY_RESOLUTION);
  try {
    const target = applyTelemetryPostProcessingToTrajectory(await fetchSessionTelemetry(session.id, { resolutionQuery, driverOrdinal, lapOrdinal }, { signal }));
    const points = target.points ?? [];
    const dists = getTrajectoryDistances(points, target.trackLengthM);
    const corners = computeLapSegmentComparisons(points, points, 6, target.trackLengthM)
      .flatMap(segment => segment.type === 'corner' ? [segment] : []);
    return (turn: { apexM: number }) => {
      const station = ((passes.startStationM + turn.apexM) % passes.trackLengthM + passes.trackLengthM) % passes.trackLengthM;
      const distM = lapDistanceAtStation(points, dists, station);
      return distM === null ? null : corners.find(c => c.entryDistM <= distM && distM <= c.exitDistM)?.cornerNumber ?? null;
    };
  } catch (err: unknown) {
    if (isAbortError(err) || signal?.aborted) throw err;
    return () => null;
  }
}

/**
 * Compares the driver's best lap of the session with two same-car laps on this layout, turn by official turn,
 * from the corner passes: a realistic one about 0.5% faster (what to expect to gain, and the ranking) and the
 * fastest there is (how to drive each turn). When no same-car lap is clearly faster, both come from the other
 * cars of the class in this session. The session's other passes give the repeatability, leaving out passes
 * with a car close in front.
 */
export async function loadSessionDebrief(session: DetailedSession, driver: DriverData, signal?: AbortSignal): Promise<SessionDebrief> {
  if (!session.matchingReplayFile) throw new DebriefUnavailableError('This session has no replay to analyse.');
  const lapNumber = getBestLapNumber(driver);
  const lap = driver.laps?.find(l => l.lapNumber === lapNumber);
  if (!lap || !lap.lapTime) throw new DebriefUnavailableError('No timed lap to analyse in this session.');
  const driverOrdinal = session.drivers.findIndex(item => item === driver ||
    item.name.trim().toLowerCase() === driver.name.trim().toLowerCase());
  const lapOrdinal = driverOrdinal >= 0 ? session.drivers[driverOrdinal].laps.findIndex(item => item.lapNumber === lapNumber) : -1;
  if (driverOrdinal < 0 || lapOrdinal < 0) throw new DebriefUnavailableError('The selected driver or lap is unavailable in this session.');

  // Every car's passes: the driver's own, and the cars they met (their laps tell a battle from a lapping).
  const ownRequest = fetchSessionCornerPasses(session.id, undefined, { signal });
  ownRequest.catch(() => undefined); // awaited below; an early throw here must not leave it unhandled
  const query = new URLSearchParams({
    track: getDisplayTrackName(session.trackVenue, session.trackCourse),
    carType: driver.carType,
    playerOnly: 'false',
  });
  const carClass = resolveDriverCarClass(driver);
  if (carClass) query.set('carClass', carClass);
  const { laps = [] } = await fetchJson<{ laps?: ComparableLap[] }>(`/api/compare/laps?${query.toString()}`, { signal });
  const analysed = { sessionId: session.id, driverName: driver.name, lapNumber, carType: driver.carType, lapTime: lap.lapTime };
  const { reference, technique, pool } = pickReferenceLaps(laps, sessionClassLaps(session, carClass), analysed);
  if (!reference?.sessionId || reference.driverOrdinal === undefined || reference.lapOrdinal === undefined) {
    throw new DebriefUnavailableError(`No other ${driver.carType} lap with replay data on this layout to compare with yet.`);
  }

  const own = await ownRequest;
  if (!own.available) throw new DebriefUnavailableError(own.reason);
  const slot = own.cars.find(car => car.sessionDriverOrdinal === driverOrdinal)?.slot;
  if (slot === undefined) throw new DebriefUnavailableError('The driver is not in this session replay.');
  const [referencePasses, techniquePasses, cornerNumberAt] = await Promise.all([
    lapPasses(reference, signal),
    technique?.sessionId && technique.driverOrdinal !== undefined ? lapPasses(technique, signal) : Promise.resolve(null),
    cornerFinder(session, driverOrdinal, lapOrdinal, own, signal),
  ]);
  const passes = own.passes.filter(pass => pass.slot === slot);
  if (!passes.some(pass => pass.lapNumber === lapNumber)) throw new DebriefUnavailableError('The replay has no passes for your best lap.');
  if (referencePasses.length === 0) throw new DebriefUnavailableError('The replay has no passes for the reference lap.');

  const repeatLaps = new Set(repeatabilityLaps(driver.laps || []).map(l => l.lapNumber));
  repeatLaps.add(lapNumber);
  return {
    sessionId: session.id,
    driverOrdinal,
    lapOrdinal,
    driverName: driver.name,
    lapNumber,
    lapTimeSec: lap.lapTime,
    reference,
    technique,
    pool,
    lapDeltaSec: deltaTo(lap.lapTime, reference),
    techniqueDeltaSec: deltaTo(lap.lapTime, technique),
    corners: rankTurnCorners({
      turns: own.turns, passes, lapNumber, repeatLaps, reference: referencePasses, technique: techniquePasses,
      trafficOf: (pass, turn) => passTrafficSpell(pass, turn, own.cars, own.passes),
      cornerNumberAt,
    }),
    lapsTimed: new Set(passes.filter(pass => repeatLaps.has(pass.lapNumber)).map(pass => pass.lapNumber)).size,
    caveats: pool === 'class'
      ? [`No ${driver.carType} lap on this layout is clearly faster, so the references are faster ${carClass} cars from this session: part of each gap can be the car.`]
      : [],
  };
}

/**
 * The telemetry view on one debrief corner, with the realistic reference (or, for `technique`,
 * the fastest lap) loaded as the comparison lap. Without a matching corner it opens the lap.
 */
export function debriefCornerLink(debrief: SessionDebrief, cornerNumber: number | null, against: 'reference' | 'technique' = 'reference'): string {
  const lap = against === 'technique' && debrief.technique ? debrief.technique : debrief.reference;
  const params = new URLSearchParams({
    sessionId: debrief.sessionId,
    driverOrdinal: String(debrief.driverOrdinal),
    lapOrdinal: String(debrief.lapOrdinal),
    baselineSessionId: lap.sessionId ?? '',
    baselineDriverOrdinal: String(lap.driverOrdinal ?? ''),
    baselineLapOrdinal: String(lap.lapOrdinal ?? ''),
    compareDriver: lap.driverName,
    ...(cornerNumber === null ? {} : { corner: String(cornerNumber) }),
    view: '2d',
  });
  return `/telemetry?${params.toString()}`;
}
