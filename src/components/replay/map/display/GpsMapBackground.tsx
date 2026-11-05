import React from 'react';
import type { TrackBoundaryGeometry } from '../../../../../shared/types/trackGeometry.js';
import { MAP_COLORS } from '../../../../utils/themeColors.js';
import { GpsTrackRoadRibbon } from '../scene/GpsTrackRoadRibbon.js';
import { GpsTrackSurfaceLayers } from '../scene/GpsTrackSurfaceLayers.js';
import type { MapLayers } from './mapLayers.js';

interface Props {
  geometry?: TrackBoundaryGeometry | null;
  bounds: TrackBoundaryGeometry['bounds'];
  layers: MapLayers;
  left: Array<{ sx: number; sy: number }>;
  right: Array<{ sx: number; sy: number }>;
  center: Array<{ sx: number; sy: number }>;
  pathD: string;
}

/** The measured ribbon is the active-route fallback when the track carries no map surfaces. */
export const GpsMapBackground: React.FC<Props> = React.memo(({ geometry, bounds, layers, left, right, center, pathD }) => {
  const surfaces = geometry?.surfaces;
  return <g data-testid="gps-map-background">
    {surfaces && <GpsTrackSurfaceLayers surfaces={surfaces} bounds={bounds} viewBoxSize={800} padding={60} layers={layers} />}
    {(left.length > 0 && right.length > 0) || (center.length > 0 && layers.centerline) ? (
      <GpsTrackRoadRibbon
        leftSvgPoints={left}
        rightSvgPoints={right}
        centerlineSvgPoints={center}
        showRoad={!surfaces && layers.road}
        showEdges={left.length > 0 && right.length > 0}
        showCenterline={layers.centerline}
      />
    ) : (
      !surfaces && layers.road && (
        <path
          d={pathD}
          fill="none"
          stroke={MAP_COLORS.roadSurface}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )
    )}
  </g>;
});
