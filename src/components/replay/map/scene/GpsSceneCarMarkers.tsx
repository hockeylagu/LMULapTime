import React from 'react';
import { CHART_COLORS, TELEMETRY_COLORS } from '../../../../utils/themeColors.js';

export interface GpsSceneCarMarkersProps {
  viewBox: string;
  currentPos?: { sx: number; sy: number };
  baselineGhostPos?: { sx: number; sy: number } | null;
  markerScale: number;
  primaryOpacity: number;
  baselineOpacity: number;
}

/**
 * The car, the ghost and the line between them: everything on the map that moves while scrubbing
 * or playing. They are drawn in their own SVG over the scene, on their own compositor layer, so a
 * move (and the markers' pulse animation) re-rasterises only this layer and not the racing lines
 * beneath, which at full resolution are tens of thousands of segments.
 */
export const GpsSceneCarMarkers: React.FC<GpsSceneCarMarkersProps> = ({
  viewBox,
  currentPos,
  baselineGhostPos,
  markerScale,
  primaryOpacity,
  baselineOpacity,
}) => (
  <svg viewBox={viewBox} className="absolute inset-0 w-full h-full pointer-events-none will-change-transform drop-shadow-md" data-testid="gps-car-markers">
    <defs>
      <filter id="carGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={TELEMETRY_COLORS.primary} floodOpacity="0.9" />
      </filter>
      <filter id="ghostGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={TELEMETRY_COLORS.baseline} floodOpacity="0.9" />
      </filter>
    </defs>

    {currentPos && baselineGhostPos && (
      <line
        x1={currentPos.sx}
        y1={currentPos.sy}
        x2={baselineGhostPos.sx}
        y2={baselineGhostPos.sy}
        stroke={TELEMETRY_COLORS.baseline}
        strokeWidth="1.5"
        strokeDasharray="4 4"
        opacity={0.75 * baselineOpacity}
        vectorEffect="non-scaling-stroke"
      />
    )}
    {baselineGhostPos && (
      <g transform={`translate(${baselineGhostPos.sx.toFixed(1)}, ${baselineGhostPos.sy.toFixed(1)}) scale(${markerScale})`} opacity={baselineOpacity}>
        <circle r="11" fill="none" stroke={TELEMETRY_COLORS.baseline} strokeWidth="1.5" opacity="0.5" />
        <circle r="6" fill={TELEMETRY_COLORS.baseline} stroke={CHART_COLORS.white} strokeWidth="2" filter="url(#ghostGlow)" />
      </g>
    )}

    {currentPos && (
      <g transform={`translate(${currentPos.sx}, ${currentPos.sy}) scale(${markerScale})`} opacity={primaryOpacity}>
        <circle r="12" fill="none" stroke={TELEMETRY_COLORS.primary} strokeWidth="2" opacity="0.5" />
        <circle r="6.5" fill={TELEMETRY_COLORS.primary} stroke={CHART_COLORS.white} strokeWidth="2.2" filter="url(#carGlow)" />
      </g>
    )}
  </svg>
);
