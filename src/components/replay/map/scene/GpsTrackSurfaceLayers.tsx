import React, { useMemo } from 'react';
import { MAP_COLORS } from '../../../../utils/themeColors.js';
import { projectBoundaryPoints } from '../replayMapUtils.js';
import type { TrackMapSurfaces } from '../useTrackBoundaryGeometry.js';

interface Props {
  surfaces: TrackMapSurfaces;
  bounds: Parameters<typeof projectBoundaryPoints>[1];
  viewBoxSize: number;
  padding: number;
}

/** Compound SVG paths preserve islands and holes without creating one element per triangle. */
export const GpsTrackSurfaceLayers: React.FC<Props> = React.memo(({ surfaces, bounds, viewBoxSize, padding }) => {
  const layers = useMemo(() => (['runoff', 'road', 'kerb'] as const).map(kind => ({
    kind,
    d: surfaces[kind].map(polygon => polygon.map(ring => {
      const points = projectBoundaryPoints(ring, bounds, viewBoxSize, padding);
      if (points.length < 3) return '';
      return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.sx.toFixed(3)} ${point.sy.toFixed(3)}`).join(' ') + ' Z';
    }).join(' ')).join(' '),
  })), [surfaces, bounds, viewBoxSize, padding]);

  const fills = { road: MAP_COLORS.physicalRoadSurface, kerb: MAP_COLORS.kerbSurface, runoff: MAP_COLORS.runoffSurface };
  return (
    <g data-testid="gps-track-surface-layers" className="pointer-events-none select-none">
      {layers.filter(layer => layer.d.trim()).map(layer => (
        <path key={layer.kind} data-surface={layer.kind} d={layer.d} fill={fills[layer.kind]}
          fillRule="evenodd" stroke={MAP_COLORS.trackBoundary} strokeWidth="0.5"
          vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
});
