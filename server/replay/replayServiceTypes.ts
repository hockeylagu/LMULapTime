import { DetailedSession, DriverData, ReplayDriverEntry, ReplayTrajectoryData } from '../core/types.js';
import type { DuckDbFileInfo } from '../telemetry/telemetryMatcher.js';

export interface ReplayTrajectoryRequest {
  replayName: string;
  driverSlot?: number;
  driverName?: string;
  lapNumber?: number;
  maxPoints: number;
  allowDuckDb: boolean;
}

export interface ReplayMetadataRequest {
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
  duckFiles: DuckDbFileInfo[];
  telemetryMeta: Array<{
    filename: string;
    matchedReplayFilename?: string | null;
    matchedSessionId?: string | null;
  }>;
  getMetadata: (filePath: string, filename: string) => import('../core/types.js').ReplayMetadata | null;
}
