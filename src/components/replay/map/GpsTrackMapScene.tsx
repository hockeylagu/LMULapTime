import React, { useMemo, useRef, useEffect } from 'react';
import { ReplayTrajectoryPoint } from '../../../../server/types.js';
import { getTrajectoryDistances, computeLapComparisons } from '../../../utils/replayComparison.js';
import {
  MapColorMode,
  projectTrajectoryPoints,
  projectBoundaryPoints,
  buildClosedSvgPath,
  buildContinuousSvgPath,
  computeGhostPosition,
  computeDispersedCornerMarkers,
  computePedalMarkerPoints,
  computeEffectiveBounds,
  computeBaselineDeltaByIdx,
} from './replayMapUtils.js';
import { MapControlsOverlay } from './MapControlsOverlay.js';
import { HeatmapLegendBar } from './HeatmapLegendBar.js';
import { GpsSceneHudOverlay } from './GpsSceneHudOverlay.js';
import { GpsSceneMarkers } from './GpsSceneMarkers.js';
import { useGpsMapPanZoom } from './useGpsMapPanZoom.js';
import { GpsCircuitMinimap } from './GpsCircuitMinimap.js';
import { GpsTrackSegments } from './GpsTrackSegments.js';
import { GpsStartFinishLine } from './GpsStartFinishLine.js';
import { GpsTrackRoadRibbon } from './GpsTrackRoadRibbon.js';
import { useTrackBoundaryGeometry, TrackBoundaryGeometry } from './useTrackBoundaryGeometry.js';

import type { GpsTrackMapCorner, GpsTrackMapPedalMarker } from './GpsTrackMap.js';

export interface GpsTrackMapSceneProps {
  points: ReplayTrajectoryPoint[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; spanX: number; spanZ: number };
  currentIndex: number;
  onSelectIndex?: (index: number) => void;
  colorBy?: MapColorMode;
  className?: string;
  baselinePoints?: ReplayTrajectoryPoint[];
  corners?: GpsTrackMapCorner[];
  selectedCornerNumber?: number | null;
  onSelectCornerNumber?: (cornerNumber: number) => void;
  primaryOpacity?: number;
  baselineOpacity?: number;
  pedalMarkers?: GpsTrackMapPedalMarker[];
  showPedalMarkers?: boolean;
  showMinimap?: boolean;
  trackVenue?: string;
  trackCourse?: string;
  layoutKey?: string;
  replayName?: string;
  trackGeometry?: TrackBoundaryGeometry | null;
}

export const GpsTrackMapScene: React.FC<GpsTrackMapSceneProps> = ({
  points,
  bounds,
  currentIndex,
  onSelectIndex,
  colorBy = 'pedal',
  className = '',
  baselinePoints,
  corners,
  selectedCornerNumber,
  onSelectCornerNumber,
  primaryOpacity = 1,
  baselineOpacity = 1,
  pedalMarkers,
  showPedalMarkers = false,
  showMinimap = true,
  trackVenue,
  trackCourse,
  layoutKey,
  replayName,
  trackGeometry,
}) => {
  const VIEWBOX_SIZE = 800;
  const PADDING = 60;

  const { trackGeometry: fetchedGeometry } = useTrackBoundaryGeometry({
    layoutKey,
    trackVenue,
    trackCourse,
    replayName,
  });
  const effectiveGeometry = trackGeometry ?? fetchedGeometry;

  const effectiveBounds = useMemo(
    () => computeEffectiveBounds(bounds, effectiveGeometry?.bounds, baselinePoints),
    [bounds, effectiveGeometry, baselinePoints]
  );

  const svgPoints = useMemo(() => projectTrajectoryPoints(points, effectiveBounds, VIEWBOX_SIZE, PADDING), [points, effectiveBounds]);
  const baselineSvgPoints = useMemo(() => projectTrajectoryPoints(baselinePoints || [], effectiveBounds, VIEWBOX_SIZE, PADDING), [baselinePoints, effectiveBounds]);
  const currentPos = svgPoints[Math.min(currentIndex, svgPoints.length - 1)] || svgPoints[0];

  const leftSvgPoints = useMemo(
    () => (effectiveGeometry?.leftBoundary ? projectBoundaryPoints(effectiveGeometry.leftBoundary, effectiveBounds, VIEWBOX_SIZE, PADDING) : []),
    [effectiveGeometry, effectiveBounds]
  );
  const rightSvgPoints = useMemo(
    () => (effectiveGeometry?.rightBoundary ? projectBoundaryPoints(effectiveGeometry.rightBoundary, effectiveBounds, VIEWBOX_SIZE, PADDING) : []),
    [effectiveGeometry, effectiveBounds]
  );
  const centerlineSvgPoints = useMemo(
    () => (effectiveGeometry?.centerline ? projectBoundaryPoints(effectiveGeometry.centerline, effectiveBounds, VIEWBOX_SIZE, PADDING) : []),
    [effectiveGeometry, effectiveBounds]
  );
  const layoutPathD = useMemo(
    () => (centerlineSvgPoints.length > 0 ? buildClosedSvgPath(centerlineSvgPoints) : undefined),
    [centerlineSvgPoints]
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
    resetPanZoom,
    focusOnPoint,
    zoomIn,
    zoomOut,
  } = useGpsMapPanZoom({ viewBoxSize: VIEWBOX_SIZE, currentPos });

  const pathD = useMemo(() => buildContinuousSvgPath(svgPoints), [svgPoints]);
  const isStationary = useMemo(() => ((effectiveBounds?.spanX ?? 0) < 25 && (effectiveBounds?.spanZ ?? 0) < 25) || (points.length > 0 && points.every(p => (p.speedKmh || 0) <= 1)), [effectiveBounds, points]);

  const primaryDists = useMemo(() => getTrajectoryDistances(points), [points]);
  const baselineDists = useMemo(
    () => (baselinePoints ? getTrajectoryDistances(baselinePoints) : []),
    [baselinePoints]
  );

  const deltaByIdx = useMemo(() => {
    if (colorBy !== 'delta' || !baselinePoints || baselinePoints.length === 0) return null;
    return computeLapComparisons(points, baselinePoints).map(c => c.deltaTimeSec);
  }, [colorBy, points, baselinePoints]);

  const baselineDeltaByIdx = useMemo(
    () => (colorBy === 'delta' ? computeBaselineDeltaByIdx(deltaByIdx, baselinePoints, primaryDists, baselineDists) : null),
    [colorBy, deltaByIdx, baselinePoints, baselineDists, primaryDists]
  );
  const markerScale = Number((1 / zoomLevel).toFixed(4));
  const baselineGhostPos = useMemo(() => computeGhostPosition(primaryDists, baselineDists, baselinePoints || [], currentIndex, effectiveBounds, VIEWBOX_SIZE, PADDING), [primaryDists, baselineDists, baselinePoints, currentIndex, effectiveBounds]);


  const pedalMarkerPoints = useMemo(
    () => computePedalMarkerPoints(showPedalMarkers, pedalMarkers, primaryDists, baselineDists, svgPoints, baselineSvgPoints, baselinePoints),
    [showPedalMarkers, pedalMarkers, primaryDists, baselineDists, svgPoints, baselineSvgPoints, baselinePoints]
  );

  const cornerMarkers = useMemo(
    () => computeDispersedCornerMarkers(corners, primaryDists, baselineDists, svgPoints, baselineSvgPoints, pedalMarkerPoints),
    [corners, primaryDists, baselineDists, svgPoints, baselineSvgPoints, pedalMarkerPoints]
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
      className={`relative flex flex-col items-center select-none overflow-hidden overscroll-contain touch-none cursor-grab active:cursor-grabbing ${className}`}
    >
      <MapControlsOverlay
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onReset={resetPanZoom}
        zoomDisplay={`${zoomLevel}x`}
        followCar={followCar}
        onToggleFollowCar={() => setFollowCar(f => !f)}
        className="top-2 right-2 bottom-auto"
      />

      {showMinimap && (
        <GpsCircuitMinimap
          pathD={pathD}
          layoutPathD={layoutPathD}
          currentPos={currentPos}
          baselineGhostPos={baselineGhostPos}
          currentViewBox={currentViewBox}
        />
      )}

      <svg viewBox={currentViewBox} className="w-full h-full drop-shadow-md">
        <defs>
          <filter id="carGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#38bdf8" floodOpacity="0.9" />
          </filter>
          <filter id="ghostGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#f59e0b" floodOpacity="0.9" />
          </filter>
        </defs>

        {leftSvgPoints.length > 0 && rightSvgPoints.length > 0 ? (
          <GpsTrackRoadRibbon
            leftSvgPoints={leftSvgPoints}
            rightSvgPoints={rightSvgPoints}
            centerlineSvgPoints={centerlineSvgPoints}
          />
        ) : (
          <>
            <path d={pathD} fill="none" stroke="#1e293b" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={pathD} fill="none" stroke="#334155" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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
        />

        <GpsStartFinishLine
          svgPoints={svgPoints}
          zoomLevel={zoomLevel}
          cornerMarkers={cornerMarkers}
          pedalMarkers={pedalMarkerPoints}
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
        />

        {currentPos && baselineGhostPos && (
          <line
            x1={currentPos.sx}
            y1={currentPos.sy}
            x2={baselineGhostPos.sx}
            y2={baselineGhostPos.sy}
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity={0.75 * baselineOpacity}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {baselineGhostPos && (
          <g transform={`translate(${baselineGhostPos.sx.toFixed(1)}, ${baselineGhostPos.sy.toFixed(1)}) scale(${markerScale})`} opacity={baselineOpacity}>
            <circle r="11" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.5" className="animate-pulse" />
            <circle r="6" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" filter="url(#ghostGlow)" />
          </g>
        )}

        {currentPos && (
          <g transform={`translate(${currentPos.sx}, ${currentPos.sy}) scale(${markerScale})`} opacity={primaryOpacity}>
            <circle r="12" fill="none" stroke="#38bdf8" strokeWidth="2" className="animate-ping opacity-50" />
            <circle r="6.5" fill="#38bdf8" stroke="#ffffff" strokeWidth="2.2" filter="url(#carGlow)" />
          </g>
        )}
      </svg>

      <GpsSceneHudOverlay isStationary={isStationary} />

      <HeatmapLegendBar colorBy={colorBy} />
    </div>
  );
};
