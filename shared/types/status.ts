import type { ReferenceBenchmarkDiff } from './reference.js';

export interface AppStatus {
  /** Unique for one server process; changes when the local server restarts. */
  serverInstanceId?: string;
  dataPlugin?: { revision: string };
  resultsDir: string;
  resultsExist: boolean;
  replaysDir: string;
  replaysExist: boolean;
  telemetryDir?: string;
  telemetryExist?: boolean;
  playerName?: string;
  sessionsCount: number;
  tracksCount: number;
  referenceLaptimes?: {
    lastUpdated: string | null;
    entriesCount: number;
    lastUpdateDiff?: ReferenceBenchmarkDiff | null;
  };
  sqliteCache?: {
    enabled: boolean;
    dbPath: string;
    sessionsCount: number;
    lastSyncedAt: string | null;
    dbSizeBytes: number;
    replaysCount?: number;
    replayTrajectoriesCount?: number;
    telemetryFilesCount?: number;
    sessionSummariesReadyCount?: number;
  };
}

export interface ReplayScanStatus {
  running: boolean;
  processed: number;
  total: number;
  currentFile: string | null;
  currentStage?: string | null;
  filePercent?: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  result: { added: number; updated: number; skipped: number; total: number; lastSyncedAt: string; interrupted: boolean } | null;
  error: string | null;
}

export interface SessionScanStatus {
  running: boolean;
  processed?: number;
  total?: number;
  currentFile?: string | null;
  currentStage?: string | null;
  filePercent?: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  result: { added: number; updated: number; total: number; lastSyncedAt: string } | null;
  error: string | null;
}

export interface TelemetryScanStatus {
  running: boolean;
  processed: number;
  total: number;
  currentFile: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  result: { added: number; updated: number; cached: number; total: number } | null;
  error: string | null;
}

export interface ReferenceLaptimeRefreshStatus {
  started: boolean;
  running: boolean;
  checked: boolean;
  completedAt: string | null;
  refreshed: boolean;
  updatedCount: number;
  diff: ReferenceBenchmarkDiff | null;
  error: string | null;
}

/** Background re-decode of on-disk replays whose stored rows are behind the current parser version. */
export interface ReplayUpgradeStatus {
  enabled: boolean;
  running: boolean;
  processed: number;
  total: number;
  currentFile: string | null;
  currentStage: string | null;
  filePercent: number | null;
  /** Drivers decoded (stored or failed) in this run, of the drivers in the backlog it started with. */
  driversDone: number;
  driversTotal: number;
  startedAt: string | null;
  finishedAt: string | null;
  result: { replays: number; upgraded: number; failed: number; interrupted: boolean } | null;
  error: string | null;
}

export interface ReplayIngestJob {
  name: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  error?: string;
  /** A valid primary/default trajectory is cached for the current file and parser version. */
  playable?: boolean;
}

export interface ScanStatus extends ReplayScanStatus {
  replayJobs?: ReplayIngestJob[];
  refreshQueued?: boolean;
  /** Changes when session data, replay metadata or telemetry links change, including on restart. */
  dataRevision?: string;
  sessionScan: SessionScanStatus;
  sessionProjectionBackfill?: { running: boolean; processed: number; failed: number; total: number; currentSessionId: string | null; startedAt: string | null; finishedAt: string | null; error: string | null };
  replayUpgrade?: ReplayUpgradeStatus;
  telemetryScan?: TelemetryScanStatus;
  referenceLaptimes: ReferenceLaptimeRefreshStatus;
  allComplete?: boolean;
  allCached?: boolean;
}
