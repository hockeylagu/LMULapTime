import { ReplayTrajectoryPoint } from '../../shared/types/index.js';
import type { SetupSteeringCalibration } from '../../shared/types/dataPlugin.js';

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
  /** Sign convention of steering; laps cached before ISO 8855 carry none (see dbTelemetryStore.ts). */
  signConvention?: 'iso8855';
  /** The run's steering lock from the recording's `CarSetup` (absent when the setup lacks it, and on laps cached before v12). */
  setupSteering?: SetupSteeringCalibration;
  sectors?: {
    s1PointIndex?: number;
    s2PointIndex?: number;
  };
}
