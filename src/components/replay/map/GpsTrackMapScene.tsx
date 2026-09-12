import React, { useMemo, useRef, useEffect } from 'react';
import { ReplayTrajectoryPoint } from '../../../../server/types.js';
import { computeCumulativeDistances, computeLapComparisons, findIndexAtDistance } from '../../../utils/replayComparison.js';
import {
  MapColorMode,
  projectTrajectoryPoints,
  buildContinuousSvgPath,
  computeGhostPosition,
  computeDispersedCornerMarkers,
} from './replayMapUtils.js';
import { MapControlsOverlay } from './MapControlsOverlay.js';
import { HeatmapLegendBar } from './HeatmapLegendBar.js';
import { GpsSceneHudOverlay } from './GpsSceneHudOverlay.js';
import { GpsSceneMarkers } from './GpsSceneMarkers.js';
import { useGpsMapPanZoom } from './useGpsMapPanZoom.js';
import { GpsCircuitMinimap } from './GpsCircuitMinimap.js';
import { GpsTrackSegments } from './GpsTrackSegments.js';
import { GpsStartFinishLine } from './GpsStartFinishLine.js';

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
}) => {
  const VIEWBOX_SIZE = 800;
  const PADDING = 60;

  const svgPoints = useMemo(() => projectTrajectoryPoints(points, bounds, VIEWBOX_SIZE, PADDING), [points, bounds]);
  const baselineSvgPoints = useMemo(() => projectTrajectoryPoints(baselinePoints || [], bounds, VIEWBOX_SIZE, PADDING), [baselinePoints, bounds]);
  const currentPos = svgPoints[Math.min(currentIndex, svgPoints.length - 1)] || svgPoints[0];

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
  const isStationary = useMemo(() => ((bounds?.spanX ?? 0) < 25 && (bounds?.spanZ ?? 0) < 25) || (points.length > 0 && points.every(p => (p.speedKmh || 0) <= 1)), [bounds, points]);

  const primaryDists = useMemo(() => computeCumulativeDistances(points), [points]);
  const baselineDists = useMemo(() => computeCumulativeDistances(baselinePoints || []), [baselinePoints]);

  const deltaByIdx = useMemo(() => {
    if (colorBy !== 'delta' || !baselinePoints || baselinePoints.length === 0) return null;
    return computeLapComparisons(points, baselinePoints).map(c => c.deltaTimeSec);
  }, [colorBy, points, baselinePoints]);

  const baselineDeltaByIdx = useMemo(() => {
    if (colorBy !== 'delta' || !deltaByIdx || !baselinePoints || baselinePoints.length === 0) return null;
    const totalPrimaryDist = primaryDists[primaryDists.length - 1] || 0;
    const totalBaselineDist = baselineDists[baselineDists.length - 1] || 0;
    const canRescale = totalPrimaryDist > 0 && totalBaselineDist > 0;
    return baselineDists.map(d => {
      const targetDist = canRescale ? (d / totalBaselineDist) * totalPrimaryDist : d;
      const idx = findIndexAtDistance(primaryDists, targetDist);
      return deltaByIdx[Math.min(idx, deltaByIdx.length - 1)];
    });
  }, [colorBy, deltaByIdx, baselinePoints, baselineDists, primaryDists]);

  const markerScale = useMemo(() => {
    return Number((1 / zoomLevel).toFixed(4));
  }, [zoomLevel]);

  const baselineGhostPos = useMemo(() => computeGhostPosition(primaryDists, baselineDists, baselinePoints || [], currentIndex, bounds, VIEWBOX_SIZE, PADDING), [primaryDists, baselineDists, baselinePoints, currentIndex, bounds]);

  const pedalMarkerPoints = useMemo(() => {
    if (!showPedalMarkers || !pedalMarkers || pedalMarkers.length === 0 || svgPoints.length === 0) return [];
    const mapped = pedalMarkers
      .map(m => {
        const useBaseline = Boolean(m.isBaseline && baselinePoints && baselinePoints.length > 0 && baselineSvgPoints.length > 0);
        const dists = useBaseline ? baselineDists : primaryDists;
        const pts = useBaseline ? baselineSvgPoints : svgPoints;
        const idx = findIndexAtDistance(dists, m.distM);
        const pt = pts[Math.min(idx, pts.length - 1)];
        if (!pt) return null;
        const prev = pts[Math.max(0, pt.idx - 2)] ?? pt;
        const next = pts[Math.min(pts.length - 1, pt.idx + 2)] ?? pt;
        const dx = next.sx - prev.sx;
        const dy = next.sy - prev.sy;
        const headingLen = Math.hypot(dx, dy) || 1;
        return { ...m, sx: pt.sx, sy: pt.sy, nx: -dy / headingLen, ny: dx / headingLen, isStaggered: false };
      })
      .filter((m): m is GpsTrackMapPedalMarker & { sx: number; sy: number; nx: number; ny: number; isStaggered: boolean } => m !== null);

    // Stagger baseline markers if they are within 22px of the primary marker of the same corner and kind
    for (const bMarker of mapped) {
      if (!bMarker.isBaseline) continue;
      const primMarker = mapped.find(p => !p.isBaseline && p.cornerNumber === bMarker.cornerNumber && p.kind === bMarker.kind);
      if (primMarker && Math.hypot(bMarker.sx - primMarker.sx, bMarker.sy - primMarker.sy) < 22) {
        bMarker.isStaggered = true;
      }
    }

    return mapped;
  }, [showPedalMarkers, pedalMarkers, primaryDists, baselineDists, svgPoints, baselineSvgPoints, baselinePoints]);

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

        <path d={pathD} fill="none" stroke="#1e293b" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={pathD} fill="none" stroke="#334155" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

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
