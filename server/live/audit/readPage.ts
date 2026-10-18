import type { LiveCaptureManifest } from '../../../shared/types/liveCapture.js';
import type { LiveAuditRecord } from '../../../shared/types/liveAudit.js';
import { openLiveRecording } from '../capture/recordingValidation.js';

export interface AuditReadRequest {
  directory: string;
  manifest: LiveCaptureManifest;
  direction: 'asc' | 'desc';
  after: number | null;
}
export interface AuditPage { records: LiveAuditRecord[]; next: number | null }
export class AuditReadError extends Error {
  public constructor(public readonly status: number, message: string) { super(message); }
}

const PAGE_SIZE = 200;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const reasons = new Set(['start', 'finish', 'measurement', 'lap', 'settings', 'sample', 'end']);

/** Raw diagnostic history needs capture identity, but does not claim verified XML ownership. */
export async function readAuditPage(request: AuditReadRequest): Promise<AuditPage> {
  if (request.direction !== 'asc' && request.direction !== 'desc'
    || request.after !== null && (!Number.isSafeInteger(request.after) || request.after < 0)) {
    throw new AuditReadError(400, 'Invalid strategy history cursor');
  }
  const reader = await openLiveRecording(request.directory, request.manifest, false);
  try {
    const direction = request.direction === 'asc' ? 'ASC' : 'DESC';
    const comparison = request.direction === 'asc' ? '>' : '<';
    const rows = await reader.queryAll<{ observation_id: number | bigint; data: string | null }>(`WITH page AS (
      SELECT observation_id, data FROM capture_observations WHERE source='recorder' AND kind='strategy-audit-v1'
      ${request.after !== null ? `AND observation_id ${comparison} ?` : ''}
      ORDER BY observation_id ${direction} LIMIT ?
    ), bounded AS (
      SELECT *, SUM(octet_length(encode(CAST(data AS VARCHAR)))) OVER (ORDER BY observation_id ${direction}) AS bytes FROM page
    ) SELECT observation_id, CASE WHEN bytes <= ? THEN CAST(data AS VARCHAR) ELSE NULL END AS data
      FROM bounded ORDER BY observation_id ${direction}`,
    [...(request.after !== null ? [request.after] : []), PAGE_SIZE + 1, MAX_PAGE_BYTES]);
    const records: LiveAuditRecord[] = [];
    for (const row of rows.slice(0, PAGE_SIZE)) {
      if (row.data === null) {
        if (records.length) break;
        throw new AuditReadError(413, 'Strategy history checkpoint exceeds its 4 MiB read bound');
      }
      const record = JSON.parse(row.data) as LiveAuditRecord;
      const sequence = Number(row.observation_id);
      if (!record || record.runId !== request.manifest.recordingId || !reasons.has(record.reason)
        || !Number.isSafeInteger(sequence) || sequence < 0 || !Number.isFinite(record.recordedAt)
        || record.recordedAt > request.manifest.updatedAt
        || !Number.isSafeInteger(record.modelVersion) || record.modelVersion <= 0
        || !record.snapshot || typeof record.snapshot !== 'object'
        || !record.observation || typeof record.observation !== 'object') {
        throw new AuditReadError(409, 'Strategy history checkpoint does not match its recording');
      }
      // Observation IDs remain unique and ordered across interrupted/recovered tracker lifetimes.
      records.push({ ...record, sequence });
    }
    return { records, next: rows.length > records.length ? records[records.length - 1].sequence : null };
  } finally { await reader.close(); }
}
