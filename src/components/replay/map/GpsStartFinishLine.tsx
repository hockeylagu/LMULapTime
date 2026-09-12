import React, { useMemo } from 'react';
import type { ProjectedPoint, DispersedCornerMarker } from './replayMapUtils.js';

export interface GpsStartFinishLineProps {
  svgPoints: ProjectedPoint[];
  zoomLevel?: number;
  cornerMarkers?: DispersedCornerMarker[];
  pedalMarkers?: { sx: number; sy: number }[];
}

export const GpsStartFinishLine: React.FC<GpsStartFinishLineProps> = ({
  svgPoints,
  zoomLevel,
  cornerMarkers,
  pedalMarkers,
}) => {
  const lineData = useMemo(() => {
    if (svgPoints.length < 2) return null;
    const p0 = svgPoints[0];
    const p1 = svgPoints[Math.min(2, svgPoints.length - 1)];
    const dx = p1.sx - p0.sx;
    const dy = p1.sy - p0.sy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const effectiveZoom = zoomLevel && zoomLevel > 0 ? zoomLevel : 1;
    // Scale line length with zoom so it maintains a clean ~28px screen width across all zoom levels
    const halfWidth = Math.max(1.5, Number((14 / effectiveZoom).toFixed(2)));

    // Choose side (+1 or -1) for START label to ensure it does not interfere with racing line or indicators
    const labelDist = halfWidth + 18 / effectiveZoom;
    const cand1 = { x: p0.sx + nx * labelDist, y: p0.sy + ny * labelDist };
    const cand2 = { x: p0.sx - nx * labelDist, y: p0.sy - ny * labelDist };

    const getIndicatorClearance = (pt: { x: number; y: number }) => {
      let minDist = Infinity;
      if (cornerMarkers && cornerMarkers.length > 0) {
        for (const c of cornerMarkers) {
          const d = Math.hypot(pt.x - c.sx, pt.y - c.sy);
          if (d < minDist) minDist = d;
        }
      }
      if (pedalMarkers && pedalMarkers.length > 0) {
        for (const pm of pedalMarkers) {
          const d = Math.hypot(pt.x - pm.sx, pt.y - pm.sy);
          if (d < minDist) minDist = d;
        }
      }
      return minDist;
    };

    const getTrackClearance = (pt: { x: number; y: number }) => {
      let minDist = Infinity;
      // Check distance against distant track points (skipping immediate start straight points)
      for (let i = 5; i < svgPoints.length - 5; i += 3) {
        const p = svgPoints[i];
        const d = Math.hypot(pt.x - p.sx, pt.y - p.sy);
        if (d < minDist) minDist = d;
      }
      return minDist;
    };

    const score1 = Math.min(getIndicatorClearance(cand1), 100) * 3 + Math.min(getTrackClearance(cand1), 100);
    const score2 = Math.min(getIndicatorClearance(cand2), 100) * 3 + Math.min(getTrackClearance(cand2), 100);
    const side = score1 >= score2 ? 1 : -1;
    const labelPos = side === 1 ? cand1 : cand2;

    return {
      x1: Number((p0.sx - nx * halfWidth).toFixed(1)),
      y1: Number((p0.sy - ny * halfWidth).toFixed(1)),
      x2: Number((p0.sx + nx * halfWidth).toFixed(1)),
      y2: Number((p0.sy + ny * halfWidth).toFixed(1)),
      labelX: Number(labelPos.x.toFixed(1)),
      labelY: Number(labelPos.y.toFixed(1)),
      effectiveZoom,
      side,
    };
  }, [svgPoints, zoomLevel, cornerMarkers, pedalMarkers]);

  if (!lineData) return null;

  return (
    <g data-testid="start-finish-line" className="select-none pointer-events-none">
      {/* Black border line */}
      <line
        x1={lineData.x1}
        y1={lineData.y1}
        x2={lineData.x2}
        y2={lineData.y2}
        stroke="#000000"
        strokeWidth="4.5"
        strokeLinecap="butt"
        vectorEffect="non-scaling-stroke"
      />
      {/* White solid line */}
      <line
        x1={lineData.x1}
        y1={lineData.y1}
        x2={lineData.x2}
        y2={lineData.y2}
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="butt"
        vectorEffect="non-scaling-stroke"
      />
      {/* Black dashed checkered squares over white line */}
      <line
        x1={lineData.x1}
        y1={lineData.y1}
        x2={lineData.x2}
        y2={lineData.y2}
        stroke="#000000"
        strokeWidth="2.2"
        strokeDasharray="4 4"
        strokeLinecap="butt"
        vectorEffect="non-scaling-stroke"
      />

      {/* START label placed beside the line, scaled to constant screen size */}
      <g
        data-testid="start-finish-label"
        transform={`translate(${lineData.labelX}, ${lineData.labelY}) scale(${1 / lineData.effectiveZoom})`}
      >
        <rect
          x="-17"
          y="-7.5"
          width="34"
          height="15"
          rx="3"
          fill="#090d16"
          stroke="#38bdf8"
          strokeWidth="1.2"
          opacity="0.95"
        />
        <text
          x="0"
          y="0"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#38bdf8"
          fontSize="8"
          fontFamily="monospace"
          fontWeight="bold"
          letterSpacing="0.08em"
        >
          START
        </text>
      </g>
    </g>
  );
};
