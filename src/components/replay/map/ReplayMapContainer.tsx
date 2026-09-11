import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Disc } from 'lucide-react';
import { ReplayTelemetryPoint, ReplayTrajectoryData } from '../../../../server/types.js';
import { GpsTrackMap } from './GpsTrackMap.js';
import { GpsZoomMap } from './GpsZoomMap.js';
import { ReplayTelemetryHud } from '../modal/ReplayTelemetryHud.js';
import { CornerApexChart } from '../analysis/CornerApexChart.js';
import { MapColorMode } from './replayMapUtils.js';
import { computeCumulativeDistances } from '../../../utils/replayComparison.js';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis.js';

export interface ReplayMapContainerProps {
  trajectory: ReplayTrajectoryData | null;
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

  // Lets the driver fade out either lap's line on the map to make the delta easier to read.
  const [fadedLine, setFadedLine] = useState<'none' | 'primary' | 'baseline'>('none');
  const primaryOpacity = fadedLine === 'primary' ? 0.12 : 1;
  const baselineOpacity = fadedLine === 'baseline' ? 0.12 : 1;
  const [showPedalMarkers, setShowPedalMarkers] = useState<boolean>(false);

  const pedalMarkers = useMemo(() => {
    if (!corners || corners.length === 0) return [];
    const markers: Array<{ cornerNumber: number; distM: number; kind: 'brake' | 'throttle' }> = [];
    corners.forEach(c => {
      if (c.primaryBrakingDistM !== null) markers.push({ cornerNumber: c.cornerNumber, distM: c.primaryBrakingDistM, kind: 'brake' });
      if (c.primaryThrottleOnDistM !== null) markers.push({ cornerNumber: c.cornerNumber, distM: c.primaryThrottleOnDistM, kind: 'throttle' });
    });
    return markers;
  }, [corners]);

  const selectedCorner = useMemo(
    () => corners?.find(c => c.cornerNumber === selectedCornerNumber) || null,
    [corners, selectedCornerNumber]
  );
  const primaryDists = useMemo(() => computeCumulativeDistances(trajectory?.points || []), [trajectory]);
  const baselineDists = useMemo(() => computeCumulativeDistances(baselinePoints || []), [baselinePoints]);

  if (!trajectory) return null;

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
        <div className="flex items-center gap-1.5">
          {corners && corners.length > 0 && (
            <button
              onClick={() => setShowPedalMarkers(v => !v)}
              title={showPedalMarkers ? 'Hide brake/throttle points' : 'Show brake/throttle points'}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                showPedalMarkers
                  ? 'bg-lmu-accent/15 border-lmu-accent text-white'
                  : 'bg-lmu-dark border-lmu-border/60 text-lmu-muted hover:text-white'
              }`}
            >
              <Disc className="w-3 h-3" />
              Pedal Points
            </button>
          )}
          {baselinePoints ? (
            <div className="flex items-center gap-1 bg-lmu-dark p-1 rounded-lg border border-lmu-border/60">
              <button
                onClick={() => setFadedLine(f => (f === 'primary' ? 'none' : 'primary'))}
                title={fadedLine === 'primary' ? 'Show my line' : 'Fade my line'}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                  fadedLine === 'primary' ? 'text-lmu-muted' : 'text-sky-400 hover:text-sky-300'
                }`}
              >
                {fadedLine === 'primary' ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                Mine
              </button>
              <button
                onClick={() => setFadedLine(f => (f === 'baseline' ? 'none' : 'baseline'))}
                title={fadedLine === 'baseline' ? 'Show baseline line' : 'Fade baseline line'}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                  fadedLine === 'baseline' ? 'text-lmu-muted' : 'text-amber-400 hover:text-amber-300'
                }`}
              >
                {fadedLine === 'baseline' ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                Baseline
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-lmu-muted font-mono hidden sm:inline">
              {mapViewMode === 'dual' ? 'Overview + Close-Up' : mapViewMode === 'zoom' ? 'Apex Detail' : 'Circuit Map'}
            </span>
          )}
        </div>
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
              primaryOpacity={primaryOpacity}
              baselineOpacity={baselineOpacity}
              pedalMarkers={pedalMarkers}
              showPedalMarkers={showPedalMarkers}
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
              primaryOpacity={primaryOpacity}
              baselineOpacity={baselineOpacity}
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
              primaryOpacity={primaryOpacity}
              baselineOpacity={baselineOpacity}
              pedalMarkers={pedalMarkers}
              showPedalMarkers={showPedalMarkers}
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
              primaryOpacity={primaryOpacity}
              baselineOpacity={baselineOpacity}
            />
          </div>
          {apexChart}
        </div>
      )}

      <ReplayTelemetryHud currentPoint={currentPoint} />
    </>
  );
};
