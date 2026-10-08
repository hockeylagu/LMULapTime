import React, { useMemo } from 'react';
import { LMU_COLORS, MAP_COLORS } from '../../../../utils/themeColors.js';
import { buildRoadRibbonSvgPath, buildClosedSvgPath } from '../replayMapUtils.js';

export interface GpsTrackRoadRibbonProps {
  leftSvgPoints: Array<{ sx: number; sy: number }>;
  rightSvgPoints: Array<{ sx: number; sy: number }>;
  centerlineSvgPoints?: Array<{ sx: number; sy: number }>;
  className?: string;
  showRoad?: boolean;
  showEdges?: boolean;
  showCenterline?: boolean;
}

export const GpsTrackRoadRibbon: React.FC<GpsTrackRoadRibbonProps> = React.memo(({
  leftSvgPoints,
  rightSvgPoints,
  centerlineSvgPoints,
  className = '',
  showRoad = true,
  showEdges = false,
  showCenterline = false,
}) => {
  const ribbonD = useMemo(
    () => (leftSvgPoints.length > 0 && rightSvgPoints.length > 0 ? buildRoadRibbonSvgPath(leftSvgPoints, rightSvgPoints) : ''),
    [leftSvgPoints, rightSvgPoints]
  );

  const leftEdgeD = useMemo(
    () => (leftSvgPoints.length > 0 ? buildClosedSvgPath(leftSvgPoints) : ''),
    [leftSvgPoints]
  );

  const rightEdgeD = useMemo(
    () => (rightSvgPoints.length > 0 ? buildClosedSvgPath(rightSvgPoints) : ''),
    [rightSvgPoints]
  );

  const centerlineD = useMemo(
    () => (centerlineSvgPoints && centerlineSvgPoints.length > 0 ? buildClosedSvgPath(centerlineSvgPoints) : ''),
    [centerlineSvgPoints]
  );

  if (!ribbonD && !centerlineD && !leftEdgeD && !rightEdgeD) return null;

  return (
    <g data-testid="gps-track-road-ribbon" className={`pointer-events-none select-none ${className}`}>
      {/* Dark motorsport asphalt road surface */}
      {showRoad && ribbonD && <path
        d={ribbonD}
        fill={MAP_COLORS.roadSurface}
        fillOpacity="0.88"
        fillRule="evenodd"
        stroke="none"
      />}

      {/* High-contrast dashed centerline guide */}
      {showCenterline && centerlineD && (
        <path
          data-testid="gps-track-centerline"
          d={centerlineD}
          fill="none"
          stroke={MAP_COLORS.centerline}
          strokeWidth="1.5"
          strokeDasharray="6 8"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
          style={{ filter: `drop-shadow(0 0 1px ${LMU_COLORS.surface})` }}
        />
      )}

      {/* Left physical track boundary limit / kerb edge */}
      {showEdges && <path
        d={leftEdgeD}
        fill="none"
        stroke={MAP_COLORS.trackBoundary}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.85"
      />}

      {/* Right physical track boundary limit / kerb edge */}
      {showEdges && <path
        d={rightEdgeD}
        fill="none"
        stroke={MAP_COLORS.trackBoundary}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.85"
      />}
    </g>
  );
});
