import { DetailedSession, DriverData, ReplayDriverEntry, ReplayTrajectoryData } from '../core/types.js';
import type { TelemetryLinks } from '../telemetry/telemetryLinks.js';

export interface ReplayTrajectoryRequest {
  sessionId?: string;
  session?: DetailedSession;
  driverOrdinal?: number;
  lapOrdinal?: number;
  /** Resolved from the requested session's stored link inside the server. */
  replayName: string;
  driverSlot?: number;
  driverName?: string;
  lapNumber?: number;
  maxPoints: number;
  /** When set, the lap is served at one point per this many metres instead of `maxPoints`. */
  pointSpacingM?: number;
  allowDuckDb: boolean;
}

export interface ReplayMetadataRequest {
  sessionId: string;
  /** Resolved from the requested session's stored link inside the server. */
  replayName: string;
  playerName?: string;
}

export interface ReplayDriverMatchResult {
  driverSlot?: number;
  driverName?: string;
  isPlayer: boolean;
  matchedSession?: DetailedSession;
  matchedDriver?: DriverData;
  replayDriver?: ReplayDriverEntry;
}

export interface ReplayTelemetryEnrichmentOptions {
  replayName: string;
  filePath: string;
  driverSlot?: number;
  driverName?: string;
  lapNumber?: number;
  allowDuckDb: boolean;
  matchedSession?: DetailedSession;
  fullTrajectory: ReplayTrajectoryData;
}

export interface ReplayTelemetryEnrichmentResult {
  trajectory: ReplayTrajectoryData;
  fused: boolean;
  duckdbUnavailableReason?: string;
}

export interface ReplaySummarySourceData {
  diskFiles: string[];
  storedReplays: Array<{
    filename: string;
    file_path?: string;
    file_mtime?: number;
    file_size?: number;
    metadata?: import('../core/types.js').ReplayMetadata | null;
  }>;
  replaysDir: string;
  sessions: DetailedSession[];
  /** The stored DuckDB matches (TelemetryLinks). */
  telemetryLinks: Pick<TelemetryLinks, 'forReplay'>;
  getMetadata: (filePath: string, filename: string) => import('../core/types.js').ReplayMetadata | null;
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
