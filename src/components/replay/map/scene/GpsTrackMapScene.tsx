import React, { useMemo, useRef, useEffect, useState } from 'react';
import { computeLapComparisons } from '../../../../utils/replayComparison.js';
import { getTrajectoryDistances, getDistancesInReferenceFrame, findIndexAtDistance } from '../../../../utils/lapAlignment.js';
import {
  projectTrajectoryPoints,
  projectBoundaryPoints,
  computeTrackBoundaryPathD,
  buildContinuousSvgPath,
  computeGhostPosition,
  computeDispersedCornerMarkers,
  computePedalMarkerPoints,
  computeEffectiveBounds,
  computeBaselineDeltaByIdx,
  projectStartFinishGate,
} from '../replayMapUtils.js';
import { HeatmapLegendBar } from '../HeatmapLegendBar.js';
import { GpsSceneHudOverlay } from './GpsSceneHudOverlay.js';
import { GpsSceneMarkers } from './GpsSceneMarkers.js';
import { GpsSceneCarMarkers, replayBodyHeading } from './GpsSceneCarMarkers.js';
import { useGpsMapPanZoom } from '../useGpsMapPanZoom.js';
import { GpsCircuitMinimap } from '../GpsCircuitMinimap.js';
import { GpsTrackSegments } from './GpsTrackSegments.js';
import { GpsStartFinishLine } from './GpsStartFinishLine.js';
import { GpsMapBackground } from '../display/GpsMapBackground.js';
import { GpsBrakeMarkers } from '../display/GpsBrakeMarkers.js';
import { GpsMapControls } from '../display/GpsMapControls.js';
import { MapScaleBar } from '../display/MapScaleBar.js';
import { useMapDisplay } from '../display/useMapDisplay.js';
import { activeTrackBounds } from '../display/mapLayers.js';
import { useMapLayers, projectedPointBounds } from '../display/useMapLayers.js';
import { useTrackBoundaryGeometry } from '../useTrackBoundaryGeometry.js';
import { usePlaybackPosition } from '../../inspector/replayPlaybackCursor.js';
import { useGpsMapShortcuts } from '../useGpsMapShortcuts.js';

import type { GpsTrackMapSceneProps } from '../gpsTrackMapTypes.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';

export type { GpsTrackMapSceneProps } from '../gpsTrackMapTypes.js';

export const GpsTrackMapScene: React.FC<GpsTrackMapSceneProps> = (props) => {
  const {
    points, bounds, currentIndex, onSelectIndex, colorBy = 'pedal', className = '',
    baselinePoints, primaryCarClass, baselineCarClass, primaryVehicleData, baselineVehicleData, corners, selectedCornerNumber, onSelectCornerNumber,
    primaryOpacity = 1, baselineOpacity = 1, pedalMarkers, showPedalMarkers = false,
    showMinimap = true, showLegend = true, showControls = true, controlsOrientation,
    highlightDistRange, dimNonSelectedTrack = false, showCornerFlags = true,
    trackVenue, trackCourse, layoutKey, replayName, dataPluginRevision, trackGeometry, trackLengthM, mapDisplay,
    isPlaying, onTogglePlay,
  } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const VIEWBOX_SIZE = 800;
  const PADDING = 60;

  const { trackGeometry: fetchedGeometry } = useTrackBoundaryGeometry({
    packageRevision: dataPluginRevision,
    layoutKey: trackGeometry === undefined ? layoutKey : null,
    trackVenue: trackGeometry === undefined ? trackVenue : null,
    trackCourse: trackGeometry === undefined ? trackCourse : null,
    replayName: trackGeometry === undefined ? replayName : null,
  });
  const effectiveGeometry = trackGeometry !== undefined ? trackGeometry : fetchedGeometry;
  const { display, error: displayError } = useMapDisplay(effectiveGeometry, mapDisplay);
  const { layers, changeLayers } = useMapLayers();
  const activeBounds = useMemo(() => activeTrackBounds(effectiveGeometry), [effectiveGeometry]);

  const effectiveBaselinePoints = useMemo(() => baselinePoints ?? [], [baselinePoints]);

  const effectiveBounds = useMemo(
    () => computeEffectiveBounds(bounds, activeBounds, effectiveBaselinePoints),
    [bounds, activeBounds, effectiveBaselinePoints]
  );

  const svgPoints = useMemo(() => projectTrajectoryPoints(points, effectiveBounds, VIEWBOX_SIZE, PADDING), [points, effectiveBounds]);
  const baselineSvgPoints = useMemo(
    () => projectTrajectoryPoints(effectiveBaselinePoints, effectiveBounds, VIEWBOX_SIZE, PADDING),
    [effectiveBaselinePoints, effectiveBounds]
  );
  const playbackPosition = usePlaybackPosition(points, currentIndex);
  const fraction = playbackPosition?.fraction ?? 0;
  const samplePos = svgPoints[Math.min(currentIndex, svgPoints.length - 1)] || svgPoints[0];
  const nextPos = svgPoints[currentIndex + 1] ?? samplePos;
  const currentPos = useMemo(() => samplePos && nextPos ? {
    sx: samplePos.sx + (nextPos.sx - samplePos.sx) * fraction,
    sy: samplePos.sy + (nextPos.sy - samplePos.sy) * fraction,
  } : samplePos, [samplePos, nextPos, fraction]);

  const { leftSvgPoints, rightSvgPoints, centerlineSvgPoints } = useMemo(() => ({
    leftSvgPoints: effectiveGeometry?.leftBoundary ? projectBoundaryPoints(effectiveGeometry.leftBoundary, effectiveBounds, VIEWBOX_SIZE, PADDING) : [],
    rightSvgPoints: effectiveGeometry?.rightBoundary ? projectBoundaryPoints(effectiveGeometry.rightBoundary, effectiveBounds, VIEWBOX_SIZE, PADDING) : [],
    centerlineSvgPoints: effectiveGeometry?.centerline ? projectBoundaryPoints(effectiveGeometry.centerline, effectiveBounds, VIEWBOX_SIZE, PADDING) : [],
  }), [effectiveGeometry, effectiveBounds]);
  const trackBoundaryPathD = useMemo(
    () => computeTrackBoundaryPathD(centerlineSvgPoints, leftSvgPoints, rightSvgPoints),
    [centerlineSvgPoints, leftSvgPoints, rightSvgPoints]
  );

  const { gateLeftSvg, gateRightSvg } = useMemo(
    () => projectStartFinishGate(effectiveGeometry, effectiveBounds, VIEWBOX_SIZE, PADDING),
    [effectiveGeometry, effectiveBounds]
  );

  const camera = useGpsMapPanZoom({ viewBoxSize: VIEWBOX_SIZE, currentPos });
  const { zoomLevel, containerRef, currentViewBox, handlePointerDown, handlePointerMove,
    handlePointerUp, handleDoubleClick, resetPanZoom, focusOnPoint, markerScale } = camera;
  useGpsMapShortcuts({
    isExpanded,
    containerRef,
    points,
    currentIndex,
    onSelectIndex,
    onZoomIn: camera.zoomIn,
    onZoomOut: camera.zoomOut,
    onResetZoom: camera.resetPanZoom,
    onTogglePlay,
  });
  const fittedLayout = useRef<string | null>(null);
  useEffect(() => {
    const key = effectiveGeometry?.layoutKey ?? null;
    if (!key || fittedLayout.current === key) return;
    fittedLayout.current = key;
    const points = leftSvgPoints.length && rightSvgPoints.length ? [...leftSvgPoints, ...rightSvgPoints] : svgPoints;
    const rectangle = projectedPointBounds(points);
    if (rectangle) camera.fitBounds(rectangle);
  }, [effectiveGeometry?.layoutKey, leftSvgPoints, rightSvgPoints, svgPoints, camera]);

  const pathD = useMemo(() => buildContinuousSvgPath(svgPoints), [svgPoints]);
  const isStationary = useMemo(() => ((effectiveBounds?.spanX ?? 0) < 25 && (effectiveBounds?.spanZ ?? 0) < 25) || (points.length > 0 && points.every(p => (p.speedKmh || 0) <= 1)), [effectiveBounds, points]);

  const primaryDists = useMemo(() => getTrajectoryDistances(points, trackLengthM), [points, trackLengthM]);
  // Baseline distances in the PRIMARY lap's frame (station-matched), the same frame corner
  // analysis reports baseline brake/throttle points and corner ranges in.
  const baselineDists = useMemo(
    () => (effectiveBaselinePoints.length > 0 ? getDistancesInReferenceFrame(effectiveBaselinePoints, points, trackLengthM) : []),
    [effectiveBaselinePoints, points, trackLengthM]
  );

  const deltaByIdx = useMemo(() => {
    if (colorBy !== 'delta' || !baselinePoints || baselinePoints.length === 0) return null;
    return computeLapComparisons(points, baselinePoints, trackLengthM).map(c => c.deltaTimeSec);
  }, [colorBy, points, baselinePoints, trackLengthM]);

  const baselineDeltaByIdx = useMemo(
    () => (colorBy === 'delta' ? computeBaselineDeltaByIdx(deltaByIdx, primaryDists, baselineDists) : null),
    [colorBy, deltaByIdx, baselineDists, primaryDists]
  );
  const baselineGhostPos = useMemo(() => {
    return computeGhostPosition(
      primaryDists,
      baselineDists,
      effectiveBaselinePoints,
      currentIndex + fraction,
      effectiveBounds,
      VIEWBOX_SIZE,
      PADDING
    );
  }, [primaryDists, baselineDists, effectiveBaselinePoints, currentIndex, fraction, effectiveBounds]);

  // Use the same distance station as ghost position, with shortest-arc body yaw interpolation.
  const primaryDistance = (primaryDists[currentIndex] ?? 0)
    + ((primaryDists[currentIndex + 1] ?? primaryDists[currentIndex] ?? 0) - (primaryDists[currentIndex] ?? 0)) * fraction;
  let baselineHeadingIndex = findIndexAtDistance(baselineDists, primaryDistance);
  if (baselineHeadingIndex > 0 && baselineDists[baselineHeadingIndex] > primaryDistance) baselineHeadingIndex--;
  const baselineHeadingSpan = (baselineDists[baselineHeadingIndex + 1] ?? baselineDists[baselineHeadingIndex]) - baselineDists[baselineHeadingIndex];
  const baselineHeadingFraction = baselineHeadingSpan > 0
    ? (primaryDistance - baselineDists[baselineHeadingIndex]) / baselineHeadingSpan : 0;
  const baselineBodyHeading = replayBodyHeading(effectiveBaselinePoints, baselineHeadingIndex, baselineHeadingFraction);

  const pedalMarkerPoints = useMemo(
    () => computePedalMarkerPoints(showPedalMarkers, pedalMarkers, primaryDists, baselineDists, svgPoints, baselineSvgPoints, effectiveBaselinePoints),
    [showPedalMarkers, pedalMarkers, primaryDists, baselineDists, svgPoints, baselineSvgPoints, effectiveBaselinePoints]
  );

  const cornerMarkers = useMemo(
    () => computeDispersedCornerMarkers(corners, primaryDists, svgPoints, baselineSvgPoints, pedalMarkerPoints),
    [corners, primaryDists, svgPoints, baselineSvgPoints, pedalMarkerPoints]
  );

  const lastSelectedCornerRef = useRef<number | null>(null);

  useEffect(() => {
    if (selectedCornerNumber !== null && selectedCornerNumber !== undefined) {
      if (selectedCornerNumber !== lastSelectedCornerRef.current) {
        lastSelectedCornerRef.current = selectedCornerNumber;
        const corner = cornerMarkers.find(c => c.cornerNumber === selectedCornerNumber);
        if (corner) {
          focusOnPoint(corner.actualSx, corner.actualSy, 4.5);
        }
      }
    } else if (lastSelectedCornerRef.current !== null) {
      lastSelectedCornerRef.current = null;
      resetPanZoom();
    }
  }, [selectedCornerNumber, cornerMarkers, focusOnPoint, resetPanZoom]);

  if (points.length === 0) {
    return <div className={`flex items-center justify-center h-64 text-lmu-muted text-sm ${className}`}>No GPS trajectory data available for this replay recording.</div>;
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      data-replay-surface="map"
      data-map-expanded={isExpanded ? '' : undefined}
      aria-label="Track map"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      className={`relative flex flex-col items-center select-none overflow-hidden overscroll-contain touch-none cursor-grab active:cursor-grabbing [&[data-map-expanded]]:fixed [&[data-map-expanded]]:inset-0 [&[data-map-expanded]]:z-[1000] [&[data-map-expanded]]:w-screen [&[data-map-expanded]]:h-screen [&[data-map-expanded]]:bg-lmu-bg ${className} ${FOCUS_RING}`}
    >
      {showControls && (
        <GpsMapControls camera={camera} layers={layers} onChange={changeLayers} geometry={effectiveGeometry}
          display={display} error={displayError} bounds={effectiveBounds} left={leftSvgPoints} right={rightSvgPoints}
          center={centerlineSvgPoints} trajectory={svgPoints}
          orientation={controlsOrientation ?? (isExpanded ? 'horizontal' : (dimNonSelectedTrack ? 'vertical' : 'horizontal'))}
          isPlaying={isPlaying} onTogglePlay={onTogglePlay} isExpanded={isExpanded} onToggleExpanded={setIsExpanded} />
      )}

      {showMinimap && (
        <GpsCircuitMinimap
          trackBoundaryPathD={trackBoundaryPathD}
          layoutPathD={trackBoundaryPathD}
          currentPos={currentPos}
          baselineGhostPos={baselineGhostPos}
          currentViewBox={currentViewBox}
        />
      )}

      <div className="relative w-full h-full">
        {/* Static scene on its own layer: the minimap and car markers above it move every frame. */}
        <svg viewBox={currentViewBox} className="w-full h-full drop-shadow-md will-change-transform">
          <GpsMapBackground geometry={effectiveGeometry} display={display} bounds={effectiveBounds} layers={layers}
            left={leftSvgPoints} right={rightSvgPoints} center={centerlineSvgPoints} pathD={pathD} />

          {layers.brakeMarkers && display?.brakeMarkers?.length ? <GpsBrakeMarkers markers={display.brakeMarkers}
            bounds={effectiveBounds} viewBoxSize={VIEWBOX_SIZE} padding={PADDING} markerScale={markerScale} /> : null}

          <GpsTrackSegments
            svgPoints={svgPoints}
            baselineSvgPoints={baselineSvgPoints}
            colorBy={colorBy}
            deltaByIdx={deltaByIdx}
            baselineDeltaByIdx={baselineDeltaByIdx}
            primaryOpacity={primaryOpacity}
            baselineOpacity={baselineOpacity}
            onSelectIndex={onSelectIndex}
            highlightDistRange={highlightDistRange}
            primaryDists={primaryDists}
            baselineDists={baselineDists}
            dimNonSelectedTrack={dimNonSelectedTrack}
          />

          <GpsStartFinishLine
            svgPoints={svgPoints}
            zoomLevel={zoomLevel}
            markerScale={markerScale}
            cornerMarkers={cornerMarkers}
            pedalMarkers={pedalMarkerPoints}
            gateLeftSvg={gateLeftSvg}
            gateRightSvg={gateRightSvg}
          />

          <GpsSceneMarkers
            cornerMarkers={cornerMarkers}
            pedalMarkers={pedalMarkerPoints}
            selectedCornerNumber={selectedCornerNumber}
            onSelectCornerNumber={onSelectCornerNumber}
            onSelectIndex={onSelectIndex}
            markerScale={markerScale}
            zoomLevel={zoomLevel}
            primaryOpacity={primaryOpacity}
            baselineOpacity={baselineOpacity}
            dimNonSelectedTrack={dimNonSelectedTrack}
            showCornerFlags={showCornerFlags}
          />
        </svg>
        <GpsSceneCarMarkers
          viewBox={currentViewBox}
          primaryCarClass={primaryCarClass}
          primaryVehicleData={primaryVehicleData}
          baselineVehicleData={baselineVehicleData}
          baselineCarClass={baselineCarClass}
          unitsPerMeter={(VIEWBOX_SIZE - 2 * PADDING) / Math.max(effectiveBounds.spanX, effectiveBounds.spanZ, 1)}
          primaryHeadingDeg={replayBodyHeading(points, currentIndex, fraction)}
          baselineHeadingDeg={baselineBodyHeading}
          currentPos={currentPos}
          baselineGhostPos={baselineGhostPos}
          markerScale={markerScale}
          primaryOpacity={primaryOpacity}
          baselineOpacity={baselineOpacity}
        />
      </div>

      <GpsSceneHudOverlay isStationary={isStationary} />
      <MapScaleBar markerScale={markerScale} spanM={Math.max(effectiveBounds.spanX, effectiveBounds.spanZ)} />

      {showLegend && <HeatmapLegendBar colorBy={colorBy} />}
    </div>
  );
};
