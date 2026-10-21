import type { CornerPaths } from './telemetryCornerChartPaths.js';

export interface DeltaGradientStop {
  offset: string;
  color: string;
  opacity: number;
}

export interface TelemetryChartPathsResult {
  speedPath: string;
  maxSpeed: number;
  throttlePath: string;
  throttleArea: string;
  brakePath: string;
  brakeArea: string;
  steerPath: string;
  gearPath: string;
  maxGear: number;
  baselineSpeedPath: string;
  baselineThrottlePath: string;
  baselineBrakePath: string;
  baselineSteerPath: string;
  baselineGearPath: string;
  deltaTimePath: string;
  deltaTimeArea: string;
  deltaGainArea: string;
  deltaLossArea: string;
  deltaGradientStops: DeltaGradientStop[];
  maxDeltaSec: number;

  // Extended authentic telemetry channels
  rpmPath: string;
  rpmArea: string;
  baselineRpmPath: string;
  maxRpm: number;

  brakeTempsPaths: CornerPaths;
  baselineBrakeTempsPaths: CornerPaths;
  hasBrakeTemps: boolean;
  maxBrakeTemp: number;

  suspPosPaths: CornerPaths;
  baselineSuspPosPaths: CornerPaths;
  hasSuspPos: boolean;
  minSuspPos: number;
  maxSuspPos: number;

  wheelSpeedsPaths: CornerPaths;
  baselineWheelSpeedsPaths: CornerPaths;
  hasWheelSpeeds: boolean;
  maxWheelSpeed: number;

  /** Measured from live capture only; no computed fallback. */
  wheelSlipPaths: CornerPaths;
  baselineWheelSlipPaths: CornerPaths;
  hasWheelSlip: boolean;

  tirePressuresPaths: CornerPaths;
  baselineTirePressuresPaths: CornerPaths;
  hasTirePressures: boolean;
  minTirePressure: number;
  maxTirePressure: number;

  tireWearPaths: CornerPaths;
  baselineTireWearPaths: CornerPaths;
  hasTireWear: boolean;
  minTireWear: number;
  maxTireWear: number;

  tireTempsPaths: CornerPaths;
  baselineTireTempsPaths: CornerPaths;
  hasTireTemps: boolean;
  minTireTemp: number;
  maxTireTemp: number;

  lateralOffsetPath: string;
  baselineLateralOffsetPath: string;
  hasLateralOffset: boolean;

  // Computed vehicle dynamics channels
  accelLatPath: string;
  baselineAccelLatPath: string;
  accelLonPath: string;
  baselineAccelLonPath: string;
  accelTotalPath: string;
  accelTotalArea: string;
  baselineAccelTotalPath: string;
  slipAnglePath: string;
  baselineSlipAnglePath: string;
  understeerPath: string;
  baselineUndersteerPath: string;
  tireSlipPath: string;
  tireSlipArea: string;
  baselineTireSlipPath: string;
  yawRatePath: string;
  baselineYawRatePath: string;

  // Energy & Fuel channels
  fuelPath: string;
  fuelArea: string;
  baselineFuelPath: string;
  hasFuel: boolean;
  maxFuel: number;

  virtualEnergyPath: string;
  virtualEnergyArea: string;
  baselineVirtualEnergyPath: string;
  hasVirtualEnergy: boolean;

  socPath: string;
  socArea: string;
  baselineSocPath: string;
  hasSoc: boolean;

  regenRatePath: string;
  regenRateArea: string;
  baselineRegenRatePath: string;
  hasRegenRate: boolean;
  maxRegen: number;
}
