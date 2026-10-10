import type { DetailedSession, DriverData, LapData } from '../../types/index.js';
import type { SessionSummaryProjection, SessionDriverProjection, SessionLapProjection, SessionConditionProjection } from '../../types/sessionSummaries.js';
import { SESSION_SUMMARY_PROJECTION_VERSION } from '../../types/sessionSummaries.js';
import { CIRCUIT_SPECIFICATIONS, getCircuitSpecification } from '../circuitSpecs.js';
import { lapConditionGroup } from '../lapConditions.js';
import { computeConsistencyRating, computeTopNLapAverage, selectCleanLapCandidates } from '../lapComparison.js';
import { driverClass, isOnlineSession } from '../leaderboard.js';
import { isSessionEmpty, matchesSessionType } from '../formatters.js';
import { buildSessionAggregate } from './buildSessionAggregate.js';

function projectDriver(session: DetailedSession, driver: DriverData, driverOrdinal: number, playerOrdinal: number): { driver: SessionDriverProjection; laps: SessionLapProjection[]; conditions: SessionConditionProjection[] } {
  const driverLaps = driver.laps ?? [];
  const lapsCount = driver.lapsCount ?? 0;
  const hasLaps = driverLaps.length > 0;
  const completedCount = hasLaps ? driverLaps.filter(lap => lap.lapTime !== null && lap.lapTime > 0).length : lapsCount;
  const clean = hasLaps ? selectCleanLapCandidates(driverLaps) : [];
  const cleanCount = hasLaps ? clean.length : (driver.avgLapTime && lapsCount > 0 ? lapsCount : 0);
  const isPlayer = driverOrdinal === playerOrdinal;
  const isHuman = isOnlineSession(session) || isPlayer;
  const bestOrdinal = (lap: LapData | undefined) => lap ? driverLaps.indexOf(lap) : null;
  const best = driverLaps.find(l => l.lapNum === driver.bestLapNum) ?? (driver.bestLapTime ? driverLaps.find(l => l.lapTime === driver.bestLapTime) : undefined);
  const consistency = computeConsistencyRating(driverLaps);
  const laps = driverLaps.map((lap, lapOrdinal): SessionLapProjection => {
    const isClean = clean.includes(lap);
    const eligible = isClean && lap.isValid && lapConditionGroup(lap) === 'dry';
    return { sessionId: session.id, driverOrdinal, lapOrdinal, lapNumber: lap.lapNum, lapTime: lap.lapTime,
      s1: lap.s1, s2: lap.s2, s3: lap.s3, conditionGroup: lapConditionGroup(lap), isValid: lap.isValid,
      isInferred: Boolean(lap.isInferred), isPitLap: lap.isPitStop, isOutLap: Boolean(lap.isOutLap), isClean,
      isRepresentative: !lap.nonRepresentativeReason, isHuman, leaderboardEligible: eligible,
      nonRepresentativeReason: lap.nonRepresentativeReason ?? null };
  });
  const conditions: SessionConditionProjection[] = (['dry', 'wet'] as const).map(group => {
    const eligible = clean.filter(l => lapConditionGroup(l) === group);
    const times = eligible.map(l => l.lapTime as number).sort((a, b) => a - b);
    const groupBest = eligible.reduce<LapData | undefined>((acc, lap) => !acc || (lap.lapTime ?? Infinity) < (acc.lapTime ?? Infinity) ? lap : acc, undefined);
    const min = (key: 's1' | 's2' | 's3') => eligible.reduce<number | null>((value, lap) => lap[key] !== null && (lap[key] as number) > 0 && (value === null || (lap[key] as number) < value) ? lap[key] : value, null);
    return { sessionId: session.id, driverOrdinal, conditionGroup: group, cleanCount: times.length,
      cleanTimeSum: times.reduce((a, b) => a + b, 0), cleanTimeSquareSum: times.reduce((a, b) => a + b * b, 0),
      bestLapOrdinal: bestOrdinal(groupBest), bestLapTime: groupBest?.lapTime ?? null, bestS1: min('s1'), bestS2: min('s2'), bestS3: min('s3'),
      fastestThreeCount: Math.min(3, times.length), fastestThreeTimeSum: times.slice(0, 3).reduce((a, b) => a + b, 0) };
  }).filter(group => group.cleanCount > 0);
  const driverName = driver.name ?? '';
  return { driver: { sessionId: session.id, driverOrdinal, driverName, normalizedName: driverName.trim().toLowerCase(),
    isPlayer, isHuman, carClass: driverClass(driver) ?? '', carType: driver.carType ?? '',
    position: driver.position ?? 0, lapsCount: completedCount, declaredLapsCount: lapsCount, cleanLapsCount: cleanCount,
    drivingTimeSum: hasLaps ? driverLaps.reduce((sum, lap) => sum + (lap.lapTime && lap.lapTime > 0 ? lap.lapTime : 0), 0) : (driver.avgLapTime ?? 0) * completedCount,
    pitCount: hasLaps ? driverLaps.filter(lap => lap.isPitStop).length : 0,
    maxSpeed: driverLaps.reduce<number | null>((value, lap) => lap.topSpeed !== null && (value === null || lap.topSpeed > value) ? lap.topSpeed : value, null),
    bestLapOrdinal: bestOrdinal(best), bestLapNumber: best?.lapNum ?? null, bestLapTime: driver.bestLapTime ?? null,
    bestS1: driver.bestS1, bestS2: driver.bestS2, bestS3: driver.bestS3,
    averageLapTime: hasLaps ? (clean.length ? Number((clean.reduce((sum, lap) => sum + (lap.lapTime ?? 0), 0) / clean.length).toFixed(3)) : null) : (driver.avgLapTime ?? null),
    topThreeAverage: computeTopNLapAverage(driverLaps, 3), consistencyScore: consistency.consistencyScore,
    bestLapWet: Boolean(driver.bestLapWet ?? best?.conditions) }, laps, conditions };
}

export function buildSessionSummaryProjection(session: DetailedSession, sourceRevision: number): SessionSummaryProjection {
  const playerMarkedOrdinal = session.drivers.findIndex(driver => driver.isPlayer);
  const namedPlayerOrdinal = session.playerDriver ? session.drivers.findIndex(driver => driver.name === session.playerDriver?.name) : -1;
  const playerOrdinal = playerMarkedOrdinal >= 0 ? playerMarkedOrdinal : namedPlayerOrdinal;
  const primary = playerOrdinal >= 0 ? playerOrdinal : session.drivers.length ? 0 : -1;
  const drivers = session.drivers.map((driver, ordinal) => projectDriver(session, driver, ordinal, playerOrdinal));
  const recordingName = typeof session.matchingReplayFile === 'string' ? session.matchingReplayFile : session.matchingReplayFile?.name ?? null;
  const layout = getCircuitSpecification(session.trackVenue, session.trackCourse, null, recordingName, null, session.trackLengthMeters);
  return { sessionId: session.id, sourceRevision, projectionVersion: SESSION_SUMMARY_PROJECTION_VERSION,
    layoutKey: Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, layout.layoutKey) ? layout.layoutKey : 'unknown',
    sessionKind: ['Practice', 'Qualifying', 'Race'].find(kind => matchesSessionType(session.sessionType, session.sessionName, kind))?.toLowerCase() ?? 'unknown', isEmpty: isSessionEmpty(session),
    primaryDriverOrdinal: primary >= 0 ? primary : null, recordingName,
    drivers: drivers.map(value => value.driver), conditions: drivers.flatMap(value => value.conditions), laps: drivers.flatMap(value => value.laps),
    aggregate: buildSessionAggregate(session, drivers.map(value => value.driver), drivers.flatMap(value => value.laps), primary) };
}
