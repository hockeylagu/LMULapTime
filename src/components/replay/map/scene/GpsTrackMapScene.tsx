import React, { useMemo, useRef, useEffect } from 'react';
import { computeLapComparisons } from '../../../../utils/replayComparison.js';
import { getTrajectoryDistances, getDistancesInReferenceFrame } from '../../../../utils/lapAlignment.js';
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
import { MapControlsOverlay } from '../MapControlsOverlay.js';
import { HeatmapLegendBar } from '../HeatmapLegendBar.js';
import { GpsSceneHudOverlay } from './GpsSceneHudOverlay.js';
import { GpsSceneMarkers } from './GpsSceneMarkers.js';
import { GpsSceneCarMarkers } from './GpsSceneCarMarkers.js';
import { useGpsMapPanZoom } from '../useGpsMapPanZoom.js';
import { GpsCircuitMinimap } from '../GpsCircuitMinimap.js';
import { GpsTrackSegments } from './GpsTrackSegments.js';
import { GpsStartFinishLine } from './GpsStartFinishLine.js';
import { GpsTrackRoadRibbon } from './GpsTrackRoadRibbon.js';
import { useTrackBoundaryGeometry } from '../useTrackBoundaryGeometry.js';
import { MAP_COLORS } from '../../../../utils/themeColors.js';
import { usePlaybackPosition } from '../../inspector/replayPlaybackCursor.js';

import type { GpsTrackMapSceneProps } from '../gpsTrackMapTypes.js';

export type { GpsTrackMapSceneProps } from '../gpsTrackMapTypes.js';

export const GpsTrackMapScene: React.FC<GpsTrackMapSceneProps> = (props) => {
  const {
    points, bounds, currentIndex, onSelectIndex, colorBy = 'pedal', className = '',
    baselinePoints, corners, selectedCornerNumber, onSelectCornerNumber,
    primaryOpacity = 1, baselineOpacity = 1, pedalMarkers, showPedalMarkers = false,
    showMinimap = true, showLegend = true, showControls = true, controlsOrientation,
    highlightDistRange, dimNonSelectedTrack = false, showCornerFlags = true,
    trackVenue, trackCourse, layoutKey, replayName, trackGeometry, trackLengthM,
  } = props;
  const VIEWBOX_SIZE = 800;
  const PADDING = 60;

  const { trackGeometry: fetchedGeometry } = useTrackBoundaryGeometry({
    layoutKey,
    trackVenue,
    trackCourse,
    replayName,
  });
  const effectiveGeometry = trackGeometry ?? fetchedGeometry;

  const effectiveBaselinePoints = useMemo(() => baselinePoints ?? [], [baselinePoints]);

  const effectiveBounds = useMemo(
    () => computeEffectiveBounds(bounds, effectiveGeometry?.bounds, effectiveBaselinePoints),
    [bounds, effectiveGeometry, effectiveBaselinePoints]
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

  const {
    zoomLevel,
    followCar,
    setFollowCar,
    containerRef,
    currentViewBox,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    resetPanZoom,
    focusOnPoint,
    zoomIn,
    zoomOut,
    markerScale,
  } = useGpsMapPanZoom({ viewBoxSize: VIEWBOX_SIZE, currentPos });

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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      className={`relative flex flex-col items-center select-none overflow-hidden overscroll-contain touch-none cursor-grab active:cursor-grabbing ${className}`}
    >
      {showControls && (
        <MapControlsOverlay
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={resetPanZoom}
          zoomDisplay={`${zoomLevel}x`}
          followCar={followCar}
          onToggleFollowCar={() => setFollowCar(f => !f)}
          orientation={controlsOrientation ?? (dimNonSelectedTrack ? 'vertical' : 'horizontal')}
          className="top-2 right-2 bottom-auto"
        />
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
          {leftSvgPoints.length > 0 && rightSvgPoints.length > 0 ? (
            <GpsTrackRoadRibbon
              leftSvgPoints={leftSvgPoints}
              rightSvgPoints={rightSvgPoints}
              centerlineSvgPoints={centerlineSvgPoints}
            />
          ) : (
            <>
              <path d={pathD} fill="none" stroke={MAP_COLORS.minimapBorder} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <path d={pathD} fill="none" stroke={MAP_COLORS.centerline} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </>
          )}

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
          currentPos={currentPos}
          baselineGhostPos={baselineGhostPos}
          markerScale={markerScale}
          primaryOpacity={primaryOpacity}
          baselineOpacity={baselineOpacity}
        />
      </div>

      <GpsSceneHudOverlay isStationary={isStationary} />

      {showLegend && <HeatmapLegendBar colorBy={colorBy} />}
    </div>
  );
};
