import type { ReplayLogOptions, ReplayProgressCallback } from '../replayProgress.js';

export interface ExtractReplayTrajectoryOptions extends ReplayLogOptions {
  driverSlot?: number;
  driverName?: string;
  maxPoints?: number;
  playerName?: string;
  lapNumber?: number;
  // When true, finalizes every detected lap for the target driver in this same file
  // scan and attaches them all as `allLapsData`, so callers (e.g. the eager replay
  // cache sync) can persist the whole driver's laps from a single binary pass.
  allLaps?: boolean;
  onProgress?: ReplayProgressCallback;
}
