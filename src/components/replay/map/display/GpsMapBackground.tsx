import React, { useId, useMemo } from 'react';
import type { TrackBoundaryGeometry, TrackMapDisplay, TrackMapSurfaces } from '../../../../../shared/types/trackGeometry.js';
import { MAP_COLORS } from '../../../../utils/themeColors.js';
import { buildRoadRibbonSvgPath, projectBoundaryPoints } from '../replayMapUtils.js';
import { GpsTrackRoadRibbon } from '../scene/GpsTrackRoadRibbon.js';
import { GpsTrackSurfaceLayers } from '../scene/GpsTrackSurfaceLayers.js';
import { DEFAULT_MAP_LAYERS, type MapLayers } from './mapLayers.js';

interface Props {
  geometry?: TrackBoundaryGeometry | null;
  display?: TrackMapDisplay | null;
  bounds: TrackBoundaryGeometry['bounds'];
  layers: MapLayers;
  left: Array<{ sx: number; sy: number }>;
  right: Array<{ sx: number; sy: number }>;
  center: Array<{ sx: number; sy: number }>;
  pathD: string;
}

/** The measured ribbon is the safe active-route fallback when native display categories are unavailable. */
export const GpsMapBackground: React.FC<Props> = React.memo(({ geometry, display, bounds, layers, left, right, center, pathD }) => {
  const clipId = useId();
  const kerbClip = useMemo(() => {
    if (!geometry?.surfaceProfile || geometry.centerline.length !== geometry.leftBoundary.length
      || geometry.centerline.length !== geometry.rightBoundary.length) return '';
    const { centerline, leftBoundary, rightBoundary, surfaceProfile } = geometry;
    const outerLeft: Array<[number, number]> = [], outerRight: Array<[number, number]> = [];
    for (let i = 0; i < centerline.length; i++) {
      const before = centerline[(i + centerline.length - 2) % centerline.length];
      const after = centerline[(i + 2) % centerline.length];
      const dx = after[0] - before[0], dz = after[1] - before[1];
      const length = Math.hypot(dx, dz) || 1;
      const rx = dz / length, rz = -dx / length;
      const lw = surfaceProfile.leftKerbWidthM[i] ?? 0, rw = surfaceProfile.rightKerbWidthM[i] ?? 0;
      outerLeft.push([leftBoundary[i][0] - rx * lw, leftBoundary[i][1] - rz * lw]);
      outerRight.push([rightBoundary[i][0] + rx * rw, rightBoundary[i][1] + rz * rw]);
    }
    return buildRoadRibbonSvgPath(projectBoundaryPoints(outerLeft, bounds, 800, 60),
      projectBoundaryPoints(outerRight, bounds, 800, 60));
  }, [geometry, bounds]);
  const empty: TrackMapSurfaces = { road: [], kerb: [], runoff: [] };
  return <g data-testid="gps-map-background">
    {display ? <GpsTrackSurfaceLayers surfaces={display.surfaces} bounds={bounds} viewBoxSize={800} padding={60} layers={layers} /> : <>
      <GpsTrackSurfaceLayers surfaces={geometry?.mapSurfaces ?? empty} bounds={bounds} viewBoxSize={800} padding={60}
        layers={{ ...layers, road: false, kerb: false, pit: false, otherRoad: false }} />
      {kerbClip && layers.kerb && geometry?.mapSurfaces && <>
        <defs><clipPath id={clipId}><path d={kerbClip} clipRule="evenodd" fillRule="evenodd" /></clipPath></defs>
        <g clipPath={`url(#${clipId})`}><GpsTrackSurfaceLayers surfaces={geometry.mapSurfaces} bounds={bounds}
          viewBoxSize={800} padding={60} layers={{ ...DEFAULT_MAP_LAYERS, road: false, kerb: true }} /></g>
      </>}
    </>}
    {(left.length > 0 && right.length > 0) || (center.length > 0 && layers.centerline) ? (
      <GpsTrackRoadRibbon
        leftSvgPoints={left}
        rightSvgPoints={right}
        centerlineSvgPoints={center}
        showRoad={!display && layers.road}
        showEdges={left.length > 0 && right.length > 0}
        showCenterline={layers.centerline}
      />
    ) : (
      !display && layers.road && (
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
