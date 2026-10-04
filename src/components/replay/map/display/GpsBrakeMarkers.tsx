import React, { useMemo } from 'react';
import type { TrackBrakeMarker, TrackBoundaryGeometry } from '../../../../../shared/types/trackGeometry.js';
import { LMU_COLORS } from '../../../../utils/themeColors.js';
import { projectBoundaryPoints } from '../replayMapUtils.js';

interface Props {
  markers: TrackBrakeMarker[];
  bounds: TrackBoundaryGeometry['bounds'];
  viewBoxSize: number;
  padding: number;
}

/** Braking boards use the same local-meter projection as the track geometry. */
export const GpsBrakeMarkers: React.FC<Props> = React.memo(({ markers, bounds, viewBoxSize, padding }) => {
  const projected = useMemo(() => projectBoundaryPoints(markers.map(marker => marker.center), bounds, viewBoxSize, padding),
    [markers, bounds, viewBoxSize, padding]);
  const labels = useMemo(() => {
    const placed: Array<{ x: number; y: number; markerX: number; markerY: number }> = [];
    const offsets = Array.from({ length: 31 }, (_, index) => index === 0 ? 0
      : (index % 2 ? -1 : 1) * Math.ceil(index / 2) * 18);
    return projected.map((point, index) => {
      if (!point) return null;
      const side = markers[index].side === 'left' ? -1 : 1;
      const x = point.sx + side * 30;
      const y = offsets.map(offset => point.sy + offset).find(candidateY => {
        const left = x - 22, right = x + 22, top = candidateY - 8, bottom = candidateY + 8;
        const coversMarker = projected.some(other => other && Math.hypot(
          Math.max(left - other.sx, 0, other.sx - right), Math.max(top - other.sy, 0, other.sy - bottom)
        ) < 5);
        const coversLabel = placed.some(other => left < other.x + 22 && right > other.x - 22
          && top < other.y + 10 && bottom > other.y - 10);
        return !coversMarker && !coversLabel;
      }) ?? point.sy;
      const position = { x, y, markerX: point.sx, markerY: point.sy };
      placed.push(position);
      return position;
    });
  }, [markers, projected]);
  return <g data-testid="gps-brake-markers" aria-label="Braking markers" pointerEvents="none">
    {markers.map((marker, index) => {
      const point = projected[index];
      const position = labels[index];
      if (!point || !position) return null;
      const label = marker.distanceM === null ? 'Brake' : `${Math.round(marker.distanceM)} m`;
      const accessibleLabel = marker.distanceM === null
        ? 'Brake board, printed distance unknown'
        : `Brake board, printed ${Math.round(marker.distanceM)} metres`;
      const boxX = position.x - 22;
      return <g key={marker.id} data-marker-id={marker.id} data-station-m={marker.stationM}
        role="img" aria-label={accessibleLabel}>
        <title>{accessibleLabel}</title>
        <circle cx={point.sx} cy={point.sy} r="2.5" fill={LMU_COLORS.accentText} stroke={LMU_COLORS.bg} strokeWidth="1.5" />
        {(position.x !== position.markerX + (marker.side === 'left' ? -30 : 30) || position.y !== point.sy) &&
          <line x1={point.sx} y1={point.sy} x2={position.x} y2={position.y} stroke={LMU_COLORS.accentText} strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        <rect x={boxX} y={position.y - 8} width="44" height="16" rx="2"
          fill={LMU_COLORS.surface} stroke={LMU_COLORS.accentText} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <text x={position.x} y={position.y + 3} textAnchor="middle"
          fill={LMU_COLORS.text} fontSize="10" fontFamily="Consolas, monospace" fontWeight="700">{label}</text>
      </g>;
    })}
  </g>;
});
