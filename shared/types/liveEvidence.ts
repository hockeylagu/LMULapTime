import type { LiveCaptureManifest, LiveCaptureObservation } from './liveCapture.js';

export interface LiveEvidenceChannel {
  name: string;
  unit: string;
  sourceField: string;
  frame: 'iso8855-vehicle';
}

export interface LiveEvidencePoint {
  sampleIndex: number;
  elapsedSeconds: number;
  lapSeconds: number;
  /** Values follow channels order; NULL means unavailable, never a measured zero. */
  values: Array<number | null>;
}

export interface LiveEvidenceObservation extends LiveCaptureObservation {
  /** Stable together with recordingId, including observations shared by adjacent lap boundaries. */
  observationId: number;
}

export interface LiveLapEvidence {
  source: 'live-capture';
  recordingId: string;
  schemaVersion: number;
  normalizationVersion: number;
  signConvention: 'iso8855';
  gameVersion: string | null;
  lapNumber: number;
  startSeconds: number;
  durationSeconds: number;
  channels: LiveEvidenceChannel[];
  points: LiveEvidencePoint[];
  /** Only observations with a game timestamp in this lap. */
  observations: LiveEvidenceObservation[];
  /** No game-time claim: these belong to the recording, not necessarily this lap. */
  sessionObservations: LiveEvidenceObservation[];
  observationsTruncated: boolean;
  coverage: {
    firstLapSeconds: number | null;
    lastLapSeconds: number | null;
    /** Discontinuities > 0.1 seconds; no interpolation is applied across them. */
    gaps: Array<{ afterLapSeconds: number; beforeLapSeconds: number }>;
    /** Count for the entire recording, not this lap. */
    recordingDroppedSamples: number;
  };
}

export type LiveEvidenceUnavailableReason = 'not-player' | 'unlinked' | 'ambiguous' | 'missing'
  | 'incomplete-lap' | 'unverified-clock' | 'session-loaded' | 'busy' | 'incompatible' | 'changed' | 'too-large' | 'failed';

export type LiveEvidenceResponse =
  | { state: 'available'; sessionId: string; driverOrdinal: number; lapOrdinal: number; evidence: LiveLapEvidence }
  | { state: 'unavailable'; sessionId: string; driverOrdinal: number; lapOrdinal: number;
      reason: LiveEvidenceUnavailableReason; message: string };

/** Main thread selects verified ownership; the worker revalidates the file and bounds before reading. */
export interface LiveEvidenceReadRequest {
  directory: string;
  manifest: LiveCaptureManifest;
  lapNumber: number;
  startSeconds: number;
  durationSeconds: number;
}

export type LiveEvidenceWorkerResult = { type: 'evidence'; evidence: LiveLapEvidence }
  | { type: 'failed'; reason: LiveEvidenceUnavailableReason; error: string };

export interface LiveDynamicsProvenance {
  recordingId: string;
  sampleIndex: number;
  /** Original sample time minus target chart-point lap time. No interpolation of live values. */
  offsetSeconds: number;
  yawRate: boolean;
  /** Beta derived from measured body velocity, not a directly measured angle. */
  slipAngle: boolean;
}

export type LiveCaptureOverlay =
  | { state: 'applied'; recordingId: string; gameVersion: string | null; normalizationVersion: number;
      yawPoints: number; slipPoints: number; totalPoints: number; maxOffsetSeconds: number;
      recordingDroppedSamples: number; captureGaps: number }
  | { state: 'unavailable' | 'unaligned'; message: string };
