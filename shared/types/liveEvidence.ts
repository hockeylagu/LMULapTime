import type { LiveCaptureManifest, LiveCaptureObservation } from './liveCapture.js';

export interface LiveEvidenceChannel {
  name: string;
  unit: string;
  sourceField: string;
  frame: 'iso8855-vehicle' | 'iso8855-wheel';
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
  /** Present when the stored recording uses an older convention than the normalized response. */
  sourceNormalizationVersion?: number;
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
  /** Longitudinal slip ratios derived from measured contact-patch and ground velocities. */
  wheelSlip: boolean;
}

export type WheelPosition = 'fl' | 'fr' | 'rl' | 'rr';

/** Longitudinal slip ratio per wheel (FL, FR, RL, RR); NULL where the wheel is airborne, slow or unrecorded. */
export type WheelSlipRatios = [number | null, number | null, number | null, number | null];

export interface WheelSlipEvent {
  kind: 'lockup' | 'wheelspin';
  wheel: WheelPosition;
  startLapSeconds: number;
  endLapSeconds: number;
  /** Most extreme ratio inside the event: negative for a lockup, positive for wheelspin. */
  peakSlipRatio: number;
}

/** Measured per-point wheel slip and the wheels inside a detected event at that point. */
export interface LiveWheelSlip {
  ratios: WheelSlipRatios;
  lockup: WheelPosition[];
  wheelspin: WheelPosition[];
}

export type LiveCaptureOverlay =
  | { state: 'applied'; recordingId: string; gameVersion: string | null; normalizationVersion: number;
      yawPoints: number; slipPoints: number; wheelSlipPoints: number; totalPoints: number; maxOffsetSeconds: number;
      /** Detected on every live sample of the lap, not only on the chart points. */
      wheelSlipEvents: WheelSlipEvent[];
      recordingDroppedSamples: number; captureGaps: number }
  | { state: 'unavailable' | 'unaligned'; message: string };
