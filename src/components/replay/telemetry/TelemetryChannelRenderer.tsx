import React from 'react';
import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';
import { TelemetryChartPathsResult } from './telemetryChartPaths.js';
import { TelemetryChannelId } from './telemetryPresets.js';
import {
  TelemetrySpeedChannel,
  TelemetryDeltaChannel,
  TelemetryThrottleChannel,
  TelemetryBrakeChannel,
  TelemetryGearChannel,
  TelemetrySteerChannel,
  TelemetryRpmChannel,
  TelemetryLateralOffsetChannel,
  TelemetryAccelLatChannel,
  TelemetryAccelLonChannel,
  TelemetryAccelTotalChannel,
  TelemetrySlipAngleChannel,
  TelemetryUndersteerChannel,
  TelemetryTireSlipChannel,
  TelemetryYawRateChannel,
  TelemetryBrakeTempsChannel,
  TelemetrySuspPosChannel,
  TelemetryWheelSpeedsChannel,
  TelemetryTirePressuresChannel,
  TelemetryTireWearChannel,
  TelemetryTireTempsChannel,
} from './index.js';

export interface TelemetryChannelRendererProps {
  channelId: TelemetryChannelId;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  pointComparisons: PointComparison[];
  paths: TelemetryChartPathsResult;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryChannelRenderer: React.FC<TelemetryChannelRendererProps> = React.memo(({
  channelId,
  currentPoint,
  currentComparison,
  pointComparisons,
  paths,
  isCursorInView,
  cursorPct,
}) => {
  const cursorProps = { currentPoint, currentComparison, isCursorInView, cursorPct };

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
      return <TelemetrySteerChannel steerPath={paths.steerPath} baselineSteerPath={paths.baselineSteerPath} {...cursorProps} />;
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
    case 'tire-slip':
      return <TelemetryTireSlipChannel tireSlipPath={paths.tireSlipPath} tireSlipArea={paths.tireSlipArea} baselineTireSlipPath={paths.baselineTireSlipPath} {...cursorProps} />;
    case 'yaw-rate':
      return <TelemetryYawRateChannel yawRatePath={paths.yawRatePath} baselineYawRatePath={paths.baselineYawRatePath} {...cursorProps} />;
    default:
      return null;
  }
});
