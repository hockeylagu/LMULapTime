import type { LivePerLapSource, LiveResourceKind } from './liveStrategy.js';

export const LIVE_LEARNING_VERSION = 1;
export interface LiveLearningForecast {
  version: number;
  lapNumber: number;
  lapStartSeconds: number;
  forecastSeconds: number;
  kind: LiveResourceKind;
  predicted: number | null;
  predictionSource: LivePerLapSource | null;
  modelVersion: number;
  condition: 'dry' | 'wet';
  compound: string | null;
}
export interface LiveLearningOutcome {
  version: number;
  lapNumber: number;
  crossingSeconds: number;
  kind: LiveResourceKind;
  actual: number;
  /** Derived from resource samples at consecutive crossings, never from a prediction. */
  measurementSource: 'live-usage-meter';
  exclusions: string[];
}
export type LiveLearningEvent = { kind: 'learning-forecast'; data: LiveLearningForecast }
  | { kind: 'learning-outcome'; data: LiveLearningOutcome };

export interface StoredLearningEvent { observationId: number; event: LiveLearningEvent }
export interface LiveLearningExample {
  version: number;
  sessionId: string;
  driverOrdinal: number;
  lapOrdinal: number;
  lapNumber: number;
  recordingId: string;
  forecastObservationId: number | null;
  outcomeObservationId: number;
  matchVersion: number;
  layoutKey: string | null;
  vehicleModel: string | null;
  driverName: string;
  gameVersion: string | null;
  startedAt: number;
  kind: LiveResourceKind;
  condition: string | null;
  compound: string | null;
  modelVersion: number | null;
  predictionSource: LivePerLapSource | null;
  predicted: number | null;
  actual: number;
  forecastSeconds: number | null;
  crossingSeconds: number;
  exclusions: string[];
}
