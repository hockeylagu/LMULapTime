import { DetailedSession, DriverData, LapData } from '../../shared/types/index.js';
import type { TelemetryLinks } from '../telemetry/telemetryLinks.js';

/** Official timing fields used by replay metadata and lap validation, without events or passes. */
export type ReplayTimingLap = Pick<LapData, 'lapNum' | 'lapTime' | 's1' | 's2' | 's3' |
  'isValid' | 'isPitStop' | 'isOutLap' | 'nonRepresentativeReason' | 'lapOrdinal'>;
export type ReplayContextDriver = Pick<DriverData, 'name' | 'carType' | 'carClass' |
  'bestLapTime' | 'isPlayer' | 'driverOrdinal'> & { laps: ReplayTimingLap[] };
export type ReplaySessionContext = Pick<DetailedSession, 'id' | 'trackVenue' | 'trackCourse' |
  'trackLengthMeters' | 'sessionType' | 'totalLapsCount' | 'matchingReplayFile'> & {
  drivers: ReplayContextDriver[];
  playerDriver?: ReplayContextDriver;
};

export interface ReplayTrajectoryRequest {
  session: ReplaySessionContext;
  driverOrdinal: number;
  lapOrdinal: number;
  maxPoints: number;
  /** When set, the lap is served at one point per this many metres instead of `maxPoints`. */
  pointSpacingM?: number;
  allowDuckDb: boolean;
}

export interface ReplaySummarySourceData {
  diskFiles: string[];
  storedReplays: Array<{
    filename: string;
    file_path?: string;
    file_mtime?: number;
    file_size?: number;
    metadata?: import('../../shared/types/index.js').ReplayMetadata | null;
  }>;
  replaysDir: string;
  sessions: DetailedSession[];
  /** The stored DuckDB matches (TelemetryLinks). */
  telemetryLinks: Pick<TelemetryLinks, 'forReplay'>;
  getMetadata: (filePath: string, filename: string) => import('../../shared/types/index.js').ReplayMetadata | null;
}

/** Thrown when a trajectory is requested for a named driver who is not in the replay. */
export class ReplayDriverNotFoundError extends Error {
  public constructor(driverName: string, replayName: string) {
    super(`Driver "${driverName}" is not in replay "${replayName}"`);
    this.name = 'ReplayDriverNotFoundError';
  }
}

/** Thrown when LMU has deleted the replay and the cache holds no laps for the requested driver. */
export class ReplayDriverNotRecordedError extends ReplayDriverNotFoundError {
  public constructor(driverSlot: number, replayName: string) {
    super(`slot ${driverSlot}`, replayName);
    this.message = `Driver slot ${driverSlot} has no recorded laps in replay "${replayName}", and the replay file has been deleted`;
    this.name = 'ReplayDriverNotRecordedError';
  }
}
