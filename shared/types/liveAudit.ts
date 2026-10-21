import type { LiveSnapshot } from './live.js';
import type { LivePerLapSource, LiveResourceKind } from './liveStrategy.js';

export interface LiveMeasuredUse { lap: number; et: number; amount: number }
export interface LiveUsageObservation {
  fuel: LiveMeasuredUse | null;
  ve: LiveMeasuredUse | null;
  fuelNowLitres?: number | null;
  veNowPercent?: number | null;
}

/** A forecast captured before this lap, compared with a subsequently measured clean lap. */
export interface LiveAccuracyComparison {
  lap: number;
  forecastAtSeconds: number;
  resourceKind: LiveResourceKind;
  source: LivePerLapSource | null;
  predictedPerLap: number | null;
  actualPerLap: number | null;
  /** Actual minus predicted, in litres or VE percentage points. */
  errorPerLap: number | null;
  errorPercent: number | null;
  recommendedRatio: number | null;
  actualRatio: number | null;
  /** These are menu selections, not proof of the ratio physically loaded in the car. */
  garageRatio: number | null;
  nextStopRatio: number | null;
  ratioError: number | null;
}

export interface LiveAuditRecord {
  runId: string;
  sequence: number;
  recordedAt: number;
  modelVersion: number;
  reason: 'start' | 'settings' | 'lap' | 'measurement' | 'finish' | 'end';
  /** Immutable forecast, settings and context as they existed at capture time. */
  snapshot: LiveSnapshot;
  observation: LiveUsageObservation;
  comparison: LiveAccuracyComparison | null;
}
