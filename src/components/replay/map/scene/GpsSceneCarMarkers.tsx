import React from 'react';
import { CHART_COLORS, TELEMETRY_COLORS } from '../../../../utils/themeColors.js';

import { defaultVehicleSize } from '../../../../../shared/domain/vehicleDimensions.js';
type Position = { sx: number; sy: number };
export interface GpsSceneCarMarkersProps {
  viewBox: string;
  currentPos?: Position;
  baselineGhostPos?: Position | null;
  markerScale: number;
  primaryOpacity: number;
  baselineOpacity: number;
  unitsPerMeter?: number;
  primaryVehicleData?: import('../../../../../shared/types/dataPlugin.js').VehicleDataRecord;
  baselineVehicleData?: import('../../../../../shared/types/dataPlugin.js').VehicleDataRecord;
  primaryCarClass?: string;
  baselineCarClass?: string;
  primaryHeadingDeg?: number;
  baselineHeadingDeg?: number;
}

/** Native LMU yaw uses local forward -Z; the map projects +Z upward. */
export function replayBodyHeading(
  points: Array<{ rotY?: number; isTeleport?: boolean }>, index: number, fraction = 0
): number | undefined {
  const i = Math.max(0, Math.min(Math.floor(index), points.length - 1));
  const yaw = points[i]?.rotY;
  if (yaw === undefined || !Number.isFinite(yaw)) return undefined;
  const next = points[i + 1];
  let angle = yaw;
  if (next && !next.isTeleport && next.rotY !== undefined && Number.isFinite(next.rotY)) {
    const delta = Math.atan2(Math.sin(next.rotY - yaw), Math.cos(next.rotY - yaw));
    angle += delta * Math.max(0, Math.min(1, fraction));
  }
  return Math.atan2(Math.sin(angle + Math.PI), Math.cos(angle + Math.PI)) * 180 / Math.PI;
}

/**
 * The car, the ghost and the line between them: everything on the map that moves while scrubbing
 * or playing. They are drawn in their own SVG over the scene, on their own compositor layer, so a
 * move (and the markers' pulse animation) re-rasterises only this layer and not the racing lines
 * beneath, which at full resolution are tens of thousands of segments.
 */
export const GpsSceneCarMarkers: React.FC<GpsSceneCarMarkersProps> = ({
  viewBox, currentPos, baselineGhostPos, markerScale, primaryOpacity, baselineOpacity,
  unitsPerMeter = 0, primaryHeadingDeg, baselineHeadingDeg, primaryCarClass, baselineCarClass, primaryVehicleData, baselineVehicleData,
}) => {
  const car = (position: Position, heading: number | undefined, color: string, opacity: number, ghost: boolean, carClass?: string) => {
    const vehicle=ghost?baselineVehicleData:primaryVehicleData;
    // An outline is placed only when its replay origin has been established.
    const modelReady=!!vehicle?.dimensions && !!vehicle.replayOriginOffsetXZ;
    const size = modelReady ? vehicle!.dimensions! : defaultVehicleSize(carClass);
    const offset=modelReady?vehicle!.replayOriginOffsetXZ!:[0,0];
    const outline=modelReady?vehicle?.outlineXZ:undefined;
    const width = size.widthM * unitsPerMeter;
    const length = size.lengthM * unitsPerMeter;
    // Class-sized footprint grows with camera zoom; overview keeps a readable position dot.
    const showFootprint = Number.isFinite(length) && width > 0 && length >= 14 * markerScale;
    return (
    <g data-car-role={ghost ? 'baseline' : 'primary'}
      transform={`translate(${position.sx}, ${position.sy})`} opacity={opacity}>
      {showFootprint && heading !== undefined && Number.isFinite(heading) ? <g transform={`rotate(${heading})`}>
        <title>{modelReady ? `${vehicle!.model}: ${size.lengthM} × ${size.widthM} m; body orientation from replay` : `Approximate ${carClass || 'unknown class'} size: ${size.lengthM} × ${size.widthM} m; body orientation from replay`}</title>
        {outline ? <polygon data-testid={ghost ? 'gps-ghost-footprint' : 'gps-car-footprint'} points={outline.map(([x,z])=>`${-(x+offset[0])*unitsPerMeter},${(z+offset[1])*unitsPerMeter}`).join(' ')} fill={color} fillOpacity={ghost?.3:.8} stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /> : <rect data-testid={ghost ? 'gps-ghost-footprint' : 'gps-car-footprint'}
          x={-width / 2-offset[0]*unitsPerMeter} y={-length / 2+offset[1]*unitsPerMeter} width={width} height={length} rx={width * 0.18}
          fill={color} fillOpacity={ghost ? 0.3 : 0.8} stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        <path d={`M ${-width * 0.28} ${-length * 0.2} H ${width * 0.28} L ${width * 0.22} ${-length * 0.05} H ${-width * 0.22} Z`}
          fill={CHART_COLORS.white} fillOpacity={ghost ? 0.35 : 0.7} />
        <circle r={Math.min(width * 0.08, 1.5 * markerScale)} fill={CHART_COLORS.white} />
      </g> : <g transform={`scale(${markerScale})`}>
        <circle r={ghost ? 11 : 12} fill="none" stroke={color} strokeWidth="1.5" opacity="0.5" />
        <circle r={ghost ? 6 : 6.5} fill={color} stroke={CHART_COLORS.white} strokeWidth="2"
          filter={ghost ? 'url(#ghostGlow)' : 'url(#carGlow)'} />
      </g>}
    </g>
    );
  };
  return <svg viewBox={viewBox} className="absolute inset-0 w-full h-full pointer-events-none will-change-transform drop-shadow-md" data-testid="gps-car-markers">
    <defs>
      <filter id="carGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={TELEMETRY_COLORS.primary} floodOpacity="0.9" />
      </filter>
      <filter id="ghostGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={TELEMETRY_COLORS.baseline} floodOpacity="0.9" />
      </filter>
    </defs>
    {currentPos && baselineGhostPos && <line x1={currentPos.sx} y1={currentPos.sy} x2={baselineGhostPos.sx} y2={baselineGhostPos.sy}
      stroke={TELEMETRY_COLORS.baseline} strokeWidth="1.5" strokeDasharray="4 4" opacity={0.75 * baselineOpacity} vectorEffect="non-scaling-stroke" />}
    {baselineGhostPos && car(baselineGhostPos, baselineHeadingDeg, TELEMETRY_COLORS.baseline, baselineOpacity, true, baselineCarClass)}
    {currentPos && car(currentPos, primaryHeadingDeg, TELEMETRY_COLORS.primary, primaryOpacity, false, primaryCarClass)}
  </svg>;
};
