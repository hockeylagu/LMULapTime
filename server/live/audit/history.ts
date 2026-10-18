import type { Database } from 'better-sqlite3';
import type { LiveAuditRecord } from '../../../shared/types/liveAudit.js';
import { getLiveCaptureIndexRows } from '../../core/live/dbLiveCaptureStore.js';
import type { AuditPageReader } from './reader.js';
import { AuditReadError } from './readPage.js';

export interface AuditHistoryOptions {
  db: Database;
  directory: string | null;
  runId: string | null;
  blocked(): boolean;
  read: AuditPageReader;
}

function checkIdle(options: AuditHistoryOptions): void {
  if (options.blocked()) throw new AuditReadError(503, 'Strategy history is available after the live recording closes');
}

/** Diagnostic history may be unlinked; it never supplies canonical session metrics or learning eligibility. */
export async function* iterateAuditHistory(options: AuditHistoryOptions, newestOnly = false): AsyncGenerator<LiveAuditRecord> {
  checkIdle(options);
  const captures = options.directory === null ? [] : getLiveCaptureIndexRows(options.db)
    .filter(entry => entry.available && entry.manifest.status !== 'recording'
      && (options.runId === null || entry.manifest.recordingId === options.runId))
    .sort((a, b) => newestOnly ? b.manifest.updatedAt - a.manifest.updatedAt : a.manifest.startedAt - b.manifest.startedAt);
  if (captures.length > 1000) throw new AuditReadError(413, 'Select a runId to export more than 1,000 strategy recordings');
  const newestTimes: number[] = [];
  const rememberTime = (record: LiveAuditRecord): void => {
    if (!newestOnly) return;
    newestTimes.push(record.recordedAt);
    newestTimes.sort((a, b) => b - a);
    if (newestTimes.length > 200) newestTimes.length = 200;
  };
  for (const entry of captures) {
    if (newestOnly && newestTimes.length === 200 && entry.manifest.updatedAt < newestTimes[199]) break;
    let after: number | null = null;
    let emitted = 0;
    do {
      checkIdle(options);
      const page = await options.read({ directory: options.directory!, manifest: entry.manifest,
        direction: newestOnly ? 'desc' : 'asc', after });
      checkIdle(options);
      for (const record of page.records) {
        if (newestOnly && emitted >= 200) break;
        emitted++;
        rememberTime(record);
        yield record;
      }
      if (page.next !== null && (page.records.length === 0 || page.next === after)) {
        throw new AuditReadError(409, 'Strategy history cursor did not advance');
      }
      after = newestOnly && emitted >= 200 ? null : page.next;
    } while (after !== null);
  }
}

/** Merge bounded recent recording pages; raw checkpoint snapshots are never cached in SQLite. */
export async function readAuditHistory(options: AuditHistoryOptions): Promise<LiveAuditRecord[]> {
  let records: LiveAuditRecord[] = [];
  for await (const record of iterateAuditHistory(options, true)) {
    records.push(record);
    if (records.length > 200) records = records.sort(newestFirst).slice(0, 200);
  }
  return records.sort(newestFirst);
}

function newestFirst(a: LiveAuditRecord, b: LiveAuditRecord): number {
  return b.recordedAt - a.recordedAt || a.runId.localeCompare(b.runId) || b.sequence - a.sequence;
}
