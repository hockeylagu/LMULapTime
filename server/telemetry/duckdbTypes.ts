import { ReplayTrajectoryPoint } from '../../shared/types/index.js';

export interface DuckDbChannelEntry {
  channelName: string;
  frequency: number;
  unit: string;
}

export interface DuckDbEventEntry {
  eventName: string;
  unit: string;
}

export interface DuckDbLapSummary {
  lapNumber: number;
  startTs: number;
  endTs: number;
  lapTimeSec: number;
  s1Sec?: number;
  s2Sec?: number;
  s3Sec?: number;
}

export interface DuckDbLapTelemetry {
  lapNumber: number;
  lapTimeSec: number;
  pointsCount: number;
  sampleRateHz: number;
  points: ReplayTrajectoryPoint[];
  sectors?: {
    s1PointIndex?: number;
    s2PointIndex?: number;
  };
}
