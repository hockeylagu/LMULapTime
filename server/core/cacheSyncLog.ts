interface CacheSyncSummary {
  total: number;
  added: number;
  updated: number;
  /** Files rejected/deferred by the reader, not unchanged cached files. */
  skipped?: number;
}

/** Shared source summaries; unchanged scans stay visible, exceptional skips retain their meaning. */
export function formatCacheSyncLog(source: string, directory: string, result: CacheSyncSummary): string {
  const skipped = result.skipped ? `, ${result.skipped} skipped` : '';
  return `[SQLite Cache] Synced ${result.total} ${source} (${result.added} new, ${result.updated} updated${skipped}) from ${directory}`;
}

/** Overlapping discovery triggers report an unchanged inventory only once per process. */
export class CacheSyncLog {
  private previousTotal: number | null = null;
  public constructor(private readonly source: string, private readonly directory: string) {}

  public format(result: CacheSyncSummary): string | null {
    const unchanged = this.previousTotal === result.total && result.added === 0 && result.updated === 0 && !result.skipped;
    this.previousTotal = result.total;
    return unchanged ? null : formatCacheSyncLog(this.source, this.directory, result);
  }
}
