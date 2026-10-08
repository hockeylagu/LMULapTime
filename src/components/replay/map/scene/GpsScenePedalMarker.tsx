import React from 'react';
import { PEDAL_MARKER_LINE_HALF_LEN, PEDAL_MARKER_TAG_BASE_OFFSET, PEDAL_MARKER_TAG_STAGGER_OFFSET } from '../replayMapUtils.js';
import { CHART_COLORS, MAP_COLORS, TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import type { PedalMarkerPoint } from './GpsSceneMarkers.js';

export interface GpsScenePedalMarkerProps {
  marker: PedalMarkerPoint;
  /** Where the corner badges sit; the tag flips to the other side of the line when it would land on one. */
  cornerBadgePositions: { posX: number; posY: number }[];
  markerScale: number;
  opacity: number;
}

/** One braking-point or throttle-on line across the racing line, with its B / T tag. */
export const GpsScenePedalMarker: React.FC<GpsScenePedalMarkerProps> = ({ marker: m, cornerBadgePositions, markerScale, opacity }) => {
  const isBrake = m.kind === 'brake';
  const isBase = Boolean(m.isBaseline);

  // Colors: primary uses solid red/green, baseline uses distinct tinted red/green styling
  const primaryColor = isBrake ? MAP_COLORS.apex : TELEMETRY_COLORS.throttle;
  const baselineColor = isBrake ? MAP_COLORS.baselineBrake : MAP_COLORS.baselineThrottle;
  const strokeColor = isBase ? baselineColor : primaryColor;
  const textColor = isBase ? baselineColor : primaryColor;
  const label = isBrake ? 'B' : 'T';

  // Normal vector perpendicular to the trajectory
  const nx = m.nx ?? 0;
  const ny = m.ny ?? 1;

  // Line extending perpendicular across the track
  const lineHalfLen = PEDAL_MARKER_LINE_HALF_LEN;
  const x1 = m.sx - nx * lineHalfLen, y1 = m.sy - ny * lineHalfLen;
  const x2 = m.sx + nx * lineHalfLen, y2 = m.sy + ny * lineHalfLen;
  const tagDist = lineHalfLen + (m.isStaggered ? PEDAL_MARKER_TAG_STAGGER_OFFSET : PEDAL_MARKER_TAG_BASE_OFFSET);

  const defTagX = m.sx + nx * tagDist;
  const defTagY = m.sy + ny * tagDist;
  const distToCornerDef = cornerBadgePositions.reduce((minD, c) => Math.min(minD, Math.hypot(defTagX - c.posX, defTagY - c.posY)), Infinity);
  const side = distToCornerDef < 34 ? -1 : 1;
  const tagX = m.sx + nx * side * tagDist;
  const tagY = m.sy + ny * side * tagDist;

  const stemX1 = m.sx + nx * side * (lineHalfLen + 1), stemY1 = m.sy + ny * side * (lineHalfLen + 1);
  const stemX2 = m.sx + nx * side * (tagDist - 9.5), stemY2 = m.sy + ny * side * (tagDist - 9.5);

  return (
    <g
      data-testid={`pedal-marker-${isBase ? 'baseline-' : ''}${m.kind}-${m.cornerNumber}`}
      transform={`translate(${m.sx}, ${m.sy}) scale(${markerScale}) translate(${-m.sx}, ${-m.sy})`}
      opacity={opacity}
      className="pointer-events-none select-none"
    >
      <title>
        {isBase ? 'Baseline' : 'My'} {isBrake ? 'Braking Point' : 'Throttle On'}
        {m.distM !== undefined ? ` (${m.distM.toFixed(0)}m)` : ''}
      </title>

      {/* Outer glow & guide stems */}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeColor} strokeWidth="3.6" strokeLinecap="round" opacity="0.25" />
      {m.isStaggered && (
        <line x1={stemX1} y1={stemY1} x2={stemX2} y2={stemY2} stroke={strokeColor} strokeWidth="1.5" strokeDasharray="2 2" opacity="0.85" />
      )}

      {/* Perpendicular marker line across racing line */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={strokeColor}
        strokeWidth={isBase ? '2.0' : '2.4'}
        strokeDasharray={isBase ? '4 3' : undefined}
        strokeLinecap="round"
        opacity={isBase ? '0.9' : '0.95'}
      />

      {/* Outer tips & in-line intersection dot */}
      <circle cx={x1} cy={y1} r="2" fill={strokeColor} />
      <circle cx={x2} cy={y2} r="2" fill={strokeColor} />
      <circle cx={m.sx} cy={m.sy} r={isBase ? 2.8 : 2.4} fill={isBase ? MAP_COLORS.markerDotBase : primaryColor} stroke={isBase ? strokeColor : CHART_COLORS.black} strokeWidth={isBase ? 1.6 : 0.9} />

      {/* Indicator badge outside racing line */}
      <g transform={`translate(${tagX.toFixed(1)}, ${tagY.toFixed(1)})`}>
        <circle r="9.5" fill={MAP_COLORS.markerDotBase} stroke={strokeColor} strokeWidth="1.8" strokeDasharray={isBase ? '3.5 2.5' : undefined} />
        <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fill={textColor} fontSize="10.5" fontFamily="Consolas, monospace" fontWeight="bold">
          {label}
        </text>
      </g>
    </g>
  );
};
