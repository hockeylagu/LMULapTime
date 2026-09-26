import React from 'react';
import { ReplayTrajectoryPoint, ReplayTelemetryPoint } from '../../../../shared/types/index.js';
import { PointComparison } from '../../../utils/replayComparison.js';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis.js';
import { TelemetryChartPathsResult } from './telemetryChartPaths.js';
import { TelemetryChannelId } from './presets/telemetryPresets.js';
import { TelemetrySpeedChannel } from './channels/inputs/TelemetrySpeedChannel.js';
import { TelemetryDeltaChannel } from './channels/inputs/TelemetryDeltaChannel.js';
import { TelemetryThrottleChannel } from './channels/inputs/TelemetryThrottleChannel.js';
import { TelemetryBrakeChannel } from './channels/inputs/TelemetryBrakeChannel.js';
import { TelemetryGearChannel } from './channels/inputs/TelemetryGearChannel.js';
import { TelemetrySteerChannel } from './channels/inputs/TelemetrySteerChannel.js';
import { TelemetryRpmChannel } from './channels/powertrain/TelemetryRpmChannel.js';
import { TelemetryLateralOffsetChannel } from './channels/dynamics/TelemetryLateralOffsetChannel.js';
import { TelemetryAccelLatChannel } from './channels/dynamics/TelemetryAccelLatChannel.js';
import { TelemetryAccelLonChannel } from './channels/dynamics/TelemetryAccelLonChannel.js';
import { TelemetryAccelTotalChannel } from './channels/dynamics/TelemetryAccelTotalChannel.js';
import { TelemetrySlipAngleChannel } from './channels/dynamics/TelemetrySlipAngleChannel.js';
import { TelemetryUndersteerChannel } from './channels/dynamics/TelemetryUndersteerChannel.js';
import { TelemetryYawRateChannel } from './channels/dynamics/TelemetryYawRateChannel.js';
import { TelemetryBrakeTempsChannel } from './channels/tires/TelemetryBrakeTempsChannel.js';
import { TelemetrySuspPosChannel } from './channels/dynamics/TelemetrySuspPosChannel.js';
import { TelemetryWheelSpeedsChannel } from './channels/tires/TelemetryWheelSpeedsChannel.js';
import { TelemetryTirePressuresChannel } from './channels/tires/TelemetryTirePressuresChannel.js';
import { TelemetryTireWearChannel } from './channels/tires/TelemetryTireWearChannel.js';
import { TelemetryTireTempsChannel } from './channels/tires/TelemetryTireTempsChannel.js';
import { TelemetryFuelChannel } from './channels/powertrain/TelemetryFuelChannel.js';
import { TelemetryVirtualEnergyChannel } from './channels/powertrain/TelemetryVirtualEnergyChannel.js';
import { TelemetrySocChannel } from './channels/powertrain/TelemetrySocChannel.js';
import { TelemetryRegenRateChannel } from './channels/powertrain/TelemetryRegenRateChannel.js';

export interface TelemetryChannelRendererProps {
  channelId: TelemetryChannelId;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  pointComparisons: PointComparison[];
  paths: TelemetryChartPathsResult;
  isCursorInView: boolean;
  cursorPct: number;
  source?: 'vcr' | 'duckdb';
  points?: ReplayTrajectoryPoint[];
  cornerSegments?: CornerSegmentComparison[];
  cumDists?: number[];
  viewStart?: number;
  viewEnd?: number;
}

export const TelemetryChannelRenderer: React.FC<TelemetryChannelRendererProps> = React.memo(({
  channelId,
  currentPoint,
  currentComparison,
  pointComparisons,
  paths,
  isCursorInView,
  cursorPct,
  source,
  points,
  cornerSegments,
  cumDists,
  viewStart,
  viewEnd,
}) => {
  const cursorProps = { currentPoint, currentComparison, isCursorInView, cursorPct, source };

  switch (channelId) {
    case 'speed':
      return <TelemetrySpeedChannel speedPath={paths.speedPath} baselineSpeedPath={paths.baselineSpeedPath} {...cursorProps} />;
    case 'delta':
      return pointComparisons.length > 0 ? (
        <TelemetryDeltaChannel
          deltaTimePath={paths.deltaTimePath}
          deltaTimeArea={paths.deltaTimeArea}
          deltaGainArea={paths.deltaGainArea}
          deltaLossArea={paths.deltaLossArea}
          deltaGradientStops={paths.deltaGradientStops}
          maxDeltaSec={paths.maxDeltaSec}
          {...cursorProps}
        />
      ) : null;
    case 'throttle':
      return <TelemetryThrottleChannel throttlePath={paths.throttlePath} throttleArea={paths.throttleArea} baselineThrottlePath={paths.baselineThrottlePath} {...cursorProps} />;
    case 'brake':
      return <TelemetryBrakeChannel brakePath={paths.brakePath} brakeArea={paths.brakeArea} baselineBrakePath={paths.baselineBrakePath} {...cursorProps} />;
    case 'gear':
      return <TelemetryGearChannel gearPath={paths.gearPath} baselineGearPath={paths.baselineGearPath} {...cursorProps} />;
    case 'steer':
      return (
        <TelemetrySteerChannel
          steerPath={paths.steerPath}
          baselineSteerPath={paths.baselineSteerPath}
          points={points}
          cornerSegments={cornerSegments}
          pointComparisons={pointComparisons}
          cumDists={cumDists}
          viewStart={viewStart}
          viewEnd={viewEnd}
          {...cursorProps}
        />
      );
    case 'rpm':
      return <TelemetryRpmChannel rpmPath={paths.rpmPath} rpmArea={paths.rpmArea} baselineRpmPath={paths.baselineRpmPath} maxRpm={paths.maxRpm} {...cursorProps} />;
    case 'brake-temps':
      return <TelemetryBrakeTempsChannel brakeTempsPaths={paths.brakeTempsPaths} baselineBrakeTempsPaths={paths.baselineBrakeTempsPaths} maxBrakeTemp={paths.maxBrakeTemp} {...cursorProps} />;
    case 'ride-height':
      return <TelemetrySuspPosChannel suspPosPaths={paths.suspPosPaths} baselineSuspPosPaths={paths.baselineSuspPosPaths} minSuspPos={paths.minSuspPos} maxSuspPos={paths.maxSuspPos} {...cursorProps} />;
    case 'wheel-speeds':
      return <TelemetryWheelSpeedsChannel wheelSpeedsPaths={paths.wheelSpeedsPaths} baselineWheelSpeedsPaths={paths.baselineWheelSpeedsPaths} maxWheelSpeed={paths.maxWheelSpeed} {...cursorProps} />;
    case 'tire-pressures':
      return <TelemetryTirePressuresChannel tirePressuresPaths={paths.tirePressuresPaths} baselineTirePressuresPaths={paths.baselineTirePressuresPaths} minTirePressure={paths.minTirePressure} maxTirePressure={paths.maxTirePressure} {...cursorProps} />;
    case 'tire-wear':
      return <TelemetryTireWearChannel tireWearPaths={paths.tireWearPaths} baselineTireWearPaths={paths.baselineTireWearPaths} minTireWear={paths.minTireWear} maxTireWear={paths.maxTireWear} {...cursorProps} />;
    case 'tire-temps':
      return <TelemetryTireTempsChannel tireTempsPaths={paths.tireTempsPaths} baselineTireTempsPaths={paths.baselineTireTempsPaths} minTireTemp={paths.minTireTemp} maxTireTemp={paths.maxTireTemp} {...cursorProps} />;
    case 'lateral-offset':
      return <TelemetryLateralOffsetChannel lateralOffsetPath={paths.lateralOffsetPath} baselineLateralOffsetPath={paths.baselineLateralOffsetPath} {...cursorProps} />;
    case 'accel-lat':
      return <TelemetryAccelLatChannel accelLatPath={paths.accelLatPath} baselineAccelLatPath={paths.baselineAccelLatPath} {...cursorProps} />;
    case 'accel-lon':
      return <TelemetryAccelLonChannel accelLonPath={paths.accelLonPath} baselineAccelLonPath={paths.baselineAccelLonPath} {...cursorProps} />;
    case 'accel-total':
      return <TelemetryAccelTotalChannel accelTotalPath={paths.accelTotalPath} accelTotalArea={paths.accelTotalArea} baselineAccelTotalPath={paths.baselineAccelTotalPath} {...cursorProps} />;
    case 'slip-angle':
      return <TelemetrySlipAngleChannel slipAnglePath={paths.slipAnglePath} baselineSlipAnglePath={paths.baselineSlipAnglePath} {...cursorProps} />;
    case 'under-over-steer':
      return <TelemetryUndersteerChannel understeerPath={paths.understeerPath} baselineUndersteerPath={paths.baselineUndersteerPath} {...cursorProps} />;
    case 'yaw-rate':
      return <TelemetryYawRateChannel yawRatePath={paths.yawRatePath} baselineYawRatePath={paths.baselineYawRatePath} {...cursorProps} />;
    case 'fuel':
      return <TelemetryFuelChannel fuelPath={paths.fuelPath} fuelArea={paths.fuelArea} baselineFuelPath={paths.baselineFuelPath} maxFuel={paths.maxFuel} {...cursorProps} />;
    case 'virtual-energy':
      return <TelemetryVirtualEnergyChannel virtualEnergyPath={paths.virtualEnergyPath} virtualEnergyArea={paths.virtualEnergyArea} baselineVirtualEnergyPath={paths.baselineVirtualEnergyPath} {...cursorProps} />;
    case 'soc':
      return <TelemetrySocChannel socPath={paths.socPath} socArea={paths.socArea} baselineSocPath={paths.baselineSocPath} {...cursorProps} />;
    case 'regen-rate':
      return <TelemetryRegenRateChannel regenRatePath={paths.regenRatePath} regenRateArea={paths.regenRateArea} baselineRegenRatePath={paths.baselineRegenRatePath} maxRegen={paths.maxRegen} {...cursorProps} />;
    default:
      return null;
  }
});
