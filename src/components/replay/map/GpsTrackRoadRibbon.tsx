import React, { useMemo } from 'react';
import { buildRoadRibbonSvgPath, buildClosedSvgPath } from './replayMapUtils.js';

export interface GpsTrackRoadRibbonProps {
  leftSvgPoints: Array<{ sx: number; sy: number }>;
  rightSvgPoints: Array<{ sx: number; sy: number }>;
  centerlineSvgPoints?: Array<{ sx: number; sy: number }>;
  className?: string;
}

export const GpsTrackRoadRibbon: React.FC<GpsTrackRoadRibbonProps> = ({
  leftSvgPoints,
  rightSvgPoints,
  centerlineSvgPoints,
  className = '',
}) => {
  const ribbonD = useMemo(
    () => buildRoadRibbonSvgPath(leftSvgPoints, rightSvgPoints),
    [leftSvgPoints, rightSvgPoints]
  );

  const leftEdgeD = useMemo(
    () => buildClosedSvgPath(leftSvgPoints),
    [leftSvgPoints]
  );

  const rightEdgeD = useMemo(
    () => buildClosedSvgPath(rightSvgPoints),
    [rightSvgPoints]
  );

  const centerlineD = useMemo(
    () => (centerlineSvgPoints && centerlineSvgPoints.length > 0 ? buildClosedSvgPath(centerlineSvgPoints) : ''),
    [centerlineSvgPoints]
  );

  if (!ribbonD) return null;

  return (
    <g data-testid="gps-track-road-ribbon" className={`pointer-events-none select-none ${className}`}>
      {/* Dark motorsport asphalt road surface */}
      <path
        d={ribbonD}
        fill="#0c121e"
        fillOpacity="0.88"
        stroke="#1a2234"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />

      {/* Subtle dashed centerline guide */}
      {centerlineD && (
        <path
          d={centerlineD}
          fill="none"
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="8 12"
          vectorEffect="non-scaling-stroke"
          opacity="0.4"
        />
      )}

      {/* Left physical track boundary limit / kerb edge */}
      <path
        d={leftEdgeD}
        fill="none"
        stroke="#475569"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.85"
      />

      {/* Right physical track boundary limit / kerb edge */}
      <path
        d={rightEdgeD}
        fill="none"
        stroke="#475569"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.85"
      />
    </g>
  );
};
