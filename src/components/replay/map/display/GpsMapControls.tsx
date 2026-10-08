import React from 'react';
import type { TrackBoundaryGeometry, TrackMapDisplay } from '../../../../../shared/types/trackGeometry.js';
import { MapControlsOverlay } from '../MapControlsOverlay.js';
import { useGpsMapPanZoom } from '../useGpsMapPanZoom.js';
import { projectBoundaryPoints } from '../replayMapUtils.js';
import { MapLayersControl } from './MapLayersControl.js';
import { MapFullscreenButton } from './MapFullscreenButton.js';
import { ReplayShortcutHelp } from '../../ReplayShortcutHelp.js';
import { RUNOFF_GROUP, visibleSurfacePoints, type MapLayers } from './mapLayers.js';
import { projectedPointBounds } from './useMapLayers.js';

type Point = { sx: number; sy: number };
interface Props {
  camera: ReturnType<typeof useGpsMapPanZoom>;
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
  geometry?: TrackBoundaryGeometry | null;
  display?: TrackMapDisplay | null;
  error?: string | null;
  bounds: TrackBoundaryGeometry['bounds'];
  left: Point[]; right: Point[]; center: Point[]; trajectory: Point[];
  orientation: 'vertical' | 'horizontal';
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  isExpanded?: boolean;
  onToggleExpanded?: (expanded: boolean) => void;
  showPlayPause?: boolean;
}

export const GpsMapControls: React.FC<Props> = ({ camera, layers, onChange, geometry, display, error,
  bounds, left, right, center, trajectory, orientation, isPlaying, onTogglePlay, isExpanded, onToggleExpanded, showPlayPause }) => {
  const fit = (points: Point[]) => { const rectangle = projectedPointBounds(points); if (rectangle) camera.fitBounds(rectangle); };
  const active = left.length && right.length ? [...left, ...right] : trajectory;
  const shouldShowPlayPause = showPlayPause ?? Boolean(isExpanded);
  return <MapControlsOverlay onZoomIn={camera.zoomIn} onZoomOut={camera.zoomOut} onReset={() => fit(active)}
    zoomDisplay={`${Number(camera.zoomLevel.toFixed(1))}x`} followCar={camera.followCar}
    onToggleFollowCar={() => camera.setFollowCar(value => !value)} onCenterCar={camera.centerOnCar}
    isPlaying={isPlaying} onTogglePlay={shouldShowPlayPause ? onTogglePlay : undefined}
    orientation={orientation} className="top-2 right-2 bottom-auto">
    <MapLayersControl layers={layers} onChange={onChange} error={error}
      available={{ road: true, kerb: Boolean(display?.surfaces.kerb.length || geometry?.surfaceProfile && geometry.mapSurfaces?.kerb.length),
        runoff: RUNOFF_GROUP.some(key => display?.surfaces[key]?.length || geometry?.mapSurfaces?.[key]?.length),
        pit: Boolean(display?.surfaces.pit.length), otherRoad: Boolean(display?.surfaces.otherRoad.length),
        brakeMarkers: Boolean(display?.brakeMarkers?.length),
        centerline: center.length > 0 }}
      runoffKinds={RUNOFF_GROUP.filter(key => display?.surfaces[key]?.length || geometry?.mapSurfaces?.[key]?.length)}
      onFitTrack={() => fit(active)} onFitVisible={() => fit([...active,
        ...projectBoundaryPoints(visibleSurfacePoints(display?.surfaces ?? geometry?.mapSurfaces,
          { ...layers, road: Boolean(display) && layers.road, kerb: Boolean(display) && layers.kerb }), bounds, 800, 60)])} />
    <ReplayShortcutHelp />
    <MapFullscreenButton isExpanded={isExpanded} onToggleExpanded={onToggleExpanded} />
  </MapControlsOverlay>;
};
