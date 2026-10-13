import type { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';
import type { PointComparison } from '../../../../utils/replayComparison.js';
import { GpsMapModeBar, type GpsMapModeBarProps } from './GpsMapModeBar.js';
import { ReplayFrictionCircle } from '../ReplayFrictionCircle.js';
import { GpsMapLapTimingPanel, type GpsMapLapTimingPanelProps } from './GpsMapLapTimingPanel.js';
import { liveSectorSplit } from './liveSectorSplit.js';

interface Props extends GpsMapModeBarProps, Omit<GpsMapLapTimingPanelProps, 'liveSplit'> {
  points: ReplayTrajectoryPoint[];
  currentIndex: number;
  primaryPoint?: ReplayTrajectoryPoint;
  baselinePoint?: ReplayTrajectoryPoint | null;
  baselinePoints: ReplayTrajectoryPoint[];
  comparisons?: PointComparison[] | null;
  sectors?: ReplayTrajectoryData['sectors'];
  deltaTimeSec?: number | null;
}

/** Fullscreen-only overlays, kept separate from the static track scene. */
export function GpsMapExpandedOverlays({ points, currentIndex, primaryPoint, baselinePoint,
  baselinePoints, primaryLapSummary, baselineLapSummary, comparisons, sectors, deltaTimeSec, ...controls }: Props) {
  const liveSplit = liveSectorSplit(sectors, currentIndex, comparisons, deltaTimeSec);
  return <>
    {/* One column: below 2xl the mode bar stacks above the timing panel, so a wrapped bar pushes
        the panel down instead of overlapping it. At 2xl the bar is centred and the panel sits right. */}
    <div className="pointer-events-none absolute inset-x-3 top-16 z-30 flex flex-col items-end gap-2 2xl:top-3 2xl:items-center">
      <GpsMapModeBar {...controls} />
      <GpsMapLapTimingPanel primaryLapSummary={primaryLapSummary} baselineLapSummary={baselineLapSummary} liveSplit={liveSplit} />
    </div>
    {controls.showFrictionCircle && (
      <div className="absolute bottom-3.5 right-3 sm:right-3.5 z-30 select-none pointer-events-auto">
        <ReplayFrictionCircle points={points} currentIndex={currentIndex} onClose={controls.onToggleFrictionCircle}
          primaryPoint={primaryPoint} baselinePoint={baselinePoint} baselinePoints={baselinePoints}
          className="bg-lmu-strip/90 border border-lmu-border backdrop-blur-md shadow-2xl rounded-xl" />
      </div>
    )}
  </>;
}
