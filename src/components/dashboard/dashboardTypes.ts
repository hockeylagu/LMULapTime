import { LapData, PaceCategory } from '../../../server/core/types';
import type { DashboardSortOption } from './dashboardSortOptions.js';

export type { DashboardSortOption };

export interface SessionSummary {
  id: string;
  filename: string;
  trackVenue: string;
  trackCourse?: string;
  trackLengthMeters?: number | null;
  timeString: string;
  timestamp?: number;
  sessionType: 'Practice' | 'Qualifying' | 'Race' | 'Unknown';
  sessionName: string;
  weatherInfo?: string;
  driversCount: number;
  playerDriver?: {
    name: string;
    carType: string;
    carClass?: string;
    bestLapTime: number | null;
    bestLapTimeString: string;
    bestS1: number | null;
    bestS2: number | null;
    bestS3: number | null;
    theoreticalBest: number | null;
    theoreticalBestString: string;
    bestLapPaceCategory?: PaceCategory | null;
    bestLapPacePercentage?: number | null;
    avgLapTime?: number | null;
    top3LapsCount?: number;
    position?: number;
    gridPosition?: number | null;
    positionGain?: number | null;
    lapsCount: number;
    laps?: LapData[];
  };
  bestSessionLap?: {
    driverName: string;
    carType: string;
    lapTime: number;
    lapTimeString: string;
  };
  hasDuckDbTelemetry?: boolean;
  duckdbFilename?: string;
  matchingReplayFile?: {
    name: string;
    path: string;
    hasDuckDbTelemetry?: boolean;
    duckdbFilename?: string;
  };
}
