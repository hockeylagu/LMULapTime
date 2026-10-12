import type { DetailedSession, DriverData, LapData } from '../../types/index.js';
import type { SessionSummaryProjection, SessionDriverProjection, SessionLapProjection, SessionConditionProjection } from '../../types/sessionSummaries.js';
import { SESSION_SUMMARY_PROJECTION_VERSION } from '../../types/sessionSummaries.js';
import { CIRCUIT_SPECIFICATIONS } from '../circuitDefinitions.js';
import { getCircuitSpecification } from '../circuitSpecs.js';
import { lapConditionGroup } from '../lapConditions.js';
import { computeConsistencyRating, computeTopNLapAverage, selectCleanLapCandidates } from '../lapComparison.js';
import { isOnlineSession } from '../leaderboard.js';
import { isSessionEmpty } from '../formatters.js';
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
  const cleanSet = new Set(clean);
  const consistency = computeConsistencyRating(driverLaps, clean);
  const laps = driverLaps.map((lap, lapOrdinal): SessionLapProjection => {
    const isClean = cleanSet.has(lap);
    const conditionGroup = lapConditionGroup(lap);
    const eligible = isClean && lap.isValid && conditionGroup === 'dry';
    return { sessionId: session.id, driverOrdinal, lapOrdinal, lapNumber: lap.lapNum, lapTime: lap.lapTime,
      s1: lap.s1, s2: lap.s2, s3: lap.s3, conditionGroup, isValid: lap.isValid,
      isInferred: Boolean(lap.isInferred), isPitStop: lap.isPitStop, isOutLap: Boolean(lap.isOutLap), isClean,
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
    isPlayer, isHuman, carClass: driver.carClass ?? '', carType: driver.carType ?? '',
    position: driver.position ?? 0, lapsCount: completedCount, declaredLapsCount: lapsCount, cleanLapsCount: cleanCount,
    drivingTimeSeconds: hasLaps ? driverLaps.reduce((sum, lap) => sum + (lap.lapTime && lap.lapTime > 0 ? lap.lapTime : 0), 0) : (driver.avgLapTime ?? 0) * completedCount,
    pitStopsCount: hasLaps ? driverLaps.filter(lap => lap.isPitStop).length : 0,
    maxTopSpeed: driverLaps.reduce<number | null>((value, lap) => lap.topSpeed !== null && (value === null || lap.topSpeed > value) ? lap.topSpeed : value, null),
    bestLapOrdinal: bestOrdinal(best), bestLapNumber: best?.lapNum ?? null, bestLapTime: driver.bestLapTime ?? null,
    bestS1: driver.bestS1, bestS2: driver.bestS2, bestS3: driver.bestS3,
    averageLapTime: hasLaps ? consistency.avgLapTime : (driver.avgLapTime ?? null),
    top3Average: computeTopNLapAverage(driverLaps, 3, clean), consistencyScore: consistency.consistencyScore,
    bestLapWet: Boolean(driver.bestLapWet ?? best?.conditions) }, laps, conditions };
}

export function buildSessionSummaryProjection(session: DetailedSession, sourceRevision: number): SessionSummaryProjection {
  const markedPlayers = session.drivers.flatMap((driver, ordinal) => driver.isPlayer ? [ordinal] : []);
  const playerOrdinal = markedPlayers.length === 1 ? markedPlayers[0] : -1;
  const primary = playerOrdinal >= 0 ? playerOrdinal : session.drivers.length ? 0 : -1;
  const drivers = session.drivers.map((driver, ordinal) => projectDriver(session, driver, ordinal, playerOrdinal));
  const driverProjections = drivers.map(value => value.driver);
  const conditionProjections = drivers.flatMap(value => value.conditions);
  const lapProjections = drivers.flatMap(value => value.laps);
  const recordingName = typeof session.matchingReplayFile === 'string' ? session.matchingReplayFile : session.matchingReplayFile?.name ?? null;
  const layout = getCircuitSpecification(session.trackVenue, session.trackCourse, null, recordingName, null, session.trackLengthMeters);
  return { sessionId: session.id, sourceRevision, projectionVersion: SESSION_SUMMARY_PROJECTION_VERSION,
    layoutKey: Object.prototype.hasOwnProperty.call(CIRCUIT_SPECIFICATIONS, layout.layoutKey) ? layout.layoutKey : 'unknown',
    sessionKind: session.sessionType === 'Practice' || session.sessionType === 'Qualifying' || session.sessionType === 'Race'
      ? session.sessionType.toLowerCase() : 'unknown', isEmpty: isSessionEmpty(session),
    primaryDriverOrdinal: primary >= 0 ? primary : null, recordingName,
    drivers: driverProjections, conditions: conditionProjections, laps: lapProjections,
    aggregate: buildSessionAggregate(session, driverProjections, lapProjections, primary) };
}
