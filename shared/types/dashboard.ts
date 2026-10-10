import type { PaceCategory } from './reference.js';
import type { SessionCard } from './sessionSummaries.js';

export interface DashboardRankedTrack { track: string; laps: number; km: number; }
export interface DashboardRankedCar { car: string; laps: number; km: number; }
export interface DashboardBestPaceLap { sessionId?: string; percentage: number; category: PaceCategory; lapTimeString: string; track: string; car: string; }

export interface DashboardMetrics {
  sessionsCount: number; totalLaps: number; cleanLaps: number; cleanLapsPercentage: number; totalDistanceKm: number; totalDrivingSeconds: number;
  maxTopSpeed: number; maxTopSpeedTrack: string; averageBenchmarkPacePercentage: number | null;
  averageBenchmarkPaceCategory: PaceCategory | null; practiceSessionsCount: number; qualifyingSessionsCount: number;
  raceSessionsCount: number; raceWinsCount: number; racePodiumsCount: number; totalPitStops: number;
  rankedTracks: DashboardRankedTrack[]; rankedCars: DashboardRankedCar[]; bestTrackRefLaps: DashboardBestPaceLap[];
}

export interface DashboardRecentPacePoint {
  id: string; trackName: string; carName: string; timeString: string; bestLapTimeString: string;
  pacePercentage: number; paceCategory?: PaceCategory | null;
}

export interface DashboardLatestOuting {
  id: string; trackName: string; trackVenue: string; trackCourse?: string;
  sessionType: 'Practice' | 'Qualifying' | 'Race' | 'Unknown'; timeString: string; carName: string;
  carClass?: string; bestLapTimeString: string; bestLapTime: number | null; bestLapNum?: number | null;
  pacePercentage?: number | null; paceCategory?: PaceCategory | null; bestLapWet?: boolean;
  position?: number; gridPosition?: number | null; positionGain?: number | null; lapsCount: number;
  hasReplay: boolean; hasDuckDbTelemetry?: boolean; driverOrdinal?: number; bestLapOrdinal?: number | null;
}

export interface DashboardTrends {
  hasData: boolean; driverName: string; latestOuting: DashboardLatestOuting | null;
  todayActivity: { dateString: string; sessionsCount: number; lapsCount: number; distanceKm: number } | null;
  recentPaceTrend: DashboardRecentPacePoint[]; paceDelta: number | null;
  paceTrendDirection: 'improving' | 'declining' | 'steady' | 'none'; paceTrendClass: string | null;
  recentCleanRate: number | null; recentConsistency: number | null; recentNetPositions: number;
}

export interface DashboardData {
  revision: string; metrics: DashboardMetrics; trends: DashboardTrends; tracks: string[];
  emptyCount: number; replayCount: number; sessions: SessionCard[]; total: number; page: number; pageSize: number;
}
