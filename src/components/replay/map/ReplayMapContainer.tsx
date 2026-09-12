import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Disc } from 'lucide-react';
import { ReplayTelemetryPoint, ReplayTrajectoryData } from '../../../../server/types.js';
import { GpsTrackMap } from './GpsTrackMap.js';
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
  onChangeColorBy?: (mode: MapColorMode) => void;
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
  onChangeColorBy,
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
    const markers: Array<{ cornerNumber: number; distM: number; kind: 'brake' | 'throttle'; isBaseline?: boolean }> = [];
    corners.forEach(c => {
      if (c.primaryBrakingDistM !== null) {
        markers.push({ cornerNumber: c.cornerNumber, distM: c.primaryBrakingDistM, kind: 'brake', isBaseline: false });
      }
      if (c.primaryThrottleOnDistM !== null) {
        markers.push({ cornerNumber: c.cornerNumber, distM: c.primaryThrottleOnDistM, kind: 'throttle', isBaseline: false });
      }
      if (isCompareMode && baselinePoints && baselinePoints.length > 0) {
        if (c.baselineBrakingDistM !== null) {
          markers.push({ cornerNumber: c.cornerNumber, distM: c.baselineBrakingDistM, kind: 'brake', isBaseline: true });
        }
        if (c.baselineThrottleOnDistM !== null) {
          markers.push({ cornerNumber: c.cornerNumber, distM: c.baselineThrottleOnDistM, kind: 'throttle', isBaseline: true });
        }
      }
    });
    return markers;
  }, [corners, isCompareMode, baselinePoints]);

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
      isCompareMode={Boolean(isCompareMode && baselinePoints && baselinePoints.length > 0)}
      onClose={() => onSelectCornerNumber?.(null)}
      className="shrink-0"
    />
  ) : null;

  return (
    <>
      <div className="flex items-center justify-between px-0.5 shrink-0 text-xs">
        <div className="flex items-center gap-1.5">
          {onChangeColorBy && (
            <div className="flex items-center gap-1 bg-lmu-bg p-1 rounded-lg border border-lmu-border/60">
              {(['pedal', 'speed', ...(isCompareMode && baselinePoints ? (['delta'] as const) : [])] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => onChangeColorBy(mode)}
                  title={`Color by ${mode}`}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold capitalize transition-all cursor-pointer ${
                    colorBy === mode ? 'bg-lmu-card border border-lmu-accent text-white shadow-sm font-bold' : 'text-lmu-muted hover:text-white'
                  }`}
                >
                  {mode === 'pedal' ? 'Pedal' : mode === 'speed' ? 'Speed' : 'Delta'}
                </button>
              ))}
            </div>
          )}
          {corners && corners.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPedalMarkers(v => !v)}
              title={showPedalMarkers ? 'Hide brake/throttle points' : 'Show brake/throttle points'}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                showPedalMarkers
                  ? 'bg-rose-500/20 border-rose-500/60 text-rose-300 shadow-sm'
                  : 'bg-lmu-bg border-lmu-border/60 text-lmu-muted hover:text-white hover:border-lmu-border'
              }`}
            >
              <Disc className="w-3 h-3 text-rose-400" />
              <span>Pedal Points</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {baselinePoints ? (
            <div className="flex items-center gap-1 bg-lmu-bg p-1 rounded-lg border border-lmu-border/60">
              <button
                onClick={() => setFadedLine(f => (f === 'primary' ? 'none' : 'primary'))}
                title={fadedLine === 'primary' ? 'Show my line' : 'Fade my line'}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                  fadedLine === 'primary'
                    ? 'text-lmu-muted bg-slate-800/40 opacity-60'
                    : 'text-sky-300 bg-sky-950/40 border border-sky-500/40 hover:text-white hover:bg-sky-900/50'
                }`}
              >
                <span className="w-2.5 h-1 rounded-sm bg-sky-400 shrink-0" />
                {fadedLine === 'primary' ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                Mine
              </button>
              <button
                onClick={() => setFadedLine(f => (f === 'baseline' ? 'none' : 'baseline'))}
                title={fadedLine === 'baseline' ? 'Show baseline line' : 'Fade baseline line'}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                  fadedLine === 'baseline'
                    ? 'text-lmu-muted bg-slate-800/40 opacity-60'
                    : 'text-amber-300 bg-amber-950/40 border border-amber-500/40 hover:text-white hover:bg-amber-900/50'
                }`}
              >
                <span className="w-2.5 h-0 border-b-2 border-dashed border-amber-400 shrink-0" />
                {fadedLine === 'baseline' ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                Baseline
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-lmu-muted font-mono hidden sm:inline">
              Circuit Map & Racing Line
            </span>
          )}
        </div>
      </div>

      {/* SINGLE UNIFIED MAP PANE */}
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

      <ReplayTelemetryHud currentPoint={currentPoint} />
    </>
  );
};
