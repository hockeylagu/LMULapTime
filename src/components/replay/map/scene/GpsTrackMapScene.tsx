import React, { useMemo, useState } from 'react';
import { computeDispersedCornerMarkers, computePedalMarkerPoints, computeBaselineDeltaByIdx } from '../replayMapUtils.js';
import { HeatmapLegendBar } from '../HeatmapLegendBar.js';
import { GpsSceneHudOverlay } from './GpsSceneHudOverlay.js';
import { GpsSceneMarkers } from './GpsSceneMarkers.js';
import { GpsSceneCarMarkers, replayBodyHeading } from './GpsSceneCarMarkers.js';
import { resolveCarAcceleration } from './gpsCarDynamicsHelpers.js';
import { useGpsMapPanZoom } from '../useGpsMapPanZoom.js';
import { GpsCircuitMinimap } from '../GpsCircuitMinimap.js';
import { GpsTrackSegments } from './GpsTrackSegments.js';
import { GpsStartFinishLine } from './GpsStartFinishLine.js';
import { placeStartFinish } from './startFinishPlacement.js';
import { buildRibbonIndex } from './cornerRibbonClearance.js';
import { GpsSectorMarkers, placeSectorMarkers } from './GpsSectorMarkers.js';
import { GpsMapBackground } from '../display/GpsMapBackground.js';
import { GpsBrakeMarkers } from '../display/GpsBrakeMarkers.js';
import { placeBrakeMarkers, showsFullBrakeBoards } from '../display/placeBrakeMarkers.js';
import { GpsMapControls } from '../display/GpsMapControls.js';
import { GpsMapExpandedOverlays } from '../display/GpsMapExpandedOverlays.js';
import { MapScaleBar } from '../display/MapScaleBar.js';
import { useMapLayers } from '../display/useMapLayers.js';
import { useGpsMapShortcuts } from '../useGpsMapShortcuts.js';
import { useStableCullViewBox } from '../useStableCullViewBox.js';
import type { GpsTrackMapProps } from '../gpsTrackMapTypes.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { GpsMapTelemetryDock } from '../telemetry/GpsMapTelemetryDock.js';
import { GpsMapTelemetryHud } from '../display/GpsMapTelemetryHud.js';
import { useStoredToggle } from '../useStoredToggle.js';
import { useGpsSceneProjection, VIEWBOX_SIZE, PADDING } from './useGpsSceneProjection.js';
import { useGpsSceneDynamics } from './useGpsSceneDynamics.js';
import { useGpsSceneCameraFocus } from './useGpsSceneCameraFocus.js';

// Stable when Turns is hidden, so marker memos do not recompute on every frame.
const NO_CORNER_MARKERS: ReturnType<typeof computeDispersedCornerMarkers> = [];

export const GpsTrackMapScene: React.FC<GpsTrackMapProps> = (props) => {
  const {
    points, currentIndex, onSelectIndex, colorBy = 'pedal', className = '',
    baselinePoints, primaryCarClass, baselineCarClass, primaryVehicleData, baselineVehicleData,
    corners, selectedCornerNumber, onSelectCornerNumber, primaryOpacity = 1, baselineOpacity = 1,
    pedalMarkers, showPedalMarkers = false, showMinimap = true, showLegend = true, showControls = true, controlsOrientation,
    highlightDistRange, dimNonSelectedTrack = false, showCornerFlags = true,
    trackLengthM, isPlaying, onTogglePlay,
    onChangeColorBy, onTogglePedalMarkers, fadedLine, onToggleFadedLine, showFrictionCircle, onToggleFrictionCircle,
  } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const [localShowFriction, setLocalShowFriction] = useState(false);
  const effectiveShowFriction = showFrictionCircle ?? localShowFriction;
  const handleToggleFriction = onToggleFrictionCircle ?? (() => setLocalShowFriction(v => !v));
  const { layers, changeLayers } = useMapLayers();
  const [showGForce, handleToggleGForce] = useStoredToggle('lmu-map-gforce-v1', true);
  const [isTraceHidden, toggleTrace] = useStoredToggle('lmu-map-trace-collapsed-v1', false);

  const {
    geometry: effectiveGeometry, display, displayError, effectiveBaselinePoints, effectiveBounds, svgPoints, baselineSvgPoints,
    leftSvgPoints, rightSvgPoints, centerlineSvgPoints, trackBoundaryPathD, gateLeftSvg, gateRightSvg, pathD, sectorMarkers,
  } = useGpsSceneProjection(props);
  const {
    activeIndex, fraction, currentPos, primaryDists, baselineDists, comparisons, deltaByIdx, currentDeltaTimeSec,
    currentPrimaryPoint, baselineGhostPos, currentLineDistM, baselineHeadingIndex, baselineHeadingFraction, baselineBodyHeading,
  } = useGpsSceneDynamics({ points, baselinePoints: effectiveBaselinePoints, svgPoints, bounds: effectiveBounds, currentIndex, trackLengthM });

  const camera = useGpsMapPanZoom({
    viewBoxSize: VIEWBOX_SIZE,
    currentPos,
    initialZoom: props.initialZoom,
    initialFollowCar: props.initialFollowCar,
  });
  const { zoomLevel, containerRef, viewportRef, currentViewBox, handlePointerDown, handlePointerMove,
    handlePointerUp, handleDoubleClick, resetPanZoom, focusOnPoint, markerScale, zoomIn, zoomOut, panBy, panTo } = camera;
  useGpsMapShortcuts({
    isExpanded,
    containerRef,
    points,
    currentIndex,
    onSelectIndex,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onResetZoom: resetPanZoom,
    onTogglePlay,
    onToggleGForce: handleToggleGForce,
    onToggleTrace: toggleTrace,
    onPan: panBy,
    onToggleExpanded: () => setIsExpanded(expanded => !expanded),
  });
  const cullViewBox = useStableCullViewBox(currentViewBox, zoomLevel >= 2.5);

  const isStationary = useMemo(() => ((effectiveBounds?.spanX ?? 0) < 25 && (effectiveBounds?.spanZ ?? 0) < 25) || (points.length > 0 && points.every(p => (p.speedKmh || 0) <= 1)), [effectiveBounds, points]);
  const baselineDeltaByIdx = useMemo(
    () => (colorBy === 'delta' ? computeBaselineDeltaByIdx(deltaByIdx, primaryDists, baselineDists) : null),
    [colorBy, deltaByIdx, baselineDists, primaryDists]
  );
  const pedalMarkerPoints = useMemo(
    () => computePedalMarkerPoints(showPedalMarkers, pedalMarkers, primaryDists, baselineDists, svgPoints, baselineSvgPoints, effectiveBaselinePoints),
    [showPedalMarkers, pedalMarkers, primaryDists, baselineDists, svgPoints, baselineSvgPoints, effectiveBaselinePoints]
  );
  const cornerMarkers = useMemo(
    () => computeDispersedCornerMarkers(corners, primaryDists, svgPoints, baselineSvgPoints, pedalMarkerPoints),
    [corners, primaryDists, svgPoints, baselineSvgPoints, pedalMarkerPoints]
  );
  useGpsSceneCameraFocus({ layoutKey: effectiveGeometry?.layoutKey, selectedCornerNumber, cornerMarkers, focusOnPoint, resetPanZoom });
  const markerTrajectories = useMemo(() => [svgPoints, baselineSvgPoints], [svgPoints, baselineSvgPoints]);
  const ribbonIndex = useMemo(() => buildRibbonIndex(leftSvgPoints, rightSvgPoints, markerTrajectories),
    [leftSvgPoints, rightSvgPoints, markerTrajectories]);
  const placedBrakes = useMemo(() => layers.brakeMarkers ? placeBrakeMarkers({ markers: display?.brakeMarkers ?? [],
    bounds: effectiveBounds, viewBoxSize: VIEWBOX_SIZE, padding: PADDING, markerScale, ribbon: ribbonIndex,
    showDistance: layers.brakeDistance, showAds: layers.brakeAds, showDigi: layers.brakeDigi }) : [],
  [layers.brakeMarkers, layers.brakeDistance, layers.brakeAds, layers.brakeDigi, display?.brakeMarkers, effectiveBounds, markerScale, ribbonIndex]);
  const brakeBoxes = useMemo(() => showsFullBrakeBoards(markerScale) ? placedBrakes.map(board => ({
    x: board.posX, y: board.posY, hw: (board.width / 2 + 0.7) * markerScale, hh: (board.height / 2 + 0.7) * markerScale,
  })) : [], [placedBrakes, markerScale]);
  const placedStart = useMemo(() => layers.startFinish ? placeStartFinish({ svgPoints, zoomLevel, markerScale,
    gateLeftSvg, gateRightSvg, obstacles: brakeBoxes, ribbon: ribbonIndex }) : null,
  [layers.startFinish, svgPoints, zoomLevel, markerScale, gateLeftSvg, gateRightSvg, brakeBoxes, ribbonIndex]);
  const timingObstacles = useMemo(() => [...brakeBoxes, ...(placedStart ? [placedStart.box] : [])], [brakeBoxes, placedStart]);
  const placedSectors = useMemo(() => layers.sectors ? placeSectorMarkers(sectorMarkers, markerScale, zoomLevel,
    timingObstacles, ribbonIndex) : [], [layers.sectors, sectorMarkers, markerScale, zoomLevel, timingObstacles, ribbonIndex]);
  // Keeps badges off the gate itself; pedal lines may still cross it.
  const gateReservation = useMemo(() => layers.startFinish && svgPoints.length ? [{ x: svgPoints[0].sx, y: svgPoints[0].sy,
    hw: 13 * markerScale, hh: 13 * markerScale }] : [], [layers.startFinish, svgPoints, markerScale]);
  const badgeObstacles = useMemo(() => [...timingObstacles,
    ...placedSectors.map(marker => ({ x: marker.x, y: marker.y, hw: marker.hw, hh: marker.hh }))],
  [timingObstacles, placedSectors]);
  const markerObstacles = useMemo(() => [...badgeObstacles, ...gateReservation], [badgeObstacles, gateReservation]);
  const visibleCornerMarkers = layers.turns ? cornerMarkers : NO_CORNER_MARKERS;
  const sectorGates = useMemo(() => placedSectors.flatMap(marker => marker.left ? [{ left: marker.left, right: marker.right }] : []), [placedSectors]);
  const sceneMarkerObstacles = useMemo(() => [...badgeObstacles, ...placedBrakes.map(board => {
    const x2 = showsFullBrakeBoards(markerScale) ? board.lineEndX : board.point.sx + board.ux * 7 * markerScale;
    const y2 = showsFullBrakeBoards(markerScale) ? board.lineEndY : board.point.sy + board.uy * 7 * markerScale;
    return { x: (board.point.sx + x2) / 2, y: (board.point.sy + y2) / 2,
      hw: Math.abs(x2 - board.point.sx) / 2 + 2 * markerScale, hh: Math.abs(y2 - board.point.sy) / 2 + 2 * markerScale };
  })], [badgeObstacles, placedBrakes, markerScale]);
  if (points.length === 0) {
    return <div className={`flex items-center justify-center h-64 text-lmu-muted text-sm ${className}`}>No GPS trajectory data available for this replay recording.</div>;
  }

  return (
    <div
      ref={containerRef} tabIndex={0} data-replay-surface="map" data-map-expanded={isExpanded ? '' : undefined}
      aria-label="Track map" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp} onDoubleClick={handleDoubleClick}
      className={`relative flex flex-col items-center select-none overflow-hidden overscroll-contain touch-none cursor-grab active:cursor-grabbing [&[data-map-expanded]]:fixed [&[data-map-expanded]]:inset-0 [&[data-map-expanded]]:z-[1000] [&[data-map-expanded]]:w-screen [&[data-map-expanded]]:h-screen [&[data-map-expanded]]:bg-lmu-bg ${className} ${FOCUS_RING}`}
    >
      <div ref={viewportRef} className="relative w-full flex-1 min-h-0 overflow-hidden">
      {showControls && (
        <GpsMapControls camera={camera} layers={layers} onChange={changeLayers} geometry={effectiveGeometry}
          display={display} error={displayError} bounds={effectiveBounds} left={leftSvgPoints} right={rightSvgPoints}
          center={centerlineSvgPoints} trajectory={svgPoints} hasSectors={sectorMarkers.length > 0} hasTurns={cornerMarkers.length > 0}
          pedalPoints={onTogglePedalMarkers ? { visible: showPedalMarkers, available: Boolean(pedalMarkers?.length), onToggle: onTogglePedalMarkers } : undefined}
          orientation={controlsOrientation ?? (isExpanded ? 'horizontal' : (dimNonSelectedTrack ? 'vertical' : 'horizontal'))}
          isPlaying={isPlaying} onTogglePlay={onTogglePlay} isExpanded={isExpanded} onToggleExpanded={setIsExpanded} />
      )}

      {showMinimap && (
        <GpsCircuitMinimap trackBoundaryPathD={trackBoundaryPathD} layoutPathD={trackBoundaryPathD}
          currentPos={currentPos} baselineGhostPos={baselineGhostPos} currentViewBox={currentViewBox} onPanTo={panTo}
          isExpanded={isExpanded} />
      )}

      <div className="relative w-full h-full">
        {/* No compositor layer or filter here: a layer keeps its old raster scale after a viewBox zoom, which blurs the badges. */}
        <svg viewBox={currentViewBox} className="w-full h-full" data-testid="gps-map-scene">
          <GpsMapBackground geometry={effectiveGeometry} display={display} bounds={effectiveBounds} layers={layers}
            left={leftSvgPoints} right={rightSvgPoints} center={centerlineSvgPoints} pathD={pathD} />

          {placedBrakes.length ? <GpsBrakeMarkers placement={placedBrakes} markerScale={markerScale}
            startFinishGate={placedStart?.gate} timingGates={sectorGates} obstacles={markerObstacles} /> : null}

          <GpsTrackSegments
            svgPoints={svgPoints} baselineSvgPoints={baselineSvgPoints} colorBy={colorBy}
            deltaByIdx={deltaByIdx} baselineDeltaByIdx={baselineDeltaByIdx}
            primaryOpacity={primaryOpacity} baselineOpacity={baselineOpacity} onSelectIndex={onSelectIndex}
            highlightDistRange={highlightDistRange} primaryDists={primaryDists} baselineDists={baselineDists}
            dimNonSelectedTrack={dimNonSelectedTrack} markerScale={markerScale}
            viewBox={cullViewBox}
          />

          {layers.sectors && <GpsSectorMarkers markers={placedSectors} markerScale={markerScale} obstacles={markerObstacles} />}
          {layers.startFinish && <GpsStartFinishLine placement={placedStart}
            svgPoints={svgPoints} zoomLevel={zoomLevel} markerScale={markerScale}
            cornerMarkers={visibleCornerMarkers} pedalMarkers={pedalMarkerPoints}
            gateLeftSvg={gateLeftSvg} gateRightSvg={gateRightSvg}
          />}

          <GpsSceneMarkers
            markerObstacles={sceneMarkerObstacles} reserved={gateReservation} trajectories={markerTrajectories} ribbon={ribbonIndex}
            leftBoundary={leftSvgPoints} rightBoundary={rightSvgPoints}
            cornerMarkers={visibleCornerMarkers} pedalMarkers={pedalMarkerPoints}
            selectedCornerNumber={selectedCornerNumber} onSelectCornerNumber={onSelectCornerNumber}
            onSelectIndex={onSelectIndex} markerScale={markerScale} zoomLevel={zoomLevel}
            primaryOpacity={primaryOpacity} baselineOpacity={baselineOpacity}
            dimNonSelectedTrack={dimNonSelectedTrack} showCornerFlags={showCornerFlags}
            viewBox={cullViewBox}
          />
        </svg>
        <GpsSceneCarMarkers
          viewBox={currentViewBox} primaryCarClass={primaryCarClass} primaryVehicleData={primaryVehicleData}
          baselineVehicleData={baselineVehicleData} baselineCarClass={baselineCarClass}
          unitsPerMeter={(VIEWBOX_SIZE - 2 * PADDING) / Math.max(effectiveBounds.spanX, effectiveBounds.spanZ, 1)}
          primaryHeadingDeg={replayBodyHeading(points, activeIndex, fraction)} baselineHeadingDeg={baselineBodyHeading}
          currentPos={currentPos} baselineGhostPos={baselineGhostPos}
          primaryAccel={showGForce ? resolveCarAcceleration(points, activeIndex, fraction) : undefined}
          baselineAccel={showGForce && effectiveBaselinePoints.length ? resolveCarAcceleration(effectiveBaselinePoints, baselineHeadingIndex, baselineHeadingFraction) : undefined}
          markerScale={markerScale} primaryOpacity={primaryOpacity} baselineOpacity={baselineOpacity}
        />
      </div>

      <GpsSceneHudOverlay isStationary={isStationary} />
      <MapScaleBar markerScale={markerScale} spanM={Math.max(effectiveBounds.spanX, effectiveBounds.spanZ)} />

      {showLegend && <HeatmapLegendBar colorBy={colorBy} />}

      {isExpanded && <GpsMapExpandedOverlays points={points} currentIndex={activeIndex}
            primaryLapSummary={props.primaryLapSummary} baselineLapSummary={props.baselineLapSummary} comparisons={comparisons} sectors={props.sectors} deltaTimeSec={currentDeltaTimeSec}
            primaryPoint={currentPrimaryPoint} baselinePoint={baselineGhostPos?.point ?? null} baselinePoints={effectiveBaselinePoints}
            colorBy={colorBy} onChangeColorBy={onChangeColorBy}
            isCompareMode={Boolean(baselinePoints)} hasBaseline={Boolean(baselinePoints)} fadedLine={fadedLine}
            onToggleFadedLine={onToggleFadedLine} showGForce={showGForce} onToggleGForce={handleToggleGForce}
            showFrictionCircle={effectiveShowFriction} onToggleFrictionCircle={handleToggleFriction} />}
      </div>
      {isExpanded && onSelectIndex && <GpsMapTelemetryDock points={points} baselinePoints={baselinePoints} comparisons={comparisons}
        currentIndex={currentIndex} onSelectIndex={onSelectIndex} trackLengthM={trackLengthM} source={props.source} sectors={props.sectors} onTogglePlay={onTogglePlay}
        isPlaying={isPlaying} traceHidden={isTraceHidden} onToggleTrace={toggleTrace}
        hud={<GpsMapTelemetryHud primaryPoint={currentPrimaryPoint} baselinePoint={baselineGhostPos?.point}
          deltaTimeSec={currentDeltaTimeSec} lineDistanceM={currentLineDistM} />} />}
    </div>
  );
};
