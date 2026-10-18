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

export interface LiveLearningReadinessReport {
  state: 'evaluated';
  generatedAt: string;
  historicalCorrectionsEnabled: false;
  captures: { indexed: number; verified: number; unavailable: number };
  processing: { current: number; pending: number };
  dataset: { currentExamples: number; eligible: number; excluded: number; exclusions: Record<string, number> };
  sessions: { training: number; heldOut: number };
  sources: Array<{ state: string; count: number }>;
  resources: Array<{
    kind: LiveResourceKind;
    trainingExamples: number;
    heldOutExamples: number;
    insufficientCohorts: number;
    rejectedCohorts: number;
    passingCohorts: number;
    gates: Record<string, number>;
  }>;
  minimumEvidence: { trainSessions: number; trainExamples: number; testSessions: number; testExamples: number };
}

export type LiveLearningReadiness = LiveLearningReadinessReport | {
  state: 'deferred';
  historicalCorrectionsEnabled: false;
  message: string;
};
