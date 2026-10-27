import { openVerifiedLiveRecording } from './recordingValidation.js';
import type { DuckDbReader } from '../../telemetry/duckdbReader.js';
import { liveCaptureChannels } from './channels.js';

import type { LiveCaptureObservation } from '../../../shared/types/liveCapture.js';
import type { LiveEvidenceReadRequest, LiveLapEvidence, LiveEvidenceUnavailableReason, LiveEvidenceObservation } from '../../../shared/types/liveEvidence.js';
import { LiveEvidenceReadError } from './readError.js';

/** The evidence contract's own normalization: unchanged by the raw hybrid channels of recording version 4. */
const EVIDENCE_NORMALIZATION_VERSION = 3;
const MAX_SAMPLES = 50_000;
const MAX_OBSERVATIONS = 1000;
const MAX_OBSERVATION_BYTES = 1_000_000;
/** Vehicle motion plus longitudinal wheel velocities (slip); a recording's own catalog decides what is verified. Raw hybrid channels are not evidence. */
const evidenceChannels = (normalizationVersion: number) => liveCaptureChannels(normalizationVersion)
  .flatMap(channel => channel.verified && channel.frame !== 'raw' ? [{ ...channel, frame: channel.frame }] : []);

function fail(reason: LiveEvidenceUnavailableReason, message: string): never { throw new LiveEvidenceReadError(reason, message); }

interface SampleRow { sample_index: number | bigint; elapsed_seconds: number; [key: string]: number | bigint | null }
interface ObservationRow {
  observation_id: number | bigint;
  elapsed_seconds: number | null; received_at: number; request_started_at: number | null;
  request_finished_at: number | null; source: LiveCaptureObservation['source']; kind: string; data: string | null;
}

async function readObservations(reader: DuckDbReader, start: number, end: number, untimed: boolean) {
  const rows = await reader.queryAll<ObservationRow>(`WITH candidates AS (
    SELECT * FROM capture_observations
    WHERE ${untimed ? 'elapsed_seconds IS NULL' : 'elapsed_seconds >= ? AND elapsed_seconds <= ?'}
    ORDER BY observation_id LIMIT ?
  ), bounded AS (
    SELECT *, SUM(octet_length(encode(CAST(data AS VARCHAR)))) OVER (ORDER BY observation_id) AS bytes FROM candidates
  ) SELECT observation_id, elapsed_seconds, received_at, request_started_at, request_finished_at, source, kind,
    CASE WHEN bytes <= ? THEN CAST(data AS VARCHAR) ELSE NULL END AS data FROM bounded ORDER BY observation_id`,
    untimed ? [MAX_OBSERVATIONS + 1, MAX_OBSERVATION_BYTES] : [start, end, MAX_OBSERVATIONS + 1, MAX_OBSERVATION_BYTES]);
  const observations: LiveEvidenceObservation[] = [];
  let bytes = 0;
  for (const row of rows.slice(0, MAX_OBSERVATIONS)) {
    if (row.data === null) break;
    bytes += Buffer.byteLength(row.data, 'utf8');
    if (bytes > MAX_OBSERVATION_BYTES) break;
    observations.push({ observationId: Number(row.observation_id), elapsedSeconds: row.elapsed_seconds, receivedAt: row.received_at,
      source: row.source, kind: row.kind, data: JSON.parse(row.data) as unknown,
      ...(row.request_started_at !== null && row.request_finished_at !== null
        ? { requestStartedAt: row.request_started_at, requestFinishedAt: row.request_finished_at } : {}) });
  }
  return { observations, truncated: rows.length > observations.length };
}

/** Runs in an expendable reader worker, never on the game's capture path. */
export async function readLiveRecording(request: LiveEvidenceReadRequest): Promise<LiveLapEvidence> {
  const { manifest, startSeconds, durationSeconds, lapNumber } = request;
  if (!Number.isFinite(startSeconds) || startSeconds < 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0
    || durationSeconds > 3600 || !Number.isSafeInteger(lapNumber) || lapNumber < 0) fail('unverified-clock', 'Invalid lap clock bounds');
  const reader = await openVerifiedLiveRecording(request.directory, manifest);
  try {
    const channels = evidenceChannels(manifest.normalizationVersion);
    const anchor = manifest.anchors.filter(item => item.lapNumber === lapNumber);
    if (anchor.length !== 1 || anchor[0].startSeconds !== startSeconds || anchor[0].lapSeconds === null
      || Math.abs(anchor[0].lapSeconds - durationSeconds) > 0.05) fail('unverified-clock', 'Lap anchor is not verified against XML');
    const end = startSeconds + durationSeconds;
    // Raw telemetry lap counters may be zero-based; verified scoring anchors select the time interval.
    const samples = await reader.queryAll<SampleRow>(`SELECT sample_index, elapsed_seconds,
      ${channels.map(channel => `"${channel.name}"`).join(', ')} FROM capture_samples
      WHERE elapsed_seconds >= ? AND elapsed_seconds <= ? ORDER BY sample_index LIMIT ?`, [startSeconds, end, MAX_SAMPLES + 1]);
    if (samples.length > MAX_SAMPLES) fail('too-large', 'Lap exceeds the 50,000-sample read limit');
    const points = samples.map(row => ({ sampleIndex: Number(row.sample_index), elapsedSeconds: row.elapsed_seconds,
      lapSeconds: row.elapsed_seconds - startSeconds,
      values: channels.map(channel => {
        const value = row[channel.name];
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        // Correct the old recording convention at the boundary without rewriting retained files.
        return manifest.normalizationVersion === 1 && ['velocity_left_mps', 'yaw_rate_radps'].includes(channel.name) ? -value : value;
      }) }));
    const gaps: LiveLapEvidence['coverage']['gaps'] = [];
    for (let index = 1; index < points.length; index++) {
      const before = points[index - 1];
      const after = points[index];
      if (after.elapsedSeconds <= before.elapsedSeconds) fail('changed', 'Stored sample clock is not strictly increasing');
      if (after.lapSeconds - before.lapSeconds > 0.100000001) gaps.push({ afterLapSeconds: before.lapSeconds, beforeLapSeconds: after.lapSeconds });
    }
    const timed = await readObservations(reader, startSeconds, end, false);
    const untimed = await readObservations(reader, startSeconds, end, true);
    return { source: 'live-capture', recordingId: manifest.recordingId, schemaVersion: manifest.schemaVersion,
      normalizationVersion: EVIDENCE_NORMALIZATION_VERSION,
      ...(manifest.normalizationVersion < EVIDENCE_NORMALIZATION_VERSION ? { sourceNormalizationVersion: manifest.normalizationVersion } : {}),
      signConvention: 'iso8855', gameVersion: manifest.gameVersion,
      lapNumber, startSeconds, durationSeconds, channels: channels.map(channel => ({ name: channel.name, unit: channel.unit,
        frame: channel.frame, sourceField: channel.sourceField })), points, observations: timed.observations,
      sessionObservations: untimed.observations, observationsTruncated: timed.truncated || untimed.truncated,
      coverage: { firstLapSeconds: points[0]?.lapSeconds ?? null, lastLapSeconds: points[points.length - 1]?.lapSeconds ?? null,
        gaps, recordingDroppedSamples: manifest.droppedSamples } };
  } finally { await reader.close(); }
}
