import React, { lazy, Suspense, useMemo, useState } from 'react';
import { ReplayTrajectoryPoint, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { GpsTrackMapScene } from './scene/GpsTrackMapScene.js';
import { ReplayTelemetryHud } from '../inspector/ReplayTelemetryHud.js';
import { MapColorMode } from './replayMapUtils.js';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis/types.js';
import { TrackBoundaryGeometry } from '../../../../shared/types/trackGeometry.js';
import { ReplayFrictionCircle } from './ReplayFrictionCircle.js';
import { TrackCircuitLayout } from '../../track-detail/TrackCircuitLayout.js';
import { GpsMapModeBar } from './display/GpsMapModeBar.js';
import { useStoredToggle } from './useStoredToggle.js';
import { GhostSyncContext, ghostSyncControls, useGhostSync } from '../inspector/ghostSyncContext.js';
import { Replay3DLoading } from '../view3d/scene/Replay3DLoading.js';

const Replay3DView = lazy(() => import('../view3d/laps/Replay3DView.js'));

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
  currentPoint?: ReplayTrajectoryPoint | null;
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
  view?: '2d' | '3d';
  onChangeView?: (view: '2d' | '3d') => void;
  isExpanded?: boolean;
  onToggleExpanded?: (expanded: boolean) => void;
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
  view: controlledView,
  onChangeView,
  isExpanded: controlledExpanded,
  onToggleExpanded,
}) => {
  const baselinePoints = isCompareMode && baselineTrajectory ? baselineTrajectory.points : undefined;
  // The inspector's ghost sync, or one shared by this map's bar, 2D scene and 3D view.
  const ghostSync = useGhostSync();

  // Lets the driver fade out either lap's line on the map to make the delta easier to read.
  const [fadedLine, setFadedLine] = useState<'none' | 'primary' | 'baseline'>('none');
  const primaryOpacity = fadedLine === 'primary' ? 0.12 : 1;
  const baselineOpacity = fadedLine === 'baseline' ? 0.12 : 1;
  const [showPedalMarkers, setShowPedalMarkers] = useState<boolean>(false);
  const [showFrictionCircle, setShowFrictionCircle] = useState<boolean>(false);
  const [showGForce, toggleGForce] = useStoredToggle('lmu-map-gforce-v1', true);
  const [uncontrolledView, setUncontrolledView] = useState<'2d' | '3d'>('2d');
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false);
  const activeView = controlledView ?? uncontrolledView;
  const [kept3d, setKept3d] = useState(false);
  const isExpanded = controlledExpanded ?? uncontrolledExpanded;

  const handleToggleView = (nextView: '2d' | '3d') => {
    if (controlledView === undefined) setUncontrolledView(nextView);
    onChangeView?.(nextView);
  };

  const handleToggleExpanded = (expanded?: boolean) => {
    const next = typeof expanded === 'boolean' ? expanded : !isExpanded;
    if (controlledExpanded === undefined) setUncontrolledExpanded(next);
    onToggleExpanded?.(next);
  };

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

  // Once opened, the 3D view stays loaded while the page shows: back in 2D it is hidden (its keys and drawing stop).
  const is3d = activeView === '3d';
  if (is3d && !kept3d) setKept3d(true);
  const view3d = (is3d || kept3d) && <div className="contents" hidden={!is3d}>
    <Suspense fallback={<div className="relative h-full min-h-[360px] w-full bg-lmu-deep"><Replay3DLoading onRetry={() => {}} /></div>}>
      <Replay3DView trajectory={trajectory} baseline={isCompareMode ? baselineTrajectory ?? null : null} active={is3d}
        currentIndex={currentIndex} onSelectIndex={onSelectIndex} isPlaying={isPlaying} onTogglePlay={onTogglePlay} onReturnTo2D={() => handleToggleView('2d')}
        colorBy={colorBy} onChangeColorBy={onChangeColorBy} currentPoint={currentPoint} fadedLine={fadedLine}
        onToggleFadedLine={line => setFadedLine(f => (f === line ? 'none' : line))} trackGeometry={trackGeometry}
        isExpanded={is3d && isExpanded} onToggleExpanded={handleToggleExpanded}
        showFrictionCircle={showFrictionCircle} onToggleFrictionCircle={() => setShowFrictionCircle(value => !value)}
        focusCorner={selectedCorner} onLeaveCorner={onSelectCornerNumber && (() => onSelectCornerNumber(null))} />
    </Suspense>
  </div>;

  return (
    <GhostSyncContext.Provider value={ghostSync}>
      {view3d}
      {!is3d && <>
      {!isExpanded && <div className="flex items-start justify-end px-2 py-1 gap-2 shrink-0 text-xs">
        <GpsMapModeBar embedded className="min-w-0 flex-1" colorBy={colorBy} onChangeColorBy={onChangeColorBy}
          isCompareMode={isCompareMode} hasBaseline={Boolean(baselinePoints)} fadedLine={fadedLine}
          onToggleFadedLine={line => setFadedLine(value => value === line ? 'none' : line)}
          showGForce={showGForce} onToggleGForce={toggleGForce}
          showFrictionCircle={showFrictionCircle} onToggleFrictionCircle={() => setShowFrictionCircle(value => !value)}
          {...ghostSyncControls(ghostSync)} />
      </div>}

      {trajectory.stationSource === 'odometer' && <div className="flex items-center gap-2 px-2 text-xs text-lmu-muted"><TrackCircuitLayout trackName={trackVenue || ''} trackCourse={trackCourse} layoutKey={layoutKey} size="session" /><p>Basic layout and recorded trajectory. Detailed road, kerb, banking and corner analysis need local track data.</p></div>}
      {/* SINGLE UNIFIED MAP PANE */}
      <div className="flex flex-col gap-0 flex-1 min-h-0 h-full">
        <div className="flex-1 min-h-0 bg-lmu-deep p-0 flex items-center justify-center relative overflow-hidden">
          <GpsTrackMapScene
            points={trajectory.points}
            source={trajectory.source}
            sectors={trajectory.sectors}
            primaryLapSummary={trajectory.laps?.find(lap => lap.lapNumber === trajectory.currentLap)}
            baselineLapSummary={isCompareMode ? baselineTrajectory?.laps?.find(lap => lap.lapNumber === baselineTrajectory.currentLap) : undefined}
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
            showGForce={showGForce} onToggleGForce={toggleGForce}
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
            isExpanded={isExpanded}
            onToggleExpanded={handleToggleExpanded}
            onToggleView={() => handleToggleView('3d')}
            cornerCardTrajectory={trajectory}
            cornerCardBaseline={isCompareMode ? baselineTrajectory : null}
          />
        </div>
      </div>

      {showFrictionCircle && !isExpanded && (
        <ReplayFrictionCircle
          points={trajectory.points}
          currentIndex={currentIndex}
          primaryPoint={currentPoint ?? trajectory.points[currentIndex]}
          baselinePoints={baselinePoints}
        />
      )}
      {!isExpanded && <ReplayTelemetryHud currentPoint={currentPoint ?? trajectory.points[currentIndex]} />}
      </>}
    </GhostSyncContext.Provider>
  );
};
