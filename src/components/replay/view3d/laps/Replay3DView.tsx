import { useMemo, useRef, useState } from 'react';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';
import type { TrackBoundaryGeometry } from '../../../../../shared/types/trackGeometry.js';
import { MapFullscreenButton } from '../../map/display/MapFullscreenButton.js';
import { GpsCircuitMinimap } from '../../map/GpsCircuitMinimap.js';
import { ReplayTelemetryHud } from '../../inspector/ReplayTelemetryHud.js';
import { GpsMapTelemetryHud } from '../../map/display/GpsMapTelemetryHud.js';
import { GpsMapTelemetryDock } from '../../map/telemetry/GpsMapTelemetryDock.js';
import { GpsMapExpandedOverlays } from '../../map/display/GpsMapExpandedOverlays.js';
import { ReplayFrictionCircle } from '../../map/ReplayFrictionCircle.js';
import { HeatmapLegendBar } from '../../map/HeatmapLegendBar.js';
import { useGpsSceneDynamics } from '../../map/scene/useGpsSceneDynamics.js';
import { GpsMapModeBar } from '../../map/display/GpsMapModeBar.js';
import { useStoredToggle } from '../../map/useStoredToggle.js';
import {
  projectTrajectoryPoints, projectBoundaryPoints, computeTrackBoundaryPathD, buildContinuousSvgPath,
  type MapColorMode,
} from '../../map/replayMapUtils.js';
import { useReplayScene } from './useReplayScene.js';
import { Scene3DFrame } from '../scene/Scene3DFrame.js';
import { carLockedCamera, followsCar, type CameraMode } from '../camera/cameraModes.js';
import { useGpsMapShortcuts } from '../../map/useGpsMapShortcuts.js';
import { ReplayShortcutHelp } from '../../ReplayShortcutHelp.js';
import { ghostSyncControls, toggleGhostMarker, useGhostSync } from '../../inspector/ghostSyncContext.js';
import { nextGhostSyncMode } from '../../map/ghostSync.js';
import type { CornerSegmentComparison } from '../../../../utils/cornerAnalysis/types.js';
import { useCornerFocus } from './useCornerFocus.js';
import { CornerFocusBar } from './CornerFocusBar.js';

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
  /** False while kept loaded behind the 2D map: the view is hidden and takes the focus again when shown. */
  active?: boolean;
  onToggleExpanded?: (expanded: boolean) => void;
  /** The corner picked in the inspector: the view repeats it (corner focus); null for none. */
  focusCorner?: CornerSegmentComparison | null;
  onLeaveCorner?: () => void;
}

export default function Replay3DView({trajectory, baseline, currentIndex, onSelectIndex, isPlaying, onTogglePlay, onReturnTo2D, colorBy = 'default', onChangeColorBy, currentPoint, fadedLine, onToggleFadedLine, trackGeometry, showFrictionCircle, onToggleFrictionCircle, isExpanded: controlledExpanded, onToggleExpanded, active = true, focusCorner = null, onLeaveCorner}: Props) {
  const map = useRef<HTMLDivElement>(null), [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;
  const handleToggleExpanded = (expanded?: boolean) => {
    const next = typeof expanded === 'boolean' ? expanded : !isExpanded;
    if (onToggleExpanded) onToggleExpanded(next);
    else setInternalExpanded(next);
  };
  const host = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<CameraMode>('chase'), [retry, setRetry] = useState(0);
  const [internalFadedLine, setInternalFadedLine] = useState<'none' | 'primary' | 'baseline'>('none');
  const [isTraceHidden, toggleTrace] = useStoredToggle('lmu-map-trace-collapsed-v1', false);
  const [showLines, toggleLines] = useStoredToggle('lmu-3d-racing-lines-v1', true);
  const activeFadedLine = fadedLine ?? internalFadedLine;
  const ghostSync = useGhostSync(), syncControls = ghostSyncControls(ghostSync);
  const {scene, state} = useReplayScene({host, trajectory, baseline, currentIndex, mode, colorBy, fadedLine: activeFadedLine, showLines, retry,
    syncMode: ghostSync.mode, anchorDistM: ghostSync.markerDistM});
  const handleToggleFadedLine = onToggleFadedLine ?? ((line: 'primary' | 'baseline') => setInternalFadedLine(f => (f === line ? 'none' : line)));

  const [localShowFriction, toggleLocalFriction] = useState(false);
  const effectiveShowFriction = showFrictionCircle ?? localShowFriction;
  const handleToggleFriction = onToggleFrictionCircle ?? (() => toggleLocalFriction(value => !value));
  const baselinePoints = useMemo(() => baseline?.points ?? [], [baseline]);
  const svgPoints = useMemo(() => projectTrajectoryPoints(trajectory.points, trajectory.bounds, 800, 60), [trajectory.points, trajectory.bounds]);
  const { activeIndex, primaryDists, currentPos, baselineGhostPos, comparisons, currentPrimaryPoint, currentDeltaTimeSec } = useGpsSceneDynamics({
    points: trajectory.points, baselinePoints, svgPoints, bounds: trajectory.bounds, currentIndex, trackLengthM: trajectory.trackLengthM,
    syncMode: ghostSync.mode, anchorDistM: ghostSync.markerDistM,
  });
  const activePrimaryPoint = currentPrimaryPoint ?? currentPoint ?? null;
  const cornerFocus = useCornerFocus({scene, sceneState: state, points: trajectory.points, primaryDists, corner: focusCorner, compared: Boolean(baseline), active,
    mode, setMode, onSelectIndex});
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

  useGpsMapShortcuts({isExpanded, containerRef: map, points: trajectory.points, currentIndex, onSelectIndex,
    onZoomIn: () => scene.current?.zoom(1), onZoomOut: () => scene.current?.zoom(-1), onResetZoom: () => scene.current?.reset(),
    onPan: (horizontal, vertical) => { if (carLockedCamera(mode)) setMode('orbit'); scene.current?.pan(horizontal, vertical); },
    onCenter: () => scene.current?.center(),
    onToggleFollow: () => setMode(value => followsCar(value) ? 'orbit' : 'follow'),
    onCycleGhostSync: baseline ? () => ghostSync.setMode(nextGhostSyncMode(ghostSync.mode, ghostSync.markerDistM !== null)) : undefined,
    onToggleMarker: () => toggleGhostMarker(ghostSync, primaryDists[activeIndex] ?? 0),
    onToggleTrace: toggleTrace, onTogglePlay, onToggleExpanded: () => handleToggleExpanded(), onToggleView: onReturnTo2D});
  // What drives the car and wheels, for the curious: hover the toolbar rather than read it under every frame.
  const sources = state?.ready ? [state.cars, state.wheelMotion, baseline ? {distance: 'Same-station ghost', time: 'Same-time ghost', anchored: 'Ghost on time from marker A'}[ghostSync.mode] : ''].filter(Boolean).join(' · ') : undefined;

  return (
    <Scene3DFrame surface={map} host={host} scene={scene} state={state} mode={mode} onModeChange={setMode} followMode="follow"
      onRetry={() => setRetry(value => value + 1)} onToggleView={onReturnTo2D} active={active} expanded={isExpanded}
      isPlaying={isPlaying} onTogglePlay={onTogglePlay} streamingClassName={isExpanded && effectiveShowFriction ? 'bottom-48' : 'bottom-2'}
      className="w-full h-full min-h-[360px] [&[data-map-expanded]]:fixed [&[data-map-expanded]]:inset-0 [&[data-map-expanded]]:z-[1000] [&[data-map-expanded]]:w-screen [&[data-map-expanded]]:h-screen"
      controlsBefore={<ReplayShortcutHelp view="3d" />} controlsAfter={<MapFullscreenButton isExpanded={isExpanded} onToggleExpanded={handleToggleExpanded} />}
      top={!isExpanded && (
        <div data-testid="replay-3d-toolbar" title={sources} className="flex items-start justify-between px-2 py-1 gap-2 shrink-0 text-xs border-b border-lmu-border bg-lmu-deep">
          <GpsMapModeBar embedded className="min-w-0 flex-1" colorBy={colorBy} onChangeColorBy={onChangeColorBy} hasBaseline={Boolean(baseline)}
            isCompareMode={Boolean(baseline)} fadedLine={activeFadedLine} onToggleFadedLine={handleToggleFadedLine}
            showFrictionCircle={effectiveShowFriction} onToggleFrictionCircle={handleToggleFriction}
            showRacingLines={showLines} onToggleRacingLines={toggleLines} {...syncControls} />
        </div>
      )}
      overlays={<>
        <HeatmapLegendBar colorBy={colorBy} />
        {cornerFocus.focused && focusCorner && onLeaveCorner && <CornerFocusBar corner={focusCorner} compared={Boolean(baseline)}
          looping={cornerFocus.looping} onToggleLoop={cornerFocus.toggleLoop} onFrame={cornerFocus.frame} onClose={onLeaveCorner} />}
        {isExpanded && <GpsMapExpandedOverlays points={trajectory.points} currentIndex={activeIndex}
          primaryLapSummary={primaryLapSummary} baselineLapSummary={baselineLapSummary} comparisons={comparisons}
          sectors={trajectory.sectors} deltaTimeSec={currentDeltaTimeSec} primaryPoint={activePrimaryPoint ?? undefined}
          baselinePoint={baselineGhostPos?.point ?? null} baselinePoints={baselinePoints}
          colorBy={colorBy} onChangeColorBy={onChangeColorBy} isCompareMode={Boolean(baseline)} hasBaseline={Boolean(baseline)}
          fadedLine={activeFadedLine} onToggleFadedLine={handleToggleFadedLine}
          showFrictionCircle={effectiveShowFriction} onToggleFrictionCircle={handleToggleFriction}
          showRacingLines={showLines} onToggleRacingLines={toggleLines} {...syncControls} />}
      </>}
      bottom={isExpanded && onSelectIndex ? (
        <GpsMapTelemetryDock points={trajectory.points} baselinePoints={baseline?.points} comparisons={comparisons} currentIndex={currentIndex}
          onSelectIndex={onSelectIndex} trackLengthM={trajectory.trackLengthM} source={trajectory.source} sectors={trajectory.sectors}
          isPlaying={isPlaying} onTogglePlay={onTogglePlay} traceHidden={isTraceHidden} onToggleTrace={toggleTrace}
          hud={<GpsMapTelemetryHud primaryPoint={activePrimaryPoint} baselinePoint={baselineGhostPos?.point} deltaTimeSec={currentDeltaTimeSec} />} />
      ) : (
        <div className="shrink-0 bg-lmu-deep">
          {effectiveShowFriction && <ReplayFrictionCircle points={trajectory.points} currentIndex={activeIndex}
            primaryPoint={activePrimaryPoint} baselinePoint={baselineGhostPos?.point ?? null} baselinePoints={baselinePoints}
            onClose={handleToggleFriction} />}
          <ReplayTelemetryHud currentPoint={activePrimaryPoint} />
        </div>
      )}>
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_24px_rgba(6,9,16,0.35)]" />
      <GpsCircuitMinimap trackBoundaryPathD={trackBoundaryPathD} layoutPathD={trackBoundaryPathD} currentPos={currentPos} baselineGhostPos={baselineGhostPos} isExpanded={isExpanded}
        className="rounded-xl border border-lmu-border bg-lmu-strip/70 p-2" />
    </Scene3DFrame>
  );
}
