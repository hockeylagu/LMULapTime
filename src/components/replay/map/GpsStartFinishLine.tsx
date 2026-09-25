import React, { useMemo } from 'react';
import type { ProjectedPoint, DispersedCornerMarker } from './replayMapUtils.js';
import { CHART_COLORS, MAP_COLORS, TELEMETRY_COLORS } from '../../../utils/themeColors.js';

export interface GpsStartFinishLineProps {
  svgPoints: ProjectedPoint[];
  zoomLevel?: number;
  markerScale?: number;
  cornerMarkers?: DispersedCornerMarker[];
  pedalMarkers?: { sx: number; sy: number }[];
  /** Canonical gate endpoints spanning the road ribbon width from left to right boundary. */
  gateLeftSvg?: { sx: number; sy: number } | null;
  gateRightSvg?: { sx: number; sy: number } | null;
}

export const GpsStartFinishLine: React.FC<GpsStartFinishLineProps> = ({
  svgPoints,
  zoomLevel,
  markerScale,
  cornerMarkers,
  pedalMarkers,
  gateLeftSvg,
  gateRightSvg,
}) => {
  const lineData = useMemo(() => {
    const useGate = Boolean(gateLeftSvg && gateRightSvg);
    if (!useGate && (!svgPoints || svgPoints.length < 2)) return null;

    const effectiveZoom = zoomLevel && zoomLevel > 0 ? zoomLevel : 1;
    let x1: number, y1: number, x2: number, y2: number;
    let labelPos: { x: number; y: number };
    let nx: number, ny: number;

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

    if (useGate && gateLeftSvg && gateRightSvg) {
      // Upgraded S/F line: spans the full width of the road ribbon from left to right boundary
      x1 = gateLeftSvg.sx;
      y1 = gateLeftSvg.sy;
      x2 = gateRightSvg.sx;
      y2 = gateRightSvg.sy;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      nx = dx / len;
      ny = dy / len;

      // Position START badge outside the road ribbon edge (pit wall / verge)
      const edgeOffset = 25 / effectiveZoom;
      const candLeft = { x: x1 - nx * edgeOffset, y: y1 - ny * edgeOffset };
      const candRight = { x: x2 + nx * edgeOffset, y: y2 + ny * edgeOffset };

      labelPos = getIndicatorClearance(candLeft) >= getIndicatorClearance(candRight) ? candLeft : candRight;
    } else {
      if (svgPoints.length < 2) return null;
      // Fallback for unmapped tracks (no road ribbon boundary): draw across trajectory start point
      const p0 = svgPoints[0];
      const p1 = svgPoints[Math.min(2, svgPoints.length - 1)];
      const dx = p1.sx - p0.sx;
      const dy = p1.sy - p0.sy;
      const len = Math.hypot(dx, dy) || 1;
      nx = -dy / len;
      ny = dx / len;

      const halfWidth = Math.max(1.5, Number((14 / effectiveZoom).toFixed(2)));
      x1 = p0.sx - nx * halfWidth;
      y1 = p0.sy - ny * halfWidth;
      x2 = p0.sx + nx * halfWidth;
      y2 = p0.sy + ny * halfWidth;

      const labelDist = halfWidth + 25 / effectiveZoom;
      const cand1 = { x: p0.sx + nx * labelDist, y: p0.sy + ny * labelDist };
      const cand2 = { x: p0.sx - nx * labelDist, y: p0.sy - ny * labelDist };

      labelPos = getIndicatorClearance(cand1) >= getIndicatorClearance(cand2) ? cand1 : cand2;
    }

    return {
      x1: Number(x1.toFixed(1)),
      y1: Number(y1.toFixed(1)),
      x2: Number(x2.toFixed(1)),
      y2: Number(y2.toFixed(1)),
      labelX: Number(labelPos.x.toFixed(1)),
      labelY: Number(labelPos.y.toFixed(1)),
      effectiveZoom,
    };
  }, [svgPoints, zoomLevel, cornerMarkers, pedalMarkers, gateLeftSvg, gateRightSvg]);

  if (!lineData) return null;

  return (
    <g data-testid="start-finish-line" className="select-none pointer-events-none">
      {/* Black border line */}
      <line
        x1={lineData.x1}
        y1={lineData.y1}
        x2={lineData.x2}
        y2={lineData.y2}
        stroke={CHART_COLORS.black}
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
        stroke={CHART_COLORS.white}
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
        stroke={CHART_COLORS.black}
        strokeWidth="2.2"
        strokeDasharray="4 4"
        strokeLinecap="butt"
        vectorEffect="non-scaling-stroke"
      />

      {/* START badge placed beside the road ribbon edge, scaled to constant screen size */}
      <g
        data-testid="start-finish-label"
        transform={`translate(${lineData.labelX}, ${lineData.labelY}) scale(${markerScale ?? (1 / lineData.effectiveZoom)})`}
      >
        <rect
          x="-17"
          y="-7.5"
          width="34"
          height="15"
          rx="3"
          fill={MAP_COLORS.markerBg}
          stroke={TELEMETRY_COLORS.primary}
          strokeWidth="1.2"
          opacity="0.95"
        />
        <text
          x="0"
          y="0"
          textAnchor="middle"
          dominantBaseline="central"
          fill={TELEMETRY_COLORS.primary}
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
