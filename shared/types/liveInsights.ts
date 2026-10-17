import type { LivePerLapSource } from './liveStrategy.js';
import type { LiveSessionKind } from './live.js';

export interface LiveSavingPlan {
  /** Consumption ceiling including reserve at this reduced rate. */
  targetPerLap: number;
  savePerLap: number;
  savePercent: number;
  shortfall: number;
  source: LivePerLapSource;
}
export interface LiveFuelRatio {
  /** Litres per 1% VE, rounded up to an available setting; null if range is unknown. */
  recommended: number | null;
  source: LivePerLapSource;
  pairedLaps: number;
  garageSetting: number | null;
  mfdSetting: number | null;
  excessLitres: number | null;
  /** Fuel range minus VE range in laps; negative means fuel runs out first. */
  fuelBiasLaps: number | null;
}
export interface LiveTyreCoverage {
  /** Linear estimate to the pit/finish; inventory planning preserves the driver's 40% tread floor. */
  target: 'pit' | 'finish';
  projectedTread: number;
  setsNeeded: number;
  availableSetsCover: boolean | null;
}
export interface LiveSessionResult {
  /** Qualifying only: timer expired and the complete field reported finished/retired/disqualified. */
  settled?: boolean;
  kind: LiveSessionKind;
  trackName: string;
  vehicleName: string;
  classPlace: number | null;
  overallPlace: number | null;
  finishStatus: number;
  bestLap: number | null;
  cleanAverage: number | null;
  cleanLaps: number;
  completeHistory: boolean;
  pitStops: number | null;
  resourceKind: 've' | 'fuel' | null;
  resourceRemaining: number | null;
  actualPerLap: number | null;
  plannedPerLap: number | null;
  tyreTread: number | null;
}
