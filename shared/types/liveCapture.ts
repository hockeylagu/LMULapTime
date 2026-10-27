/** App-owned complementary recordings; native LMU telemetry has a different schema/source identity. */
export const LIVE_CAPTURE_SCHEMA_VERSION = 1;
/** Version 2 fixes source signs and verifies the wheel channels; version 3 recordings share its catalog; version 4 appends six raw hybrid channels (meaning unverified). */
export const LIVE_CAPTURE_NORMALIZATION_VERSION = 4;
export const LIVE_CAPTURE_SOURCE = 'live-capture' as const;
export const LIVE_CAPTURE_SAMPLE_WIDTH = 20;
/** Normal transport bound plus reserved slots for initialization/finalization. */
export const LIVE_CAPTURE_PENDING_BATCHES = 4;
export const LIVE_CAPTURE_FINALIZATION_SLOTS = 2;

/**
 * Capture rows packed by the shared memory reader, in sample order. Each row is LIVE_CAPTURE_SAMPLE_WIDTH values:
 * session seconds, lap number, lap-start seconds, then LIVE_CAPTURE_CHANNELS. NaN means unavailable, never measured zero.
 */
export interface LiveCaptureSampleBatch {
  rows: Float64Array;
  /** The rows whose sparse source state changed, or carry the periodic checkpoint, in row order. */
  sparse: LiveCaptureSparseRow[];
}

export interface LiveCaptureSparseRow {
  row: number;
  /** Raw per-corner material names, preserving the source's truncation. */
  terrainMaterials?: string[];
  /** Last source impact. Magnitude has no invented physical unit. */
  impact?: { elapsedSeconds: number; magnitude: number | null };
}

export interface LiveCaptureObservation {
  elapsedSeconds: number | null;
  receivedAt: number;
  source: 'shared-memory' | 'rest' | 'recorder';
  kind: string;
  /** Sparse evidence retains source semantics; observations are not normalized dynamics columns. */
  data: unknown;
  requestStartedAt?: number;
  requestFinishedAt?: number;
}

export interface LiveCaptureLapAnchor {
  lapNumber: number;
  startSeconds: number;
  lapSeconds: number | null;
}

export interface LiveCaptureManifest {
  recordingId: string;
  source: typeof LIVE_CAPTURE_SOURCE;
  schemaVersion: number;
  normalizationVersion: number;
  signConvention: 'iso8855';
  filename: string;
  layoutKey: string | null;
  trackName: string;
  driverName: string;
  vehicleName: string;
  vehicleModel: string | null;
  carClass: string | null;
  sessionCode: number;
  sessionKind: string;
  startedAt: number;
  updatedAt: number;
  firstElapsedSeconds: number;
  lastElapsedSeconds: number;
  endedAt: number | null;
  status: 'recording' | 'completed' | 'interrupted';
  samples: number;
  droppedSamples: number;
  anchors: LiveCaptureLapAnchor[];
  /** Set only by verified XML ownership, not inferred from current installation. */
  sessionId: string | null;
  gameVersion: string | null;
}

export interface LiveCaptureBatch {
  type: 'batch';
  sequence: number;
  manifest: LiveCaptureManifest;
  /** Interleaved [session seconds, lap number, lap-start seconds, ...catalog values]; current stride 37. */
  samples: Float64Array;
  observations: LiveCaptureObservation[];
}

export interface LiveCaptureCatalogEntry {
  manifest: LiveCaptureManifest;
  bytes: number;
}

export type LiveCaptureWriteMessage = LiveCaptureBatch | { type: 'close' }
  | { type: 'catalog' }
  | { type: 'link'; filename: string; recordingId: string; sessionId: string | null; gameVersion: string | null };
export type LiveCaptureWriteResult =
  | { type: 'persisted'; sequence: number; manifest: LiveCaptureManifest; bytes: number; recycledSamples?: ArrayBuffer }
  | { type: 'failed'; error: string; sequence?: number; recordingId?: string; operation?: 'batch' | 'link' | 'catalog' | 'close' }
  | { type: 'linked'; recordingId: string }
  | { type: 'catalogued'; recordings: LiveCaptureCatalogEntry[]; errors: Array<{ filename: string; error: string }> }
  | { type: 'closed' };

export interface LiveCaptureStatus {
  state: 'idle' | 'recording' | 'unavailable';
  recordingId: string | null;
  samples: number;
  droppedSamples: number;
  pendingBatches: number;
  error: string | null;
}

export interface SessionLiveCapture {
  recordingId: string;
  filename: string;
  source: typeof LIVE_CAPTURE_SOURCE;
  available: boolean;
  status: LiveCaptureManifest['status'];
  samples: number;
  droppedSamples: number;
  startedAt: number;
  endedAt: number | null;
  bytes: number;
  gameVersion: string | null;
}
