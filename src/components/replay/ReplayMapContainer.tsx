import React, { useMemo } from 'react';
import { ReplayTelemetryPoint, ReplayTrajectoryData } from '../../../server/types.js';
import { GpsTrackMap } from './GpsTrackMap.js';
import { GpsZoomMap } from './GpsZoomMap.js';
import { ReplayTelemetryHud } from './ReplayTelemetryHud.js';
import { CornerApexChart } from './CornerApexChart.js';
import { MapColorMode } from './replayMapUtils.js';
import { CornerSegmentComparison, computeCumulativeDistances } from '../../utils/replayComparison.js';

export interface ReplayMapContainerProps {
  trajectory: ReplayTrajectoryData;
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  colorBy: MapColorMode;
  mapViewMode: 'dual' | 'overview' | 'zoom';
  onChangeMapViewMode: (mode: 'dual' | 'overview' | 'zoom') => void;
  isCompareMode: boolean;
  baselineTrajectory?: ReplayTrajectoryData | null;
  currentPoint?: ReplayTelemetryPoint | null;
  corners?: CornerSegmentComparison[];
  selectedCornerNumber?: number | null;
  onSelectCornerNumber?: (cornerNumber: number | null) => void;
}

export const ReplayMapContainer: React.FC<ReplayMapContainerProps> = ({
  trajectory,
  currentIndex,
  onSelectIndex,
  colorBy,
  mapViewMode,
  onChangeMapViewMode,
  isCompareMode,
  baselineTrajectory,
  currentPoint,
  corners,
  selectedCornerNumber,
  onSelectCornerNumber,
}) => {
  const baselinePoints = isCompareMode && baselineTrajectory ? baselineTrajectory.points : undefined;

  const selectedCorner = useMemo(
    () => corners?.find(c => c.cornerNumber === selectedCornerNumber) || null,
    [corners, selectedCornerNumber]
  );
  const primaryDists = useMemo(() => computeCumulativeDistances(trajectory.points), [trajectory.points]);
  const baselineDists = useMemo(() => computeCumulativeDistances(baselinePoints || []), [baselinePoints]);

  const apexChart = selectedCorner ? (
    <CornerApexChart
      corner={selectedCorner}
      primaryPoints={trajectory.points}
      primaryDists={primaryDists}
      baselinePoints={baselinePoints}
      baselineDists={baselineDists}
      onClose={() => onSelectCornerNumber?.(null)}
      className="h-24 shrink-0"
    />
  ) : null;

  return (
    <>
      <div className="flex items-center justify-between px-0.5 shrink-0 text-xs">
        <div className="flex items-center gap-1 bg-lmu-dark p-1 rounded-lg border border-lmu-border/60">
          {(['dual', 'zoom', 'overview'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => onChangeMapViewMode(mode)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                mapViewMode === mode ? 'bg-lmu-accent text-white shadow' : 'text-lmu-muted hover:text-white'
              }`}
            >
              {mode === 'dual' ? 'Dual View' : mode === 'zoom' ? 'Close-Up Line' : 'Full Circuit'}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-lmu-muted font-mono hidden sm:inline">
          {mapViewMode === 'dual' ? 'Overview + Close-Up' : mapViewMode === 'zoom' ? 'Apex Detail' : 'Circuit Map'}
        </span>
      </div>

      {/* MAP VIEWS */}
      {mapViewMode === 'dual' ? (
        <div className="flex flex-col gap-2.5 flex-1 min-h-0 h-full">
          <div className="flex-[1] min-h-0 rounded-xl bg-[#060910] border border-lmu-border p-2 flex items-center justify-center relative overflow-hidden">
            <GpsTrackMap
              points={trajectory.points}
              bounds={trajectory.bounds}
              currentIndex={currentIndex}
              onSelectIndex={onSelectIndex}
              colorBy={colorBy}
              className="w-full h-full"
              baselinePoints={baselinePoints}
              corners={corners}
              selectedCornerNumber={selectedCornerNumber}
              onSelectCornerNumber={onSelectCornerNumber}
            />
          </div>
          <div className="flex-[2] min-h-0 rounded-xl overflow-hidden">
            <GpsZoomMap
              points={trajectory.points}
              currentIndex={currentIndex}
              onSelectIndex={onSelectIndex}
              colorBy={colorBy}
              className="w-full h-full"
              baselinePoints={baselinePoints}
            />
          </div>
          {apexChart}
        </div>
      ) : mapViewMode === 'overview' ? (
        <div className="flex flex-col gap-2.5 flex-1 min-h-0 h-full">
          <div className="flex-1 min-h-0 rounded-xl bg-[#060910] border border-lmu-border p-2 flex items-center justify-center relative overflow-hidden">
            <GpsTrackMap
              points={trajectory.points}
              bounds={trajectory.bounds}
              currentIndex={currentIndex}
              onSelectIndex={onSelectIndex}
              colorBy={colorBy}
              className="w-full h-full"
              baselinePoints={baselinePoints}
              corners={corners}
              selectedCornerNumber={selectedCornerNumber}
              onSelectCornerNumber={onSelectCornerNumber}
            />
          </div>
          {apexChart}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 flex-1 min-h-0 h-full">
          <div className="flex-1 min-h-0 rounded-xl overflow-hidden">
            <GpsZoomMap
              points={trajectory.points}
              currentIndex={currentIndex}
              onSelectIndex={onSelectIndex}
              colorBy={colorBy}
              className="w-full h-full"
              baselinePoints={baselinePoints}
            />
          </div>
          {apexChart}
        </div>
      )}

      <ReplayTelemetryHud currentPoint={currentPoint} />
    </>
  );
};
