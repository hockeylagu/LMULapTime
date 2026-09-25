import { Database as DatabaseType } from 'better-sqlite3';
import { ReplayTrajectoryData, ReplayTrajectoryPoint } from './types.js';
import { compressJson, decompressJson } from './dbSchema.js';
import { toColumnarTrajectory, fromColumnarTrajectory, isColumnar } from './replayTrajectoryCodec.js';

/**
 * Rewrites legacy object-per-point trajectory blobs into the columnar layout.
 *
 * Each row is decoded back and compared against the original before it is written, so a blob
 * whose source .Vcr no longer exists can never be replaced by something that does not restore
 * to identical data. Work is committed in batches to keep the WAL bounded and stay resumable.
 */

export interface RecodeReport {
  scanned: number;
  recoded: number;
  skippedAlreadyColumnar: number;
  bytesBefore: number;
  bytesAfter: number;
  failures: string[];
}

interface CandidateRow {
  rowid: number;
  filename: string;
  driver_slot: number;
  lap_key: number;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function pointsEqual(left: ReplayTrajectoryPoint[], right: ReplayTrajectoryPoint[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    const a = left[index] as unknown as Record<string, unknown>;
    const b = right[index] as unknown as Record<string, unknown>;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const key of keys) {
      const valueA = a[key];
      const valueB = b[key];
      if (valueA === valueB) continue;
      if (Array.isArray(valueA) && Array.isArray(valueB)) {
        if (valueA.length === valueB.length && valueA.every((item, i) => item === valueB[i])) continue;
      }
      return false;
    }
  }
  return true;
}

function restoresIdentically(original: ReplayTrajectoryData, encoded: Buffer): boolean {
  const restored = fromColumnarTrajectory(decompressJson<ReplayTrajectoryData>(encoded));
  if (!pointsEqual(original.points || [], restored.points || [])) return false;
  return canonical({ ...original, points: undefined }) === canonical({ ...restored, points: undefined });
}

export function recodeReplayTrajectories(
  db: DatabaseType,
  options: { apply?: boolean; batchSize?: number; onProgress?: (done: number, total: number, report: RecodeReport) => void } = {}
): RecodeReport {
  const batchSize = options.batchSize ?? 200;
  const candidates = db.prepare('SELECT rowid, filename, driver_slot, lap_key FROM replay_trajectories ORDER BY rowid').all() as CandidateRow[];
  const readBlob = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE rowid = ?');
  const writeBlob = db.prepare('UPDATE replay_trajectories SET trajectory_br = ?, updated_at = ? WHERE rowid = ?');

  const report: RecodeReport = {
    scanned: candidates.length,
    recoded: 0,
    skippedAlreadyColumnar: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    failures: [],
  };

  const pending: Array<{ rowid: number; buffer: Buffer }> = [];
  const flush = db.transaction((batch: Array<{ rowid: number; buffer: Buffer }>) => {
    const now = Date.now();
    for (const item of batch) writeBlob.run(item.buffer, now, item.rowid);
  });

  for (let index = 0; index < candidates.length; index++) {
    const row = candidates[index];
    options.onProgress?.(index, candidates.length, report);

    const blob = (readBlob.get(row.rowid) as { trajectory_br: Buffer } | undefined)?.trajectory_br;
    if (!blob) continue;

    const stored = decompressJson<ReplayTrajectoryData>(blob);
    if (isColumnar(stored)) {
      report.skippedAlreadyColumnar++;
      continue;
    }

    const encoded = compressJson(toColumnarTrajectory(stored));
    if (!restoresIdentically(stored, encoded)) {
      report.failures.push(`${row.filename} slot=${row.driver_slot} lap=${row.lap_key}`);
      continue;
    }

    report.bytesBefore += blob.length;
    report.bytesAfter += encoded.length;
    report.recoded++;

    if (options.apply) {
      pending.push({ rowid: row.rowid, buffer: encoded });
      if (pending.length >= batchSize) flush(pending.splice(0, pending.length));
    }
  }

  if (options.apply && pending.length > 0) flush(pending);
  return report;
}
