import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import type { TrackBoundaryGeometry } from '../../../../shared/types/trackGeometry.js';
import { MapFullscreenButton } from '../map/display/MapFullscreenButton.js';
import { MapViewSwitchButton } from '../map/display/MapViewSwitchButton.js';
import { MapControlsOverlay } from '../map/MapControlsOverlay.js';
import { GpsCircuitMinimap } from '../map/GpsCircuitMinimap.js';
import { ReplayTelemetryHud } from '../inspector/ReplayTelemetryHud.js';
import { GpsMapTelemetryHud } from '../map/display/GpsMapTelemetryHud.js';
import { GpsMapTelemetryDock } from '../map/telemetry/GpsMapTelemetryDock.js';
import { GpsMapExpandedOverlays } from '../map/display/GpsMapExpandedOverlays.js';
import { ReplayFrictionCircle } from '../map/ReplayFrictionCircle.js';
import { HeatmapLegendBar } from '../map/HeatmapLegendBar.js';
import { useGpsSceneDynamics } from '../map/scene/useGpsSceneDynamics.js';
import { GpsMapModeBar } from '../map/display/GpsMapModeBar.js';
import { useStoredToggle } from '../map/useStoredToggle.js';
import {
  projectTrajectoryPoints, projectBoundaryPoints, computeTrackBoundaryPathD, buildContinuousSvgPath,
  type MapColorMode,
} from '../map/replayMapUtils.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { useReplayScene } from './laps/useReplayScene.js';
import { CameraModeControl, useCameraModeShortcuts, type CameraMode } from './cameraModes.js';
import { useGpsMapShortcuts } from '../map/useGpsMapShortcuts.js';
import { ReplayShortcutHelp } from '../ReplayShortcutHelp.js';

interface Props {
  trajectory: ReplayTrajectoryData;
  baseline: ReplayTrajectoryData | null;
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onReturnTo2D: () => void;
  /** The 2D map's line colouring, shared so both views show the same line. */
  colorBy?: MapColorMode;
  onChangeColorBy?: (mode: MapColorMode) => void;
  currentPoint?: ReplayTrajectoryPoint | null;
  fadedLine?: 'none' | 'primary' | 'baseline';
  onToggleFadedLine?: (line: 'primary' | 'baseline') => void;
  trackGeometry?: TrackBoundaryGeometry | null;
  showFrictionCircle?: boolean;
  onToggleFrictionCircle?: () => void;
  isExpanded?: boolean;
  onToggleExpanded?: (expanded: boolean) => void;
}

export default function Replay3DView({trajectory, baseline, currentIndex, onSelectIndex, isPlaying, onTogglePlay, onReturnTo2D, colorBy = 'default', onChangeColorBy, currentPoint, fadedLine, onToggleFadedLine, trackGeometry, showFrictionCircle, onToggleFrictionCircle, isExpanded: controlledExpanded, onToggleExpanded}: Props) {
  const map = useRef<HTMLDivElement>(null), [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;
  const handleToggleExpanded = (expanded?: boolean) => {
    const next = typeof expanded === 'boolean' ? expanded : !isExpanded;
    if (onToggleExpanded) onToggleExpanded(next);
    else setInternalExpanded(next);
  };
  const host = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<CameraMode>('follow'), [retry, setRetry] = useState(0);
  const [internalFadedLine, setInternalFadedLine] = useState<'none' | 'primary' | 'baseline'>('none');
  const [isTraceHidden, toggleTrace] = useStoredToggle('lmu-map-trace-collapsed-v1', false);
  const activeFadedLine = fadedLine ?? internalFadedLine;
  const {scene, state} = useReplayScene({host, trajectory, baseline, currentIndex, mode, colorBy, fadedLine: activeFadedLine, retry});
  const handleToggleFadedLine = onToggleFadedLine ?? ((line: 'primary' | 'baseline') => setInternalFadedLine(f => (f === line ? 'none' : line)));

  const [localShowFriction, toggleLocalFriction] = useState(false);
  const effectiveShowFriction = showFrictionCircle ?? localShowFriction;
  const handleToggleFriction = onToggleFrictionCircle ?? (() => toggleLocalFriction(value => !value));
  const baselinePoints = useMemo(() => baseline?.points ?? [], [baseline]);
  const svgPoints = useMemo(() => projectTrajectoryPoints(trajectory.points, trajectory.bounds, 800, 60), [trajectory.points, trajectory.bounds]);
  const { activeIndex, currentPos, baselineGhostPos, comparisons, currentPrimaryPoint, currentDeltaTimeSec, currentLineDistM } = useGpsSceneDynamics({
    points: trajectory.points, baselinePoints, svgPoints, bounds: trajectory.bounds, currentIndex, trackLengthM: trajectory.trackLengthM,
  });
  const activePrimaryPoint = currentPrimaryPoint ?? currentPoint ?? null;
  const primaryLapSummary = trajectory.laps?.find(l => l.lapNumber === trajectory.currentLap) ?? trajectory.laps?.[0];
  const baselineLapSummary = baseline?.laps?.find(l => l.lapNumber === baseline.currentLap) ?? baseline?.laps?.[0];

  const trackBoundaryPathD = useMemo(() => {
    if (trackGeometry?.centerline?.length) {
      const centerSvg = projectBoundaryPoints(trackGeometry.centerline, trajectory.bounds, 800, 60);
      const leftSvg = trackGeometry.leftBoundary ? projectBoundaryPoints(trackGeometry.leftBoundary, trajectory.bounds, 800, 60) : [];
      const rightSvg = trackGeometry.rightBoundary ? projectBoundaryPoints(trackGeometry.rightBoundary, trajectory.bounds, 800, 60) : [];
      return computeTrackBoundaryPathD(centerSvg, leftSvg, rightSvg);
    }
    return buildContinuousSvgPath(svgPoints);
  }, [trackGeometry, trajectory.bounds, svgPoints]);

  useCameraModeShortcuts(map, setMode);
  useGpsMapShortcuts({isExpanded, containerRef: map, points: trajectory.points, currentIndex, onSelectIndex,
    onZoomIn: () => scene.current?.zoom(1), onZoomOut: () => scene.current?.zoom(-1), onResetZoom: () => scene.current?.reset(),
    // Follow, chase, cockpit and trackside stay locked on the car, so a keyboard pan hands the camera over to free orbit.
    onPan: (horizontal, vertical) => { if (mode === 'follow' || mode === 'chase' || mode === 'trackside' || mode === 'cockpit') setMode('orbit'); scene.current?.pan(horizontal, vertical); },
    onCenter: () => scene.current?.center(),
    onToggleFollow: () => setMode(value => value === 'follow' || value === 'chase' || value === 'cockpit' ? 'orbit' : 'follow'),
    onToggleTrace: toggleTrace, onTogglePlay, onToggleExpanded: () => handleToggleExpanded()});
  useEffect(() => { map.current?.focus({preventScroll: true}); }, []);
  // What drives the car and wheels, for the curious: hover the toolbar rather than read it under every frame.
  const sources = state?.ready ? [state.cars, state.wheelMotion, baseline ? 'Same-station ghost' : ''].filter(Boolean).join(' · ') : undefined;

  return (
    <div ref={map} data-replay-surface="map" data-replay-view="3d" data-map-expanded={isExpanded ? '' : undefined} tabIndex={0}
      className="relative flex flex-col w-full h-full min-h-[360px] bg-lmu-deep overflow-hidden [&[data-map-expanded]]:fixed [&[data-map-expanded]]:inset-0 [&[data-map-expanded]]:z-[1000] [&[data-map-expanded]]:w-screen [&[data-map-expanded]]:h-screen outline-none">
      {!isExpanded && (
        <div data-testid="replay-3d-toolbar" title={sources} className="flex items-start justify-between px-2 py-1 gap-2 shrink-0 text-xs border-b border-lmu-border bg-lmu-deep">

          <GpsMapModeBar embedded className="min-w-0 flex-1" colorBy={colorBy} onChangeColorBy={onChangeColorBy} hasBaseline={Boolean(baseline)}
            isCompareMode={Boolean(baseline)} fadedLine={activeFadedLine} onToggleFadedLine={handleToggleFadedLine}
            showFrictionCircle={effectiveShowFriction} onToggleFrictionCircle={handleToggleFriction} />
        </div>
      )}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div ref={host} tabIndex={0} onPointerDown={event => event.currentTarget.focus({preventScroll: true})}
          aria-label="3D track. Drag to orbit, scroll to zoom. Left/Right: step replay. WASD: pan camera." className="relative w-full h-full outline-none" />
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_24px_rgba(6,9,16,0.35)]" />
        <GpsCircuitMinimap trackBoundaryPathD={trackBoundaryPathD} layoutPathD={trackBoundaryPathD} currentPos={currentPos} baselineGhostPos={baselineGhostPos} isExpanded={isExpanded}
          className="rounded-xl border border-lmu-border bg-lmu-strip/70 p-2" />
        <MapControlsOverlay onZoomIn={() => scene.current?.zoom(1)} onZoomOut={() => scene.current?.zoom(-1)} onReset={() => scene.current?.reset()}
          followCar={mode === 'follow' || mode === 'chase' || mode === 'cockpit'} onToggleFollowCar={() => setMode(value => (value === 'follow' || value === 'chase' || value === 'cockpit' ? 'orbit' : 'follow'))}
          onCenterCar={() => scene.current?.center()} isPlaying={isPlaying} onTogglePlay={onTogglePlay}
          orientation={isExpanded ? 'horizontal' : 'vertical'} className="top-2 right-3 bottom-auto">
          <CameraModeControl mode={mode} onChange={setMode} />
          <ReplayShortcutHelp view="3d" />
          <MapViewSwitchButton view="3d" onToggleView={onReturnTo2D} />
          <MapFullscreenButton isExpanded={isExpanded} onToggleExpanded={handleToggleExpanded} />
        </MapControlsOverlay>
        <HeatmapLegendBar colorBy={colorBy} />
        {isExpanded && <GpsMapExpandedOverlays points={trajectory.points} currentIndex={activeIndex}
          primaryLapSummary={primaryLapSummary} baselineLapSummary={baselineLapSummary} comparisons={comparisons}
          sectors={trajectory.sectors} deltaTimeSec={currentDeltaTimeSec} primaryPoint={activePrimaryPoint ?? undefined}
          baselinePoint={baselineGhostPos?.point ?? null} baselinePoints={baselinePoints}
          colorBy={colorBy} onChangeColorBy={onChangeColorBy} isCompareMode={Boolean(baseline)} hasBaseline={Boolean(baseline)}
          fadedLine={activeFadedLine} onToggleFadedLine={handleToggleFadedLine}
          showFrictionCircle={effectiveShowFriction} onToggleFrictionCircle={handleToggleFriction} />}
        {!state?.ready && <div className="absolute inset-x-0 top-1/3 px-8 text-center text-sm text-lmu-text-soft pointer-events-auto" role={state?.error ? 'alert' : 'status'}>
          <p>{state?.error ?? 'Loading 3D track surfaces…'}</p>
          {state?.error && <button type="button" onClick={() => setRetry(value => value + 1)} className={`mt-3 px-3 py-1.5 rounded bg-lmu-raised ${FOCUS_RING}`}>Retry 3D scene</button>}
        </div>}
        {state?.warning && <p role="status" className="absolute bottom-12 left-2 z-30 px-3 py-1 rounded bg-lmu-strip/80 backdrop-blur-sm text-xs text-lmu-warn">Using estimated car geometry: {state.warning}</p>}
      </div>
      {isExpanded && onSelectIndex ? (
        <GpsMapTelemetryDock points={trajectory.points} baselinePoints={baseline?.points} comparisons={comparisons} currentIndex={currentIndex}
          onSelectIndex={onSelectIndex} trackLengthM={trajectory.trackLengthM} source={trajectory.source} sectors={trajectory.sectors}
          isPlaying={isPlaying} onTogglePlay={onTogglePlay} traceHidden={isTraceHidden} onToggleTrace={toggleTrace}
          hud={<GpsMapTelemetryHud primaryPoint={activePrimaryPoint} baselinePoint={baselineGhostPos?.point} deltaTimeSec={currentDeltaTimeSec} lineDistanceM={currentLineDistM} />} />
      ) : (
        <div className="shrink-0 bg-lmu-deep">
          {effectiveShowFriction && <ReplayFrictionCircle points={trajectory.points} currentIndex={activeIndex}
            primaryPoint={activePrimaryPoint} baselinePoint={baselineGhostPos?.point ?? null} baselinePoints={baselinePoints}
            onClose={handleToggleFriction} />}
          <ReplayTelemetryHud currentPoint={activePrimaryPoint} />
        </div>
      )}
    </div>
  );
}
