import type { ReplayTelemetryPoint } from '../../../../../shared/types/index.js';
import { GpsMapTelemetryHud } from './GpsMapTelemetryHud.js';
import { GpsMapModeBar, type GpsMapModeBarProps } from './GpsMapModeBar.js';
import { ReplayFrictionCircle } from '../ReplayFrictionCircle.js';

interface Props extends GpsMapModeBarProps {
  points: ReplayTelemetryPoint[];
  currentIndex: number;
  primaryPoint?: ReplayTelemetryPoint;
  baselinePoint?: ReplayTelemetryPoint | null;
  baselinePoints: ReplayTelemetryPoint[];
  deltaTimeSec?: number | null;
  lineDistanceM?: number | null;
}

/** Fullscreen-only overlays, kept separate from the static track scene. */
export function GpsMapExpandedOverlays({ points, currentIndex, primaryPoint, baselinePoint,
  baselinePoints, deltaTimeSec, lineDistanceM, ...controls }: Props) {
  return <>
    <GpsMapTelemetryHud primaryPoint={primaryPoint} baselinePoint={baselinePoint}
      deltaTimeSec={deltaTimeSec} lineDistanceM={lineDistanceM} />
    <GpsMapModeBar {...controls} />
    {controls.showFrictionCircle && (
      <div className="absolute bottom-40 2xl:bottom-3.5 right-3 sm:right-3.5 z-30 select-none pointer-events-auto">
        <ReplayFrictionCircle points={points} currentIndex={currentIndex} onClose={controls.onToggleFrictionCircle}
          primaryPoint={primaryPoint} baselinePoint={baselinePoint} baselinePoints={baselinePoints}
          className="bg-lmu-strip/90 border border-lmu-border backdrop-blur-md shadow-2xl rounded-xl" />
      </div>
    )}
  </>;
}
