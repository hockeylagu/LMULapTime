import React from 'react';
import type { TrackBoundaryGeometry } from '../../../../../shared/types/trackGeometry.js';
import { MapControlsOverlay } from '../MapControlsOverlay.js';
import { useGpsMapPanZoom } from '../useGpsMapPanZoom.js';
import { projectBoundaryPoints } from '../replayMapUtils.js';
import { MapLayersControl, type PedalPointsControl } from './MapLayersControl.js';
import { MapFullscreenButton } from './MapFullscreenButton.js';
import { MapViewSwitchButton } from './MapViewSwitchButton.js';
import { ReplayShortcutHelp } from '../../ReplayShortcutHelp.js';
import { CornerCardButton } from '../../cornerCard/CornerInsightCard.js';
import { RUNOFF_GROUP, visibleSurfacePoints, type MapLayers } from './mapLayers.js';
import { projectedPointBounds } from './useMapLayers.js';

type Point = { sx: number; sy: number };
interface Props {
  camera: ReturnType<typeof useGpsMapPanZoom>;
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
  geometry?: TrackBoundaryGeometry | null;
  bounds: TrackBoundaryGeometry['bounds'];
  left: Point[]; right: Point[]; center: Point[]; trajectory: Point[];
  orientation: 'vertical' | 'horizontal';
  isExpanded?: boolean;
  onToggleExpanded?: (expanded: boolean) => void;
  hasSectors?: boolean;
  hasTurns?: boolean;
  pedalPoints?: PedalPointsControl;
  onToggleView?: () => void;
  /** Which shortcuts the help lists: the lap view's, or the race replay's. */
  shortcuts?: 'telemetry' | 'race';
  /** False where the map already fills the page (the race replay). */
  fullscreen?: boolean;
  /** The corner card's button, where the map shows the card. */
  cornerCard?: boolean;
}

export const GpsMapControls: React.FC<Props> = ({ camera, layers, onChange, geometry,
  bounds, left, right, center, trajectory, orientation, isExpanded, onToggleExpanded, hasSectors, hasTurns, pedalPoints, onToggleView, shortcuts = 'telemetry', fullscreen = true, cornerCard = false }) => {
  const surfaces = geometry?.surfaces;
  const fit = (points: Point[]) => { const rectangle = projectedPointBounds(points); if (rectangle) camera.fitBounds(rectangle); };
  const active = left.length && right.length ? [...left, ...right] : trajectory;
  // No play here: playback lives in the replay header, shown over fullscreen too (driver, 2026-11-18).
  return <MapControlsOverlay onZoomIn={camera.zoomIn} onZoomOut={camera.zoomOut} onReset={camera.resetPanZoom}
    zoomDisplay={`${Number(camera.zoomLevel.toFixed(1))}x`} followCar={camera.followCar}
    onToggleFollowCar={() => camera.setFollowCar(value => !value)} onCenterCar={camera.centerOnCar}
    orientation={orientation} className="top-2 right-3 bottom-auto">
    <MapLayersControl layers={layers} onChange={onChange} pedalPoints={pedalPoints}
      available={{ road: true, kerb: Boolean(surfaces?.kerb.length || surfaces?.raisedKerb?.length),
        runoff: RUNOFF_GROUP.some(key => surfaces?.[key]?.length),
        pit: Boolean(surfaces?.pit?.length), otherRoad: Boolean(surfaces?.otherRoad?.length),
        brakeMarkers: Boolean(geometry?.brakeMarkers?.length),
        centerline: center.length > 0, officialTurns: center.length > 0, sectors: Boolean(hasSectors), turns: Boolean(hasTurns) }}
      hasRaisedKerbs={Boolean(surfaces?.raisedKerb?.length)}
      runoffKinds={RUNOFF_GROUP.filter(key => surfaces?.[key]?.length)}
      onFitTrack={() => fit(active)} onFitVisible={() => fit([...active,
        ...projectBoundaryPoints(visibleSurfacePoints(surfaces,
          { ...layers, road: Boolean(surfaces) && layers.road, kerb: Boolean(surfaces) && layers.kerb }), bounds, 800, 60)])} />
    {cornerCard && <CornerCardButton />}
    <ReplayShortcutHelp view={shortcuts} />
    {onToggleView && <MapViewSwitchButton view="2d" onToggleView={onToggleView} />}
    {fullscreen && <MapFullscreenButton isExpanded={isExpanded} onToggleExpanded={onToggleExpanded} />}
  </MapControlsOverlay>;
};
