import React, { useMemo } from 'react';
import { MAP_COLORS } from '../../../../utils/themeColors.js';
import { projectBoundaryPoints } from '../replayMapUtils.js';
import type { TrackMapSurfaces } from '../useTrackBoundaryGeometry.js';
import { DEFAULT_MAP_LAYERS, type MapLayers } from '../display/mapLayers.js';

interface Props {
  surfaces: TrackMapSurfaces;
  bounds: Parameters<typeof projectBoundaryPoints>[1];
  viewBoxSize: number;
  padding: number;
  layers?: MapLayers;
}

/** Compound SVG paths preserve islands and holes without creating one element per triangle. */
export const GpsTrackSurfaceLayers: React.FC<Props> = React.memo(({ surfaces, bounds, viewBoxSize, padding, layers = DEFAULT_MAP_LAYERS }) => {
  const paths = useMemo(() => (['grass', 'gravel', 'runoff', 'apron', 'otherRoad', 'pit', 'road', 'kerb'] as const).map(kind => ({
    kind,
    d: (surfaces[kind] ?? []).map(polygon => polygon.map(ring => {
      const points = projectBoundaryPoints(ring, bounds, viewBoxSize, padding);
      if (points.length < 3) return '';
      return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.sx.toFixed(3)} ${point.sy.toFixed(3)}`).join(' ') + ' Z';
    }).join(' ')).join(' '),
  })), [surfaces, bounds, viewBoxSize, padding]);

  const fills = { road: MAP_COLORS.physicalRoadSurface, kerb: MAP_COLORS.kerbSurface, runoff: MAP_COLORS.runoffSurface,
    apron: MAP_COLORS.apronSurface, gravel: MAP_COLORS.gravelSurface, grass: MAP_COLORS.grassSurface, pit: MAP_COLORS.pitSurface, otherRoad: MAP_COLORS.outerRoadSurface };
  return (
    <g data-testid="gps-track-surface-layers" className="pointer-events-none select-none">
      {paths.filter(layer => layers[layer.kind] && layer.d.trim()).map(layer => (
        <path key={layer.kind} data-surface={layer.kind} d={layer.d} fill={fills[layer.kind]}
          fillRule="evenodd" stroke="none" />
      ))}
    </g>
  );
});
