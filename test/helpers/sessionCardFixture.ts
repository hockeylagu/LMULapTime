import type { SessionCard } from '../../shared/types/sessionSummaries.js';
import type { DetailedSession, DriverData } from '../../shared/types/session.js';
import type { LapData } from '../../shared/types/session.js';
import { parseDateStringToTimestamp } from '../../shared/domain/formatters.js';

type SessionCardOverrides = Omit<Partial<SessionCard>, 'playerDriver' | 'matchingReplayFile' | 'sessionType'> & {
  sessionType?: string;
  matchingReplayFile?: Partial<NonNullable<SessionCard['matchingReplayFile']>> | null;
  playerDriver?: (Omit<Partial<NonNullable<SessionCard['playerDriver']>>, 'bestLapPaceCategory'> & { bestLapPaceCategory?: string | null }) | null;
};

function sessionType(value: string | undefined): SessionCard['sessionType'] {
  if (value === 'Practice' || value === 'Qualifying' || value === 'Race' || value === 'Unknown') return value;
  return 'Unknown';
}

function paceCategory(value: string | null | undefined): NonNullable<NonNullable<SessionCard['playerDriver']>['bestLapPaceCategory']> | null | undefined {
  const known = ['Alien', 'Competitive', 'Good', 'Midpack', 'Tail-ender', 'Offline'] as const;
  return value === null || value === undefined ? value : known.find(category => category === value);
}

export function makeSessionCard(overrides: SessionCardOverrides = {}): SessionCard {
  const playerDriver: NonNullable<SessionCard['playerDriver']> = {
    name: 'Driver', carType: 'Car', carClass: 'GT3', carNumber: '1', teamName: 'Team',
    isPlayer: true, position: 1, classPosition: 1, bestLapTime: 100, 
    bestS1: 30, bestS2: 35, bestS3: 35, theoreticalBest: 100, 
    declaredLapsCount: 1, lapsLedCount: 0,
    bestLapOrdinal: null, lapsCount: 1, cleanLapsCount: 1, drivingTimeSeconds: 100,
    pitStopsCount: 0, maxTopSpeed: null, consistencyScore: null, top3Average: null,
  };
  const { playerDriver: playerOverride, matchingReplayFile, sessionType: sessionKind, ...sessionOverrides } = overrides;
  const { bestLapPaceCategory, ...driverOverrides } = playerOverride ?? {};
  return {
    id: 'session-1', filename: 'session.xml', filePath: 'session.xml', trackVenue: 'Track',
    trackCourse: '', trackEvent: 'Event', trackLengthMeters: 5000, timeString: '2026-01-01 12:00:00',
    timestamp: parseDateStringToTimestamp(overrides.timeString ?? '2026-01-01 12:00:00'), sessionName: 'P1', driversCount: 1, isEmpty: false,
    ...sessionOverrides,
    sessionType: sessionType(sessionKind ?? 'Practice'),
    matchingReplayFile: matchingReplayFile ? { name: 'replay.vcr', path: 'replay.vcr', fileSizeBytes: 0, ...matchingReplayFile } : undefined,
    playerDriver: playerOverride ? { ...playerDriver, ...driverOverrides, bestLapPaceCategory: paceCategory(bestLapPaceCategory) } : undefined,
  };
}

type DetailedSessionOverrides = Omit<Partial<DetailedSession>, 'playerDriver' | 'drivers' | 'sessionType' | 'matchingReplayFile'> & {
  sessionType?: string;
  matchingReplayFile?: Partial<NonNullable<DetailedSession['matchingReplayFile']>> | null;
  playerDriver?: (Omit<Partial<DriverData>, 'laps' | 'bestLapPaceCategory'> & { laps?: Partial<LapData>[] | undefined; bestLapPaceCategory?: string | null }) | null;
  drivers?: DriverData[];
};

function makeLapData(overrides: Partial<LapData>): LapData {
  return {
    lapNumber: 1, position: 1, lapTime: null, s1: null, s2: null, s3: null,
    topSpeed: null, fCompound: '', rCompound: '', isPitStop: false, isValid: true, ...overrides,
  };
}

export function makeDetailedSession(overrides: DetailedSessionOverrides = {}): DetailedSession {
  const playerDriver: DriverData = {
    name: 'Driver', carType: 'Car', carClass: 'GT3', carNumber: '1', teamName: 'Team', isPlayer: true,
    position: 1, classPosition: 1, bestLapTime: 100, 
    bestS1: 30, bestS2: 35, bestS3: 35, theoreticalBest: 100, 
    declaredLapsCount: 1, laps: [],
  };
  const { playerDriver: playerOverride, matchingReplayFile, sessionType: sessionKind, ...sessionOverrides } = overrides;
  const { bestLapPaceCategory, ...driverOverrides } = playerOverride ?? {};
  return {
    id: 'session-1', filename: 'session.xml', filePath: 'session.xml', trackVenue: 'Track',
    trackCourse: '', trackEvent: 'Event', trackLengthMeters: 5000, timeString: '2026-01-01 12:00:00',
    timestamp: parseDateStringToTimestamp(overrides.timeString ?? '2026-01-01 12:00:00'), sessionName: 'P1', driversCount: 1,
    drivers: [], ...sessionOverrides,
    sessionType: sessionType(sessionKind ?? 'Practice'),
    matchingReplayFile: matchingReplayFile ? { name: 'replay.vcr', path: 'replay.vcr', fileSizeBytes: 0, ...matchingReplayFile } : undefined,
    playerDriver: playerOverride ? {
      ...playerDriver, ...driverOverrides, bestLapPaceCategory: paceCategory(bestLapPaceCategory),
      laps: playerOverride.laps?.map(lap => makeLapData(lap)) ?? playerDriver.laps,
    } : undefined,
  };
}
