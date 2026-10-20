import { LIVE_CAPTURE_CHANNELS } from '../../server/live/capture/channels.js';
import { LIVE_CAPTURE_NORMALIZATION_VERSION, LIVE_CAPTURE_SAMPLE_WIDTH, LIVE_CAPTURE_SCHEMA_VERSION, LIVE_CAPTURE_SOURCE } from '../../shared/types/liveCapture.js';
import type { LiveCaptureBatch, LiveCaptureManifest } from '../../shared/types/liveCapture.js';

export function makeManifest(overrides: Partial<LiveCaptureManifest> = {}): LiveCaptureManifest {
  const recordingId = 'a3e6b4b3-54a7-4fc2-9b22-8e5818b8b318';
  return {
    recordingId,
    source: LIVE_CAPTURE_SOURCE,
    schemaVersion: LIVE_CAPTURE_SCHEMA_VERSION,
    normalizationVersion: LIVE_CAPTURE_NORMALIZATION_VERSION,
    signConvention: 'iso8855',
    filename: `bahrain_Race_2026-10-17T18-00-00Z_${recordingId}.live.duckdb`,
    layoutKey: 'bahrain:gp',
    trackName: 'Bahrain International Circuit',
    driverName: 'Driver One',
    vehicleName: 'LMGT3 Car',
    vehicleModel: 'Test Model',
    carClass: 'LMGT3',
    sessionCode: 3,
    sessionKind: 'Race',
    startedAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000,
    firstElapsedSeconds: 1,
    lastElapsedSeconds: 1,
    endedAt: null,
    status: 'recording',
    samples: 1,
    droppedSamples: 0,
    anchors: [],
    sessionId: null,
    gameVersion: '1.2.3',
    ...overrides,
  };
}

export function sampleRows(...times: number[]): Float64Array {
  const result = new Float64Array(times.length * LIVE_CAPTURE_SAMPLE_WIDTH);
  for (const [row, time] of times.entries()) {
    const offset = row * LIVE_CAPTURE_SAMPLE_WIDTH;
    result[offset] = time;
    result[offset + 1] = 1;
    result[offset + 2] = 0;
    for (let channel = 0; channel < LIVE_CAPTURE_CHANNELS.length; channel++) result[offset + 3 + channel] = channel === 6 ? Number.NaN : row + channel / 10;
  }
  return result;
}

export function makeBatch(sequence = 0, overrides: Partial<LiveCaptureBatch> = {}): LiveCaptureBatch {
  const samples = sampleRows(1, 1.02);
  const manifest = makeManifest({ firstElapsedSeconds: 1, lastElapsedSeconds: 1.02, samples: 2, updatedAt: 1_800_000_000_100 });
  return {
    type: 'batch',
    sequence,
    manifest,
    samples,
    observations: [{
      elapsedSeconds: 1.01,
      receivedAt: 1_800_000_000_050,
      source: 'rest',
      kind: 'standings',
      requestStartedAt: 1_800_000_000_040,
      requestFinishedAt: 1_800_000_000_050,
      data: { position: 3, nested: { status: 'ok' } },
    }],
    ...overrides,
  };
}

