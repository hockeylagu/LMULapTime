import {
  DetailedSession,
  DriverData,
  ComparableLap,
  LapData,
} from '../../shared/types/index.js';
import { selectCleanLapCandidates } from '../../shared/domain/lapComparison.js';

export const computeAverageLapTime = (laps: LapData[]): number | null => {
  const candidates = selectCleanLapCandidates(laps);
  if (candidates.length === 0) return null;
  const sum = candidates.reduce((acc, l) => acc + (l.lapTime || 0), 0);
  return parseFloat((sum / candidates.length).toFixed(3));
};

/**
 * Projects raw session, driver, and lap data into a standardized ComparableLap domain model.
 */
export function toComparableLap(
  session: Pick<DetailedSession, 'id' | 'sessionName' | 'sessionType' | 'timeString' | 'timestamp' | 'matchingReplayFile'> & Partial<Pick<DetailedSession, 'drivers'>>,
  driver: Pick<DriverData, 'name' | 'carType' | 'carClass' | 'driverOrdinal'> & Partial<Pick<DriverData, 'laps'>>,
  lap: LapData,
  overrides?: Partial<ComparableLap>
): ComparableLap {
  const replayFile = typeof session.matchingReplayFile === 'string'
    ? session.matchingReplayFile
    : session.matchingReplayFile?.name;
  const driverOrdinal = driver.driverOrdinal ?? session.drivers?.findIndex(candidate => candidate === driver) ?? -1;
  const lapOrdinal = lap.lapOrdinal ?? driver.laps?.indexOf(lap) ?? -1;

  return {
    id: driverOrdinal >= 0 && lapOrdinal >= 0
      ? `${session.id}_driver_${driverOrdinal}_lap_${lapOrdinal}`
      : `${session.id}_${driver.name}_lap_${lap.lapNumber}`,
    sessionId: session.id,
    sessionName: session.sessionName,
    sessionType: session.sessionType,
    timeString: session.timeString,
    timestamp: session.timestamp,
    driverName: driver.name,
    carType: driver.carType,
    carClass: driver.carClass || 'General',
    lapNumber: lap.lapNumber,
    lapTime: lap.lapTime,
    s1: lap.s1,
    s2: lap.s2,
    s3: lap.s3,
    topSpeed: lap.topSpeed,
    fCompound: lap.fCompound,
    rCompound: lap.rCompound,
    flCompound: lap.flCompound,
    frCompound: lap.frCompound,
    rlCompound: lap.rlCompound,
    rrCompound: lap.rrCompound,
    tireWear: lap.tireWear,
    fuel: lap.fuel,
    fuelUsed: lap.fuelUsed,
    virtualEnergy: lap.virtualEnergy,
    virtualEnergyUsed: lap.virtualEnergyUsed,
    elapsedSeconds: lap.elapsedSeconds,
    isPitStop: lap.isPitStop,
    pitStopDuration: lap.pitStopDuration,
    isOutLap: lap.isOutLap || false,
    nonRepresentativeReason: lap.nonRepresentativeReason,
    isValid: lap.isValid,
    isInferred: lap.isInferred || false,
    paceCategory: lap.paceCategory || null,
    pacePercentage: lap.pacePercentage || null,
    matchingReplayFile: replayFile,
    hasRain: typeof session.matchingReplayFile === 'object' ? session.matchingReplayFile?.hasRain : undefined,
    weatherCondition: typeof session.matchingReplayFile === 'object' ? session.matchingReplayFile?.weatherCondition : undefined,
    ...(driverOrdinal >= 0 ? { driverOrdinal } : {}),
    ...(lapOrdinal >= 0 ? { lapOrdinal } : {}),
    ...overrides,
  };
}

export interface ComparableLapsResult {
  laps: ComparableLap[];
  allTimeBestLap: ComparableLap | null;
  playerBestLap?: ComparableLap | null;
  overallTrackBestLap: ComparableLap | null;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBestSec: number | null;
  sessionsCount: number;
}
