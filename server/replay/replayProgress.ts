/**
 * Logging and progression tracking types and utilities for LMU replay (.Vcr) parsing.
 */

export type ReplayParsingStage =
  | 'header'
  | 'metadata'
  | 'stream_init'
  | 'stream_decoding'
  | 'lap_analysis'
  | 'downsampling'
  | 'caching';

export interface ReplayStreamProgress {
  stage: ReplayParsingStage;
  stageDescription: string;
  percent: number; // 0 to 100
  bytesProcessed?: number;
  totalBytes?: number;
  slicesParsed?: number;
  currentTimeSec?: number;
  lapsDetected?: number;
}

export type ReplayProgressCallback = (progress: ReplayStreamProgress) => void;

export interface ReplayLogOptions {
  /** If false, suppresses progress milestone logs. Defaults to true in development/server mode. */
  silent?: boolean;
}

const STAGE_DESCRIPTIONS: Record<ReplayParsingStage, string> = {
  header: 'Verifying container and magic header',
  metadata: 'Extracting metadata block and driver roster',
  stream_init: 'Initializing binary frame stream',
  stream_decoding: 'Decoding telemetry and events',
  lap_analysis: 'Classifying laps and timing loops',
  downsampling: 'Finalizing trajectory and bounds',
  caching: 'Persisting to SQLite database cache',
};

export function getStageDescription(stage: ReplayParsingStage): string {
  return STAGE_DESCRIPTIONS[stage] || stage;
}

/**
 * Throttled logger for the streaming decode loop (Stage 4).
 * Logs at notable milestone intervals (e.g. 0%, 25%, 50%, 75%, 100% or 50MB intervals)
 * while notifying the caller's progress callback.
 */
export class ReplayProgressTracker {
  private lastLoggedPercent = -1;
  private lastLoggedBytes = 0;
  private readonly totalBytes: number;
  private readonly callback?: ReplayProgressCallback;
  private readonly silent: boolean;

  public constructor(
    totalBytes: number,
    callback?: ReplayProgressCallback,
    options?: ReplayLogOptions
  ) {
    this.totalBytes = Math.max(1, totalBytes);
    this.callback = callback;
    this.silent = options?.silent ?? false;
  }

  public report(
    stage: ReplayParsingStage,
    percent: number,
    extra?: {
      bytesProcessed?: number;
      slicesParsed?: number;
      currentTimeSec?: number;
      lapsDetected?: number;
    }
  ): void {
    const clampedPercent = Math.min(100, Math.max(0, Math.round(percent)));
    const description = getStageDescription(stage);

    if (this.callback) {
      try {
        this.callback({
          stage,
          stageDescription: description,
          percent: clampedPercent,
          totalBytes: this.totalBytes,
          ...extra,
        });
      } catch {
        // Callback errors should never disrupt binary stream decoding
      }
    }

    if (this.silent) return;

    if (stage === 'stream_decoding') {
      const currentBytes = extra?.bytesProcessed ?? 0;
      const bytesDelta = currentBytes - this.lastLoggedBytes;
      const percentDelta = clampedPercent - this.lastLoggedPercent;

      // Log every 25% or every 50MB, or at 100%
      const shouldLog =
        this.lastLoggedPercent < 0 ||
        percentDelta >= 25 ||
        bytesDelta >= 50 * 1024 * 1024 ||
        clampedPercent === 100;

      if (shouldLog) {
        this.lastLoggedPercent = clampedPercent;
        this.lastLoggedBytes = currentBytes;
        const mbRead = (currentBytes / (1024 * 1024)).toFixed(1);
        const mbTotal = (this.totalBytes / (1024 * 1024)).toFixed(1);
        const slicesStr = extra?.slicesParsed !== undefined ? `${extra.slicesParsed.toLocaleString()} slices` : '';
        const timeStr = extra?.currentTimeSec !== undefined ? `t=${extra.currentTimeSec.toFixed(1)}s` : '';
        const lapsStr = extra?.lapsDetected !== undefined ? `${extra.lapsDetected} laps detected` : '';
        const metrics = [slicesStr, timeStr, lapsStr].filter(Boolean).join(' | ');

        console.log(
          `[VCR Parser] [4/6] Decoding Stream: ${clampedPercent.toString().padStart(3)}% (${mbRead} MB / ${mbTotal} MB)${metrics ? ` | ${metrics}` : ''}`
        );
      }
    }
  }
}
