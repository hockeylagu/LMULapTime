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

/** A car's inputs to the race distance (`computeLapsLeft`), as the game reported them. */
export interface LiveAuditCar {
  id: number;
  vehicleClass: string;
  totalLaps: number;
  lapStartEt: number;
  lastLapTime: number;
  estimatedLapTime: number;
  pitStops: number | null;
  inPits: boolean;
  finishStatus: number;
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
  /**
   * The overall and class leaders behind `snapshot.lapsLeft` in a race, so a laps-left change can be traced to its cause
   * (Le Mans 2026-11-24 and Sebring 2026-11-25 could not be). Absent outside races and in older records.
   */
  race?: { leader: LiveAuditCar | null; classLeader: LiveAuditCar | null };
}
