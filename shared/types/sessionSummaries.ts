import type { LapConditionGroup } from '../domain/lapConditions.js';
import type { SessionMetadata, DriverData } from './session.js';

export const SESSION_SUMMARY_PROJECTION_VERSION = 4;

export interface SessionLapProjection {
  sessionId: string; driverOrdinal: number; lapOrdinal: number; lapNumber: number;
  lapTime: number | null; s1: number | null; s2: number | null; s3: number | null;
  conditionGroup: LapConditionGroup; isValid: boolean; isInferred: boolean; isPitLap: boolean;
  isOutLap: boolean; isClean: boolean; isRepresentative: boolean; isHuman: boolean;
  leaderboardEligible: boolean; nonRepresentativeReason: string | null;
}

export interface SessionConditionProjection {
  sessionId: string; driverOrdinal: number; conditionGroup: LapConditionGroup;
  cleanCount: number; cleanTimeSum: number; cleanTimeSquareSum: number;
  bestLapOrdinal: number | null; bestLapTime: number | null;
  bestS1: number | null; bestS2: number | null; bestS3: number | null;
  fastestThreeCount: number; fastestThreeTimeSum: number;
}

export interface SessionDriverProjection {
  sessionId: string; driverOrdinal: number; driverName: string; normalizedName: string;
  isPlayer: boolean; isHuman: boolean; carClass: string; carType: string;
  position: number; lapsCount: number; cleanLapsCount: number; drivingTimeSum: number;
  pitCount: number; maxSpeed: number | null; bestLapOrdinal: number | null;
  declaredLapsCount: number;
  bestLapNumber: number | null; bestLapTime: number | null; bestS1: number | null;
  bestS2: number | null; bestS3: number | null; averageLapTime: number | null;
  topThreeAverage: number | null; consistencyScore: number | null; bestLapWet: boolean;
}

export interface SessionSummaryProjection {
  sessionId: string; sourceRevision: number; projectionVersion: number; layoutKey: string;
  sessionKind: string; isEmpty: boolean; primaryDriverOrdinal: number | null;
  recordingName: string | null; drivers: SessionDriverProjection[];
  conditions: SessionConditionProjection[]; laps: SessionLapProjection[];
  aggregate: SessionAggregateProjection;
}

/** Stable session contributions, calculated with the same driver/lap rules as the detailed projections. */
export interface SessionAggregateProjection {
  player: SessionDriverProjection | null;
  timeString: string; sessionDay: string; eventTimestamp: number; trackLengthMeters: number | null;
  distanceKm: number; activityDistanceKm: number; positionGain: number | null; bestLapTimeString: string;
  primaryLapCount: number; primaryValidLapCount: number;
}

export interface SessionProjectionState { sourceRevision: number; projectionRevision: number; projectionVersion: number; }

export type SessionCard = Omit<SessionMetadata, 'playerDriver'> & {
  isEmpty: boolean;
  playerDriver?: Omit<DriverData, 'laps' | 'incidents' | 'trackLimits' | 'penalties'> & {
    bestLapOrdinal: number | null;
    completedLapsCount: number; cleanLapsCount: number; drivingTimeSeconds: number;
    pitStopsCount: number; maxTopSpeed: number | null; consistencyScore: number | null;
    topThreeAverage: number | null;
  };
};
