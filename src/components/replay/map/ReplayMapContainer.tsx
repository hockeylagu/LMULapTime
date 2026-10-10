import React, { useMemo, useState } from 'react';
import { CircleDot, Disc } from 'lucide-react';
import { ReplayTelemetryPoint, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { GpsTrackMap } from './GpsTrackMap.js';
import { ReplayTelemetryHud } from '../inspector/ReplayTelemetryHud.js';
import { MapColorMode } from './replayMapUtils.js';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis/index.js';
import { TrackBoundaryGeometry } from './useTrackBoundaryGeometry.js';
import { ReplayFrictionCircle } from './ReplayFrictionCircle.js';
import { TrackCircuitLayout } from '../../track-detail/TrackCircuitLayout.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';

export interface ReplayMapContainerProps {
  trajectory: ReplayTrajectoryData | null;
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  colorBy: MapColorMode;
  onChangeColorBy?: (mode: MapColorMode) => void;
  isCompareMode: boolean;
  baselineTrajectory?: ReplayTrajectoryData | null;
  primaryCarClass?: string;
  baselineCarClass?: string;
  currentPoint?: ReplayTelemetryPoint | null;
  corners?: CornerSegmentComparison[];
  selectedCornerNumber?: number | null;
  onSelectCornerNumber?: (cornerNumber: number | null) => void;
  trackVenue?: string;
  trackCourse?: string;
  layoutKey?: string;
  trackGeometry?: TrackBoundaryGeometry | null;
  onOpenCornersTab?: () => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
}

export const ReplayMapContainer: React.FC<ReplayMapContainerProps> = ({
  trajectory,
  currentIndex,
  onSelectIndex,
  colorBy,
  onChangeColorBy,
  isCompareMode,
  baselineTrajectory,
  primaryCarClass,
  baselineCarClass,
  currentPoint,
  corners,
  selectedCornerNumber,
  onSelectCornerNumber,
  trackVenue,
  trackCourse,
  layoutKey,
  trackGeometry,
  isPlaying,
  onTogglePlay,
}) => {
  const baselinePoints = isCompareMode && baselineTrajectory ? baselineTrajectory.points : undefined;

  // Lets the driver fade out either lap's line on the map to make the delta easier to read.
  const [fadedLine, setFadedLine] = useState<'none' | 'primary' | 'baseline'>('none');
  const primaryOpacity = fadedLine === 'primary' ? 0.12 : 1;
  const baselineOpacity = fadedLine === 'baseline' ? 0.12 : 1;
  const [showPedalMarkers, setShowPedalMarkers] = useState<boolean>(false);
  const [showFrictionCircle, setShowFrictionCircle] = useState<boolean>(false);

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
  const highlightDistRange = useMemo(() => selectedCorner
    ? { startDistM: selectedCorner.entryDistM, endDistM: selectedCorner.exitDistM }
    : null, [selectedCorner]);

  if (!trajectory) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between px-2 py-1 gap-2 shrink-0 text-xs">
        <div className="flex items-center gap-1.5">
          {onChangeColorBy && (
            <div className="flex items-center gap-1">
              {(['pedal', 'speed', ...(isCompareMode && baselinePoints ? (['delta'] as const) : [])] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => onChangeColorBy(mode)}
                  title={`Color by ${mode}`}
                  aria-pressed={colorBy === mode}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold capitalize transition-all cursor-pointer ${
                    colorBy === mode ? 'bg-lmu-raised text-white' : 'text-lmu-muted hover:text-white'
                  } ${FOCUS_RING}`}
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
              aria-pressed={showPedalMarkers}
              title={showPedalMarkers ? 'Hide brake/throttle points' : 'Show brake/throttle points'}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                showPedalMarkers
                  ? 'bg-lmu-raised text-white'
                  : 'text-lmu-muted hover:text-white hover:bg-lmu-raised/50'
              } ${FOCUS_RING}`}
            >
              <Disc className="w-3 h-3 text-lmu-loss" />
              <span>Pedal Points</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {baselinePoints ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFadedLine(f => (f === 'primary' ? 'none' : 'primary'))}
                aria-label={fadedLine === 'primary' ? 'Restore primary line' : 'Fade primary line'}
                title={fadedLine === 'primary' ? 'Restore primary line' : 'Fade primary line'}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                  fadedLine === 'primary'
                    ? 'text-lmu-faint bg-lmu-raised/40 hover:text-lmu-text-soft'
                    : 'text-lmu-text-soft hover:text-white hover:bg-lmu-raised/50'
                } ${FOCUS_RING}`}
              >
                <span className="w-2.5 h-1 rounded-sm bg-lmu-info shrink-0" />
                Primary
              </button>
              <button
                onClick={() => setFadedLine(f => (f === 'baseline' ? 'none' : 'baseline'))}
                aria-label={fadedLine === 'baseline' ? 'Restore baseline line' : 'Fade baseline line'}
                title={fadedLine === 'baseline' ? 'Restore baseline line' : 'Fade baseline line'}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                  fadedLine === 'baseline'
                    ? 'text-lmu-faint bg-lmu-raised/40 hover:text-lmu-text-soft'
                    : 'text-lmu-text-soft hover:text-white hover:bg-lmu-raised/50'
                } ${FOCUS_RING}`}
              >
                <span className="w-2.5 h-0 border-b-2 border-dashed border-lmu-warn shrink-0" />
                Baseline
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setShowFrictionCircle(value => !value)}
            title={showFrictionCircle ? 'Hide friction circle' : 'Show friction circle'}
            aria-label={showFrictionCircle ? 'Hide friction circle' : 'Show friction circle'}
            aria-pressed={showFrictionCircle}
            className={`h-7 px-2 flex items-center justify-center gap-1.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
              showFrictionCircle
                ? 'bg-lmu-raised text-white'
                : 'text-lmu-muted hover:text-white hover:bg-lmu-raised/50'
            } ${FOCUS_RING}`}
          >
            <CircleDot className="w-4 h-4" />
            <span>Friction</span>
          </button>
        </div>
      </div>

      {trajectory.stationSource === 'odometer' && <div className="flex items-center gap-2 px-2 text-xs text-lmu-muted"><TrackCircuitLayout trackName={trackVenue || ''} trackCourse={trackCourse} layoutKey={layoutKey} size="session" /><p>Basic layout and recorded trajectory. Detailed road, kerb, banking and corner analysis need local track data.</p></div>}
      {/* SINGLE UNIFIED MAP PANE */}
      <div className="flex flex-col gap-0 flex-1 min-h-0 h-full">
        <div className="flex-1 min-h-0 bg-lmu-deep p-0 flex items-center justify-center relative overflow-hidden">
          <GpsTrackMap
            points={trajectory.points}
            bounds={trajectory.bounds}
            currentIndex={currentIndex}
            onSelectIndex={onSelectIndex}
            isPlaying={isPlaying}
            onTogglePlay={onTogglePlay}
            colorBy={colorBy}
            className="w-full h-full"
            baselinePoints={baselinePoints}
            primaryCarClass={trajectory.vehicleIdentity?.carClass ?? primaryCarClass}
            primaryVehicleData={trajectory.vehicleData}
            baselineVehicleData={baselineTrajectory?.vehicleData}
            baselineCarClass={baselineTrajectory?.vehicleIdentity?.carClass ?? baselineCarClass}
            corners={corners}
            selectedCornerNumber={selectedCornerNumber}
            onSelectCornerNumber={onSelectCornerNumber}
            primaryOpacity={primaryOpacity}
            baselineOpacity={baselineOpacity}
            pedalMarkers={pedalMarkers}
            showPedalMarkers={showPedalMarkers}
            onChangeColorBy={onChangeColorBy}
            onTogglePedalMarkers={() => setShowPedalMarkers(v => !v)}
            fadedLine={fadedLine}
            onToggleFadedLine={line => setFadedLine(f => (f === line ? 'none' : line))}
            showFrictionCircle={showFrictionCircle}
            onToggleFrictionCircle={() => setShowFrictionCircle(v => !v)}
            dimNonSelectedTrack={Boolean(selectedCorner)}
            highlightDistRange={highlightDistRange}
            trackVenue={trackVenue}
            trackCourse={trackCourse}
            layoutKey={layoutKey}
            dataPluginRevision={trajectory.dataPluginRevision}
            trackGeometry={trackGeometry}
            trackLengthM={trajectory.trackLengthM}
          />
        </div>
      </div>

      {showFrictionCircle && (
        <ReplayFrictionCircle
          points={trajectory.points}
          currentIndex={currentIndex}
          primaryPoint={currentPoint}
          baselinePoints={baselinePoints}
        />
      )}
      <ReplayTelemetryHud currentPoint={currentPoint} />
    </>
  );
};
