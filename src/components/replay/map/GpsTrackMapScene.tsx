import React, { useMemo } from 'react';
import { ReplayTrajectoryPoint } from '../../../../server/types.js';
import { computeCumulativeDistances, computeLapComparisons, findIndexAtDistance } from '../../../utils/replayComparison.js';
import {
  getHeatmapColor,
  MapColorMode,
  projectTrajectoryPoints,
  buildContinuousSvgPath,
  computeGhostPosition,
} from './replayMapUtils.js';
import { MapControlsOverlay } from './MapControlsOverlay.js';
import { HeatmapLegendBar } from './HeatmapLegendBar.js';
import { GpsSceneHudOverlay } from './GpsSceneHudOverlay.js';
import { GpsSceneMarkers } from './GpsSceneMarkers.js';
import { useGpsMapPanZoom } from './useGpsMapPanZoom.js';

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
}

export const GpsTrackMapScene: React.FC<GpsTrackMapSceneProps> = ({
  points,
  bounds,
  currentIndex,
  onSelectIndex,
  colorBy = 'speed',
  className = '',
  baselinePoints,
  corners,
  selectedCornerNumber,
  onSelectCornerNumber,
  primaryOpacity = 1,
  baselineOpacity = 1,
  pedalMarkers,
  showPedalMarkers = false,
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

  const baselineTrackSegments = useMemo(() => baselineSvgPoints.map((bp, i) => {
    if (i === 0) return null;
    const prev = baselineSvgPoints[i - 1];
    if (bp.isTeleport || Math.hypot(bp.x - prev.x, bp.z - prev.z) > 20 || Math.hypot(bp.sx - prev.sx, bp.sy - prev.sy) > 30) return null;
    return (
      <line
        key={`baseline-${i}`}
        x1={prev.sx}
        y1={prev.sy}
        x2={bp.sx}
        y2={bp.sy}
        stroke={getHeatmapColor(bp, colorBy, baselineDeltaByIdx ? baselineDeltaByIdx[bp.idx] : undefined)}
        strokeWidth="3.5"
        strokeDasharray="8 6"
        strokeLinecap="round"
        strokeOpacity={0.9 * baselineOpacity}
        data-track-line="baseline"
      />
    );
  }), [baselineSvgPoints, colorBy, baselineDeltaByIdx, baselineOpacity]);

  const primaryTrackSegments = useMemo(() => svgPoints.map((p, i) => {
    if (i === 0) return null;
    const prev = svgPoints[i - 1];
    if (p.isTeleport || Math.hypot(p.x - prev.x, p.z - prev.z) > 20 || Math.hypot(p.sx - prev.sx, p.sy - prev.sy) > 30) return null;
    return (
      <line
        key={i}
        x1={prev.sx}
        y1={prev.sy}
        x2={p.sx}
        y2={p.sy}
        stroke={getHeatmapColor(p, colorBy, deltaByIdx ? deltaByIdx[p.idx] : undefined)}
        strokeWidth="4"
        strokeLinecap="round"
        strokeOpacity={primaryOpacity}
        className="hover:stroke-white transition-colors cursor-pointer"
        onClick={() => onSelectIndex?.(p.idx)}
        data-track-line="primary"
      />
    );
  }), [svgPoints, colorBy, deltaByIdx, primaryOpacity, onSelectIndex]);

  const baselineGhostPos = useMemo(() => computeGhostPosition(primaryDists, baselineDists, baselinePoints || [], currentIndex, bounds, VIEWBOX_SIZE, PADDING), [primaryDists, baselineDists, baselinePoints, currentIndex, bounds]);

  const cornerMarkers = useMemo(() => {
    if (!corners || corners.length === 0 || svgPoints.length === 0) return [];
    const totalPrimaryDist = primaryDists[primaryDists.length - 1] || 0;
    const totalBaselineDist = baselineDists[baselineDists.length - 1] || 0;
    const canRescale = totalPrimaryDist > 0 && totalBaselineDist > 0;
    return corners
      .map(c => {
        const targetDist = canRescale ? (c.minDistM / totalBaselineDist) * totalPrimaryDist : c.minDistM;
        const idx = findIndexAtDistance(primaryDists, targetDist);
        const pt = svgPoints[Math.min(idx, svgPoints.length - 1)];
        if (!pt) return null;

        const prev = svgPoints[Math.max(0, pt.idx - 1)] ?? pt;
        const next = svgPoints[Math.min(svgPoints.length - 1, pt.idx + 1)] ?? pt;
        const dx = next.sx - prev.sx;
        const dy = next.sy - prev.sy;
        const headingLen = Math.hypot(dx, dy) || 1;
        const normalX = (dy / headingLen) * 18;
        const normalY = (-dx / headingLen) * 18;

        const offsetSide = (pt.idx % 2 === 0 ? 1 : -1);
        return {
          cornerNumber: c.cornerNumber,
          sx: pt.sx + normalX * offsetSide,
          sy: pt.sy + normalY * offsetSide,
          idx: pt.idx,
          actualSx: pt.sx,
          actualSy: pt.sy,
        };
      })
      .filter((m): m is { cornerNumber: number; sx: number; sy: number; idx: number; actualSx: number; actualSy: number } => m !== null);
  }, [corners, primaryDists, baselineDists, svgPoints]);

  const pedalMarkerPoints = useMemo(() => {
    if (!showPedalMarkers || !pedalMarkers || pedalMarkers.length === 0 || svgPoints.length === 0) return [];
    return pedalMarkers
      .map(m => {
        const idx = findIndexAtDistance(primaryDists, m.distM);
        const pt = svgPoints[Math.min(idx, svgPoints.length - 1)];
        return pt ? { ...m, sx: pt.sx, sy: pt.sy } : null;
      })
      .filter((m): m is GpsTrackMapPedalMarker & { sx: number; sy: number } => m !== null);
  }, [showPedalMarkers, pedalMarkers, primaryDists, svgPoints]);

  const carHeadingDeg = useMemo(() => {
    if (!svgPoints || svgPoints.length < 2 || currentIndex === undefined) return 0;
    const idx = Math.min(currentIndex, svgPoints.length - 1);
    const p1 = svgPoints[Math.max(0, idx - 2)];
    const p2 = svgPoints[Math.min(idx + 2, svgPoints.length - 1)];
    const dx = p2.sx - p1.sx;
    const dy = p2.sy - p1.sy;
    return Math.hypot(dx, dy) > 0.4 ? (Math.atan2(dy, dx) * 180) / Math.PI + 90 : 0;
  }, [svgPoints, currentIndex]);

  if (points.length === 0) {
    return <div className={`flex items-center justify-center h-64 text-lmu-muted text-sm ${className}`}>No GPS trajectory data available for this replay recording.</div>;
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`relative flex flex-col items-center select-none overflow-hidden overscroll-contain touch-none ${zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'} ${className}`}
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

      <svg viewBox={currentViewBox} className="w-full h-full drop-shadow-md">
        <defs>
          <filter id="carGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#38bdf8" floodOpacity="0.9" />
          </filter>
          <filter id="ghostGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#f59e0b" floodOpacity="0.9" />
          </filter>
        </defs>

        <path d={pathD} fill="none" stroke="#1e293b" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathD} fill="none" stroke="#334155" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />

        {primaryTrackSegments}
        {baselineTrackSegments}

        {svgPoints.length > 0 && (
          <g transform={`translate(${svgPoints[0].sx}, ${svgPoints[0].sy})`}>
            <circle r="6" fill="#facc15" stroke="#000" strokeWidth="2" />
            <text y="-10" textAnchor="middle" className="fill-amber-300 text-[11px] font-bold">START</text>
          </g>
        )}

        <GpsSceneMarkers
          cornerMarkers={cornerMarkers}
          pedalMarkers={pedalMarkerPoints}
          selectedCornerNumber={selectedCornerNumber}
          onSelectCornerNumber={onSelectCornerNumber}
          onSelectIndex={onSelectIndex}
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
          />
        )}

        {baselineGhostPos && (
          <g transform={`translate(${baselineGhostPos.sx.toFixed(1)}, ${baselineGhostPos.sy.toFixed(1)})`} opacity={baselineOpacity}>
            <circle r="12" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.5" className="animate-pulse" />
            <circle r="6.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" filter="url(#ghostGlow)" />
            <text y="-10" textAnchor="middle" className="fill-amber-300 text-[10px] font-mono font-bold">GHOST</text>
          </g>
        )}

        {currentPos && (
          <g transform={`translate(${currentPos.sx}, ${currentPos.sy})`} opacity={primaryOpacity}>
            <circle r="14" fill="none" stroke="#38bdf8" strokeWidth="2" className="animate-ping opacity-50" />
            <circle r="7" fill="#38bdf8" stroke="#ffffff" strokeWidth="2.5" filter="url(#carGlow)" />
            {!isStationary && (
              <g transform={`rotate(${carHeadingDeg.toFixed(1)})`}>
                <line x1="0" y1="0" x2="0" y2="-18" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
                <polygon points="0,-26 -6,-16 6,-16" fill="#38bdf8" stroke="#ffffff" strokeWidth="1" />
              </g>
            )}
          </g>
        )}
      </svg>

      <GpsSceneHudOverlay
        hasGhost={Boolean(baselineGhostPos)}
        isStationary={isStationary}
        currentPos={currentPos}
      />

      <HeatmapLegendBar colorBy={colorBy} />
    </div>
  );
};
