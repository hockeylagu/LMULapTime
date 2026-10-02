/** Progress every sync iterator reports. */
export interface ScanProgress {
  processed: number;
  total: number;
  currentFile?: string;
  stage?: string;
  filePercent?: number;
}

/** The status fields a background scan keeps up to date (see ReplayScanStatus, SessionScanStatus). */
export interface ScanRunStatus<R> {
  running: boolean;
  processed?: number;
  total?: number;
  currentFile?: string | null;
  currentStage?: string | null;
  filePercent?: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  result: R | null;
  error: string | null;
}

export type ScanOutcome<R> = { result: R } | { error: unknown };

/** A status for a scan starting now. */
export function startedScanStatus(): ScanRunStatus<never> & { processed: number; total: number; currentFile: null } {
  return {
    running: true,
    processed: 0,
    total: 0,
    currentFile: null,
    currentStage: null,
    filePercent: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null,
  };
}

/**
 * Drains a sync iterator one step per event-loop turn (setImmediate), so HTTP requests are served
 * between files, and mirrors its progress into `status`. `onSettled` runs once the iterator has
 * finished or thrown, after `status` shows the scan stopped.
 */
export function pumpScanInBackground<R>(
  iterator: AsyncIterator<ScanProgress, R, void>,
  status: ScanRunStatus<NoInfer<R>>,
  onSettled: (outcome: ScanOutcome<R>) => void
): void {
  const settle = (outcome: ScanOutcome<R>): void => {
    if ('result' in outcome) status.result = outcome.result;
    else status.error = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
    status.running = false;
    status.finishedAt = new Date().toISOString();
    status.currentFile = null;
    status.currentStage = null;
    status.filePercent = null;
    onSettled(outcome);
  };

  const step = async (): Promise<void> => {
    let next: IteratorResult<ScanProgress, R>;
    try {
      next = await iterator.next();
    } catch (error: unknown) {
      settle({ error });
      return;
    }
    if (next.done) {
      settle({ result: next.value });
      return;
    }
    const progress = next.value;
    status.processed = progress.processed;
    status.total = progress.total;
    status.currentFile = progress.currentFile || null;
    status.currentStage = progress.stage || null;
    status.filePercent = progress.filePercent ?? null;
    setImmediate(() => { void step(); });
  };
  setImmediate(() => { void step(); });
}
