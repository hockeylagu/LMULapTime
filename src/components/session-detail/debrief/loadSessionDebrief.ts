import type { ComparableLap, DetailedSession, DriverData } from '../../../../shared/types/index.js';
import type { CornerPass, CornerPassCar, CornerSegmentKind, CornerTurn, SessionCornerPasses } from '../../../../shared/types/corners/cornerPasses.js';
import { getBestLapNumber, getDisplayTrackName } from '../../../../shared/domain/formatters.js';
import { lapCounts } from '../../replay/cornerCard/cornerInsight.js';
import { resolveDriverCarClass } from '../../../../shared/domain/vehicleMapping.js';
import { fetchJson } from '../../../api/apiClient.js';
import { loadLayoutCorners } from '../../../api/cornerSequenceApi.js';
import { fetchSessionCornerPasses, fetchSessionSequencePasses } from '../../../api/replayApi.js';
import { pickReferenceLaps } from '../../../utils/referenceLaps.js';
import { DebriefCorner, passTrafficSpell, rankTurnCorners } from '../../../utils/sessionDebrief.js';

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
  /** What the corners are: the class's sequences, or the official turns when the class has no map here. */
  segments: CornerSegmentKind;
  corners: DebriefCorner[];
  /** Laps of the session whose passes count for repeatability (the analysed lap included). */
  lapsTimed: number;
  caveats: string[];
}

/** Why the session has no debrief, in words the driver can act on. */
export class DebriefUnavailableError extends Error {}

const deltaTo = (lapTime: number, reference: ComparableLap | null) =>
  reference && typeof reference.lapTime === 'number' ? Number((lapTime - reference.lapTime).toFixed(3)) : null;

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

const fetchPasses = (segments: CornerSegmentKind) => (segments === 'sequences' ? fetchSessionSequencePasses : fetchSessionCornerPasses);
const heldTurns = (turn: CornerTurn) => (turn.sequence?.turnIds ?? [turn.id]).join(',');
/** A car's corners: its class's sequences (another class's ids name other corners), or every official turn. */
const classTurns = (passes: BuiltPasses, car: CornerPassCar | undefined) =>
  passes.turns.filter(turn => !turn.sequence || turn.sequence.carClass === car?.carClass);

/**
 * A comparison lap's passes, from its session's corner passes of the same kind: only those through a corner holding
 * the same turns as the analysed driver's (a sequence map regenerated in between may group them otherwise).
 */
async function lapPasses(lap: ComparableLap, segments: CornerSegmentKind, turns: CornerTurn[], signal?: AbortSignal): Promise<CornerPass[]> {
  const response = await fetchPasses(segments)(lap.sessionId as string, lap.driverOrdinal, { signal });
  if (!response.available) throw new DebriefUnavailableError(`The reference lap's session: ${response.reason}`);
  const own = new Map(turns.map(turn => [turn.id, heldTurns(turn)]));
  const car = response.cars.find(item => item.sessionDriverOrdinal === lap.driverOrdinal);
  const theirs = new Map(classTurns(response, car).map(turn => [turn.id, heldTurns(turn)]));
  return response.passes.filter(pass => pass.lapNumber === lap.lapNumber && own.get(pass.segment) === theirs.get(pass.segment));
}

/**
 * Every car's passes of the session, through the driver's class sequences (its corners as the class drives them);
 * through the official turns when the class has no map on this layout yet.
 */
async function sessionPasses(sequences: Promise<SessionCornerPasses>, sessionId: string, driverOrdinal: number, signal?: AbortSignal) {
  const ofDriver = (passes: SessionCornerPasses) => {
    if (!passes.available) return null;
    const car = passes.cars.find(item => item.sessionDriverOrdinal === driverOrdinal);
    const turns = classTurns(passes, car);
    return car && turns.length ? { passes, slot: car.slot, turns } : null;
  };
  const bySequence = ofDriver(await sequences);
  if (bySequence) return { ...bySequence, segments: 'sequences' as const };
  const own = await fetchSessionCornerPasses(sessionId, undefined, { signal });
  if (!own.available) throw new DebriefUnavailableError(own.reason);
  const byTurn = ofDriver(own);
  if (!byTurn) throw new DebriefUnavailableError('The driver is not in this session replay.');
  return { ...byTurn, segments: 'turns' as const };
}

/**
 * Where a debrief corner opens in telemetry: the lap view numbers the layout's corners for the class in their order on
 * the track. Null when the lap view shows other corners (a map changed since the passes were built).
 */
async function cornerNumbers(passes: BuiltPasses, carClass: string, segments: CornerSegmentKind) {
  const layout = await loadLayoutCorners(passes.layoutKey, carClass);
  if (!layout || layout.kind !== segments) return () => null;
  const order = [...layout.corners].sort((a, b) => a.startM - b.startM).map(corner => corner.id);
  return (turn: CornerTurn) => {
    const index = order.indexOf(turn.id);
    return index < 0 ? null : index + 1;
  };
}

/**
 * Compares the driver's best lap of the session with two same-car laps on this layout, corner by corner (the class's
 * sequences, else the official turns), from the corner passes: a realistic one about 0.5% faster (what to expect to gain, and the ranking) and the
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
  const ownRequest = fetchSessionSequencePasses(session.id, undefined, { signal });
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

  const { passes: own, slot, turns, segments } = await sessionPasses(ownRequest, session.id, driverOrdinal, signal);
  const [referencePasses, techniquePasses, cornerNumberAt] = await Promise.all([
    lapPasses(reference, segments, turns, signal),
    technique?.sessionId && technique.driverOrdinal !== undefined ? lapPasses(technique, segments, turns, signal) : Promise.resolve(null),
    cornerNumbers(own, carClass, segments),
  ]);
  const passes = own.passes.filter(pass => pass.slot === slot);
  if (!passes.some(pass => pass.lapNumber === lapNumber)) throw new DebriefUnavailableError('The replay has no passes for your best lap.');
  if (referencePasses.length === 0) throw new DebriefUnavailableError('The replay has no passes for the reference lap.');

  // The laps the corner card counts, in the analysed lap's conditions (traffic laps count: only passes with a car close in front drop out).
  const ownLaps = own.laps.filter(item => item.slot === slot);
  const wet = ownLaps.find(item => item.lapNumber === lapNumber)?.wet ?? false;
  const repeatLaps = new Set(ownLaps.filter(item => lapCounts(item) && item.wet === wet).map(item => item.lapNumber));
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
    segments,
    corners: rankTurnCorners({
      turns, passes, lapNumber, repeatLaps, reference: referencePasses, technique: techniquePasses,
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
