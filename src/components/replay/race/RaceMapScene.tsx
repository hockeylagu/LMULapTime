import React, { useMemo, useSyncExternalStore } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import type { RaceReplayCar, RaceReplayOverview } from '../../../../shared/types/index.js';
import { RACE_POSE_CHANNEL_COUNT, sampleRacePose, type RacePoseWindow } from '../../../../shared/domain/raceReplay/poseWindow.js';
import { useTrackBoundaryGeometry } from '../map/useTrackBoundaryGeometry.js';
import { useGpsMapPanZoom } from '../map/useGpsMapPanZoom.js';
import { activeTrackBounds } from '../map/display/mapLayers.js';
import { useMapLayers } from '../map/display/useMapLayers.js';
import { GpsMapBackground } from '../map/display/GpsMapBackground.js';
import { projectBoundaryPoints } from '../map/replayMapUtils.js';
import { FOCUS_RING, SURFACE_FOCUS_RING } from '../../common/buttonStyles.js';
import { RaceCarMarkers, type RaceCarPosition } from './RaceCarMarkers.js';
import { RaceCarTooltip } from './RaceCarTooltip.js';
import type { RaceStandingsIndex } from './raceStandings.js';
import type { RaceClock } from './raceClock.js';
import type { RacePoseCache } from './racePoseCache.js';

const VIEWBOX_SIZE = 800;
const PADDING = 60;
/** Opens on the whole circuit (the camera zooms 1.5x at zoom 1). */
const OVERVIEW_ZOOM = 0.7;

type Bounds = { minX: number; minZ: number; maxX: number; maxZ: number; spanX: number; spanZ: number };

/** The span the cars cover in a window: the map's frame when the layout has no track geometry. */
export function windowBounds(window: RacePoseWindow | null): Bounds | null {
  if (!window) return null;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < window.data.length; i += RACE_POSE_CHANNEL_COUNT) {
    const x = window.data[i];
    const z = window.data[i + 2];
    if (Number.isNaN(x) || Number.isNaN(z)) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return Number.isFinite(minX) ? { minX, minZ, maxX, maxZ, spanX: maxX - minX, spanZ: maxZ - minZ } : null;
}

/** Every car's place on the map at `timeSec` (the same projection as the lap map). */
export function racePositionsAt(window: RacePoseWindow | null, timeSec: number, bounds: Bounds | null): RaceCarPosition[] {
  if (!window || !bounds) return [];
  const [x0, z0] = projectBoundaryPoints([[bounds.minX, bounds.minZ]], bounds, VIEWBOX_SIZE, PADDING).map(p => [p.sx, p.sy])[0];
  const scale = (VIEWBOX_SIZE - 2 * PADDING) / Math.max(bounds.spanX, bounds.spanZ, 1);
  const pose = new Float32Array(RACE_POSE_CHANNEL_COUNT);
  const positions: RaceCarPosition[] = [];
  window.slots.forEach((slot, i) => {
    if (!sampleRacePose(window, i, timeSec, pose)) return;
    // Native yaw faces -Z; the map draws +Z up (as replayBodyHeading).
    const heading = Math.atan2(Math.sin(pose[4] + Math.PI), Math.cos(pose[4] + Math.PI)) * 180 / Math.PI;
    positions.push({ slot, sx: x0 + (pose[0] - bounds.minX) * scale, sy: z0 - (pose[2] - bounds.minZ) * scale, headingDeg: heading });
  });
  return positions;
}

interface Props {
  overview: RaceReplayOverview;
  index: RaceStandingsIndex;
  clock: RaceClock;
  poses: RacePoseCache;
  followSlot: number | null;
  /** The car highlighted here or in the standings, shown with its tooltip. */
  hoverSlot: number | null;
  onFollow: (slot: number) => void;
  onHover: (slot: number | null) => void;
  className?: string;
}

/** The race map: the circuit and every car on the session clock, following the selected car. */
export const RaceMapScene: React.FC<Props> = ({ overview, index, clock, poses, followSlot, hoverSlot, onFollow, onHover, className = '' }) => {
  const { timeSec } = useSyncExternalStore(clock.subscribe, clock.getState);
  const { trackGeometry } = useTrackBoundaryGeometry({ layoutKey: overview.layoutKey, trackVenue: overview.trackVenue, trackCourse: overview.trackCourse });
  const { layers } = useMapLayers();
  const window = poses.windowAt(timeSec);
  const poseError = window ? null : poses.errorAt(timeSec);
  const trackBounds = useMemo(() => activeTrackBounds(trackGeometry), [trackGeometry]);
  const carBounds = useMemo(() => (trackBounds ? null : windowBounds(window)), [trackBounds, window]);
  const bounds = trackBounds ?? carBounds;
  const cars = useMemo(() => new Map<number, RaceReplayCar>(overview.cars.map(car => [car.slot, car])), [overview.cars]);
  const positions = racePositionsAt(window, timeSec, bounds);
  const followed = positions.find(position => position.slot === followSlot);

  const camera = useGpsMapPanZoom({ viewBoxSize: VIEWBOX_SIZE, currentPos: followed, initialZoom: OVERVIEW_ZOOM, initialFollowCar: false });
  const { containerRef, viewportRef, currentViewBox, markerScale, handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick } = camera;
  const svg = useMemo(() => bounds && trackGeometry ? {
    left: trackGeometry.leftBoundary ? projectBoundaryPoints(trackGeometry.leftBoundary, bounds, VIEWBOX_SIZE, PADDING) : [],
    right: trackGeometry.rightBoundary ? projectBoundaryPoints(trackGeometry.rightBoundary, bounds, VIEWBOX_SIZE, PADDING) : [],
    center: trackGeometry.centerline ? projectBoundaryPoints(trackGeometry.centerline, bounds, VIEWBOX_SIZE, PADDING) : [],
  } : { left: [], right: [], center: [] }, [bounds, trackGeometry]);
  const unitsPerMeter = bounds ? (VIEWBOX_SIZE - 2 * PADDING) / Math.max(bounds.spanX, bounds.spanZ, 1) : 0;
  const follow = (slot: number) => {
    onFollow(slot);
    camera.setFollowCar(true);
  };

  return (
    <div ref={containerRef} tabIndex={0} data-replay-surface="map" aria-label="Race map"
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onDoubleClick={handleDoubleClick}
      className={`relative overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing bg-lmu-bg ${SURFACE_FOCUS_RING} ${className}`}>
      <div ref={viewportRef} className="relative w-full h-full">
        {bounds ? (
          <>
            <svg viewBox={currentViewBox} className="w-full h-full" data-testid="race-map-scene">
              <GpsMapBackground geometry={trackGeometry} bounds={bounds} layers={layers}
                left={svg.left} right={svg.right} center={svg.center} pathD="" />
            </svg>
            <RaceCarMarkers viewBox={currentViewBox} positions={positions} cars={cars} followSlot={followSlot}
              unitsPerMeter={unitsPerMeter} markerScale={markerScale} hoverSlot={hoverSlot} onHover={onHover} onFollow={follow}
              tooltip={hoverSlot !== null ? <RaceCarTooltip index={index} clock={clock} slot={hoverSlot} /> : null} />
          </>
        ) : (
          <div role="status" className="absolute inset-0 flex items-center justify-center text-sm text-lmu-muted">Loading the cars…</div>
        )}
        {bounds && !window && (
          <div role={poseError ? 'alert' : 'status'} className="absolute left-3 top-3 flex items-center gap-2 rounded-md border border-lmu-border bg-lmu-card px-3 py-1.5 text-xs text-lmu-text-soft">
            {poseError ? <>Cars unavailable here: {poseError}
              <button type="button" onClick={poses.retry} className={`underline underline-offset-4 ${FOCUS_RING}`}>Retry</button></> : 'Loading the cars…'}
          </div>
        )}
        <div data-map-control className="absolute right-3 top-3 flex flex-col gap-1">
          <MapButton label="Zoom in" onClick={camera.zoomIn}><Plus aria-hidden="true" className="w-4 h-4" /></MapButton>
          <MapButton label="Zoom out" onClick={camera.zoomOut}><Minus aria-hidden="true" className="w-4 h-4" /></MapButton>
          <MapButton label={camera.followCar ? 'Stop following the car (F)' : 'Follow the selected car (F)'} pressed={camera.followCar}
            disabled={followSlot === null} onClick={() => camera.setFollowCar(value => !value)}>
            <LocateFixed aria-hidden="true" className="w-4 h-4" />
          </MapButton>
        </div>
      </div>
    </div>
  );
};

const MapButton: React.FC<{ label: string; onClick: () => void; pressed?: boolean; disabled?: boolean; children: React.ReactNode }> = ({
  label, onClick, pressed, disabled, children,
}) => (
  <button type="button" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}
    className={`grid h-8 w-8 place-items-center rounded-md border border-lmu-border bg-lmu-card text-lmu-text-soft hover:bg-lmu-cardHover disabled:opacity-40 aria-pressed:text-lmu-info ${FOCUS_RING}`}>
    {children}
  </button>
);
