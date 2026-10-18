import { LIVE_LEARNING_VERSION } from '../../../shared/types/liveLearning.js';
import type { LiveLearningEvent, StoredLearningEvent } from '../../../shared/types/liveLearning.js';
import type { LiveCaptureManifest } from '../../../shared/types/liveCapture.js';
import { openLiveRecording } from '../capture/recordingValidation.js';

export interface LearningReadRequest { directory: string; manifest: LiveCaptureManifest }
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Validate untrusted persisted JSON before it can become a dataset row. */
export function parseLearningEvent(kind: string, value: unknown): LiveLearningEvent | null {
  const data = record(value);
  if (!data || data.version !== LIVE_LEARNING_VERSION || !Number.isSafeInteger(data.lapNumber)
    || Number(data.lapNumber) < 1 || (data.kind !== 'fuel' && data.kind !== 've')) return null;
  if (kind === 'learning-forecast' && finite(data.lapStartSeconds) && data.lapStartSeconds >= 0
    && finite(data.forecastSeconds) && data.forecastSeconds >= data.lapStartSeconds
    && (data.predicted === null || finite(data.predicted))
    && (data.predictionSource === null || data.predictionSource === 'measured' || data.predictionSource === 'game')
    && Number.isSafeInteger(data.modelVersion) && Number(data.modelVersion) > 0
    && (data.condition === 'dry' || data.condition === 'wet')
    && (data.compound === null || typeof data.compound === 'string' && data.compound.length <= 256)) {
    return { kind, data: data as unknown as Extract<LiveLearningEvent, { kind: 'learning-forecast' }>['data'] };
  }
  if (kind === 'learning-outcome' && finite(data.crossingSeconds) && data.crossingSeconds >= 0
    && finite(data.actual) && data.actual > 0 && data.measurementSource === 'live-usage-meter'
    && Array.isArray(data.exclusions) && data.exclusions.length <= 30
    && data.exclusions.every(reason => typeof reason === 'string' && reason.length <= 128)) {
    return { kind, data: data as unknown as Extract<LiveLearningEvent, { kind: 'learning-outcome' }>['data'] };
  }
  return null;
}

/** Read only compact learning observations, never the high-rate telemetry columns. Runs in a worker. */
export async function readLearningEvents(request: LearningReadRequest): Promise<StoredLearningEvent[]> {
  const reader = await openLiveRecording(request.directory, request.manifest, true);
  try {
    const rows = await reader.queryAll<{ observation_id: number | bigint; kind: string; data: string | null }>(`
      WITH candidates AS (
        SELECT observation_id, kind, data FROM capture_observations
        WHERE source='recorder' AND kind IN ('learning-forecast','learning-outcome')
        ORDER BY observation_id LIMIT 40001
      ), bounded AS (
        SELECT *, SUM(octet_length(encode(CAST(data AS VARCHAR)))) OVER (ORDER BY observation_id) AS bytes FROM candidates
      ) SELECT observation_id, kind, CASE WHEN bytes <= 16000000 THEN CAST(data AS VARCHAR) ELSE NULL END AS data
        FROM bounded ORDER BY observation_id`);
    if (rows.length > 40_000 || rows.some(row => row.data === null)) throw new Error('Learning observations exceed the bounded reader limit');
    return rows.map(row => {
      const event = parseLearningEvent(row.kind, JSON.parse(row.data!) as unknown);
      const observationId = Number(row.observation_id);
      if (!event || !Number.isSafeInteger(observationId) || observationId < 0) throw new Error('Invalid or unsupported learning observation');
      return { observationId, event };
    });
  } finally { await reader.close(); }
}
