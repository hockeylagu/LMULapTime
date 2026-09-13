import React from 'react';
import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';
import { TelemetryChartPathsResult } from './telemetryChartPaths.js';
import { TelemetryChannelId } from './telemetryPresets.js';
import { TelemetrySpeedChannel } from './TelemetrySpeedChannel.js';
import { TelemetryDeltaChannel } from './TelemetryDeltaChannel.js';
import { TelemetryThrottleChannel } from './TelemetryThrottleChannel.js';
import { TelemetryBrakeChannel } from './TelemetryBrakeChannel.js';
import { TelemetryGearChannel } from './TelemetryGearChannel.js';
import { TelemetrySteerChannel } from './TelemetrySteerChannel.js';
import { TelemetryRpmChannel } from './TelemetryRpmChannel.js';
import { TelemetryLateralOffsetChannel } from './TelemetryLateralOffsetChannel.js';
import { TelemetryAccelLatChannel } from './TelemetryAccelLatChannel.js';
import { TelemetryAccelLonChannel } from './TelemetryAccelLonChannel.js';
import { TelemetryAccelTotalChannel } from './TelemetryAccelTotalChannel.js';
import { TelemetrySlipAngleChannel } from './TelemetrySlipAngleChannel.js';
import { TelemetryUndersteerChannel } from './TelemetryUndersteerChannel.js';
import { TelemetryTireSlipChannel } from './TelemetryTireSlipChannel.js';
import { TelemetryYawRateChannel } from './TelemetryYawRateChannel.js';

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
  switch (channelId) {
    case 'speed':
      return (
        <TelemetrySpeedChannel
          speedPath={paths.speedPath}
          baselineSpeedPath={paths.baselineSpeedPath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'delta':
      return pointComparisons.length > 0 ? (
        <TelemetryDeltaChannel
          deltaTimePath={paths.deltaTimePath}
          deltaTimeArea={paths.deltaTimeArea}
          deltaGainArea={paths.deltaGainArea}
          deltaLossArea={paths.deltaLossArea}
          deltaGradientStops={paths.deltaGradientStops}
          maxDeltaSec={paths.maxDeltaSec}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      ) : null;
    case 'throttle':
      return (
        <TelemetryThrottleChannel
          throttlePath={paths.throttlePath}
          throttleArea={paths.throttleArea}
          baselineThrottlePath={paths.baselineThrottlePath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'brake':
      return (
        <TelemetryBrakeChannel
          brakePath={paths.brakePath}
          brakeArea={paths.brakeArea}
          baselineBrakePath={paths.baselineBrakePath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'gear':
      return (
        <TelemetryGearChannel
          gearPath={paths.gearPath}
          baselineGearPath={paths.baselineGearPath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'steer':
      return (
        <TelemetrySteerChannel
          steerPath={paths.steerPath}
          baselineSteerPath={paths.baselineSteerPath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'rpm':
      return (
        <TelemetryRpmChannel
          rpmPath={paths.rpmPath}
          rpmArea={paths.rpmArea}
          baselineRpmPath={paths.baselineRpmPath}
          maxRpm={paths.maxRpm}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'lateral-offset':
      return (
        <TelemetryLateralOffsetChannel
          lateralOffsetPath={paths.lateralOffsetPath}
          baselineLateralOffsetPath={paths.baselineLateralOffsetPath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'accel-lat':
      return (
        <TelemetryAccelLatChannel
          accelLatPath={paths.accelLatPath}
          baselineAccelLatPath={paths.baselineAccelLatPath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'accel-lon':
      return (
        <TelemetryAccelLonChannel
          accelLonPath={paths.accelLonPath}
          baselineAccelLonPath={paths.baselineAccelLonPath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'accel-total':
      return (
        <TelemetryAccelTotalChannel
          accelTotalPath={paths.accelTotalPath}
          accelTotalArea={paths.accelTotalArea}
          baselineAccelTotalPath={paths.baselineAccelTotalPath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'slip-angle':
      return (
        <TelemetrySlipAngleChannel
          slipAnglePath={paths.slipAnglePath}
          baselineSlipAnglePath={paths.baselineSlipAnglePath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'under-over-steer':
      return (
        <TelemetryUndersteerChannel
          understeerPath={paths.understeerPath}
          baselineUndersteerPath={paths.baselineUndersteerPath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'tire-slip':
      return (
        <TelemetryTireSlipChannel
          tireSlipPath={paths.tireSlipPath}
          tireSlipArea={paths.tireSlipArea}
          baselineTireSlipPath={paths.baselineTireSlipPath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    case 'yaw-rate':
      return (
        <TelemetryYawRateChannel
          yawRatePath={paths.yawRatePath}
          baselineYawRatePath={paths.baselineYawRatePath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />
      );
    default:
      return null;
  }
});
