import React, { useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore } from 'react';
import type { RaceReplayCar, RaceReplayOverview } from '../../../../shared/types/index.js';
import { RACE_POSE_CHANNEL_COUNT, racePitSlots, sampleRacePose, type RacePoseWindow } from '../../../../shared/domain/raceReplay/poseWindow.js';
import { useTrackBoundaryGeometry } from '../map/useTrackBoundaryGeometry.js';
import { BASE_ZOOM, useGpsMapPanZoom } from '../map/useGpsMapPanZoom.js';
import { hudClearView, type MapView } from '../map/hudClearView.js';
import { activeTrackBounds } from '../map/display/mapLayers.js';
import { useMapLayers } from '../map/display/useMapLayers.js';
import { GpsMapBackground } from '../map/display/GpsMapBackground.js';
import { GpsMapControls } from '../map/display/GpsMapControls.js';
import { projectBoundaryPoints, projectStartFinishGate } from '../map/replayMapUtils.js';
import { GpsBrakeMarkers } from '../map/display/GpsBrakeMarkers.js';
import { projectSectorMarkers, useTrackMarkerPlacement } from '../map/display/useTrackMarkerPlacement.js';
import { buildRibbonIndex } from '../map/scene/cornerRibbonClearance.js';
import { GpsSectorMarkers } from '../map/scene/GpsSectorMarkers.js';
import { GpsStartFinishLine } from '../map/scene/GpsStartFinishLine.js';
import { FOCUS_RING, SURFACE_FOCUS_RING } from '../../common/buttonStyles.js';
import { RaceCarMarkers, type RaceCarPosition } from './RaceCarMarkers.js';
import { RaceLapTiming } from './RaceLapTiming.js';
import { raceLapCount } from './raceLaps.js';
import { RaceCarTooltip } from './RaceCarTooltip.js';
import { isOutAt, type RaceStandingsIndex } from './raceStandings.js';
import type { RaceClock } from './raceClock.js';
import type { RacePoseCache } from './racePoseCache.js';
import { useRaceMapKeys } from './useRaceReplayControls.js';

const VIEWBOX_SIZE = 800;
const PADDING = 60;
/** Opens on the whole circuit (the camera zooms 1.5x at zoom 1). */
const OVERVIEW_ZOOM = 0.7;
/** Pixels between the circuit's home view and the map's edges or its HUD. */
const HOME_MARGIN_PX = 24;

/** The HUD over the map's top right: the map controls and the followed car's timing. */
function hudElements(area: HTMLElement): Element[] {
  const controls = area.querySelector('[data-map-control="navigation"]');
  const timing = area.querySelector('[data-testid="race-lap-heading"]')?.closest('aside');
  return [controls, timing].filter(element => element != null);
}
const NO_POINTS: Array<{ sx: number; sy: number }> = [];
const EMPTY_BOUNDS: Bounds = { minX: 0, minZ: 0, maxX: 0, maxZ: 0, spanX: 0, spanZ: 0 };

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
  /** Counts the requests to put the map on the followed car (a double click in the standings). */
  trackRequest?: number;
  /** The car highlighted here or in the standings, shown with its tooltip. */
  hoverSlot: number | null;
  onFollow: (slot: number) => void;
  onHover: (slot: number | null) => void;
  /** Switches to the 3D view. */
  onToggleView?: () => void;
  className?: string;
}

/** The race map: the circuit and every car on the session clock, following the selected car. */
export const RaceMapScene: React.FC<Props> = ({ overview, index, clock, poses, followSlot, trackRequest = 0, hoverSlot, onFollow, onHover, onToggleView, className = '' }) => {
  const { timeSec } = useSyncExternalStore(clock.subscribe, clock.getState);
  const { trackGeometry } = useTrackBoundaryGeometry({ layoutKey: overview.layoutKey, trackVenue: overview.trackVenue, trackCourse: overview.trackCourse });
  const { layers, changeLayers } = useMapLayers();
  const window = poses.windowAt(timeSec);
  const poseError = window ? null : poses.errorAt(timeSec);
  const trackBounds = useMemo(() => activeTrackBounds(trackGeometry), [trackGeometry]);
  const carBounds = useMemo(() => (trackBounds ? null : windowBounds(window)), [trackBounds, window]);
  const bounds = trackBounds ?? carBounds;
  const cars = useMemo(() => new Map<number, RaceReplayCar>(overview.cars.map(car => [car.slot, car])), [overview.cars]);
  const totalLaps = useMemo(() => raceLapCount(overview), [overview]);
  const pitted = racePitSlots(window, timeSec);
  // Only the race's cars: the windows also carry the pace car.
  const positions = racePositionsAt(window, timeSec, bounds).filter(position => cars.has(position.slot)).map(position =>
    pitted.has(position.slot) || isOutAt(index, position.slot, timeSec) ? { ...position, dimmed: true } : position);
  const followed = positions.find(position => position.slot === followSlot);

  const [homeView, setHomeView] = useState<MapView | null>(null);
  const camera = useGpsMapPanZoom({ viewBoxSize: VIEWBOX_SIZE, currentPos: followed, initialZoom: OVERVIEW_ZOOM, initialFollowCar: false, homeView });
  useRaceMapKeys(camera, onToggleView);
  const { containerRef, viewportRef, currentViewBox, markerScale, zoomLevel, handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick } = camera;
  const svg = useMemo(() => bounds && trackGeometry ? {
    left: trackGeometry.leftBoundary ? projectBoundaryPoints(trackGeometry.leftBoundary, bounds, VIEWBOX_SIZE, PADDING) : [],
    right: trackGeometry.rightBoundary ? projectBoundaryPoints(trackGeometry.rightBoundary, bounds, VIEWBOX_SIZE, PADDING) : [],
    center: trackGeometry.centerline ? projectBoundaryPoints(trackGeometry.centerline, bounds, VIEWBOX_SIZE, PADDING) : [],
  } : { left: [], right: [], center: [] }, [bounds, trackGeometry]);
  // The lap map's track furniture: brake boards, the start/finish line and the sector lines, placed clear of each other.
  const ribbon = useMemo(() => buildRibbonIndex(svg.left, svg.right), [svg]);
  const gates = useMemo(() => bounds ? projectStartFinishGate(trackGeometry, bounds, VIEWBOX_SIZE, PADDING) : null, [trackGeometry, bounds]);
  const sectorMarkers = useMemo(() => bounds ? projectSectorMarkers(trackGeometry, bounds, VIEWBOX_SIZE, PADDING) : [], [trackGeometry, bounds]);
  const furniture = useTrackMarkerPlacement({ layers, brakeMarkers: trackGeometry?.brakeMarkers, bounds: bounds ?? EMPTY_BOUNDS,
    viewBoxSize: VIEWBOX_SIZE, padding: PADDING, markerScale, zoomLevel, ribbon, svgPoints: NO_POINTS,
    gateLeftSvg: gates?.gateLeftSvg, gateRightSvg: gates?.gateRightSvg, sectorMarkers });
  // The home view (first shown, reset, 0/R) frames the whole circuit, its road edges included, clear of the HUD.
  const trackBox = useMemo(() => {
    const points = [...svg.left, ...svg.right, ...svg.center];
    if (!points.length) return null;
    const xs = points.map(point => point.sx), ys = points.map(point => point.sy);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [svg]);
  const measureHome = useEffectEvent(() => {
    const area = viewportRef.current;
    if (!area || !trackBox) return;
    const rect = area.getBoundingClientRect(), hud = hudElements(area).map(element => element.getBoundingClientRect());
    const next = hudClearView({ width: rect.width, height: rect.height },
      { left: Math.min(rect.width, ...hud.map(box => box.left - rect.left)), bottom: Math.max(0, ...hud.map(box => box.bottom - rect.top)) },
      trackBox, VIEWBOX_SIZE, BASE_ZOOM, HOME_MARGIN_PX);
    // The same view again keeps the last object: the camera moves only on a new one.
    setHomeView(last => (next && last && Math.abs(next.zoom - last.zoom) < 1e-3 && Math.abs(next.x - last.x) < 0.05 && Math.abs(next.y - last.y) < 0.05 ? last : next));
  });
  useEffect(() => {
    const area = viewportRef.current;
    if (!area || !trackBox) return;
    measureHome();
    const observer = new ResizeObserver(() => measureHome());
    observer.observe(area);
    hudElements(area).forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [viewportRef, trackBox, followSlot]);
  const unitsPerMeter = bounds ? (VIEWBOX_SIZE - 2 * PADDING) / Math.max(bounds.spanX, bounds.spanZ, 1) : 0;
  // Only a new request moves the map (the camera's setter changes every render).
  const trackFollowed = useEffectEvent(() => camera.setFollowCar(true));
  useEffect(() => {
    if (trackRequest) trackFollowed();
  }, [trackRequest]);
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
              {furniture.placedBrakes.length ? <GpsBrakeMarkers placement={furniture.placedBrakes} markerScale={markerScale}
                startFinishGate={furniture.placedStart?.gate} timingGates={furniture.sectorGates} obstacles={furniture.markerObstacles} /> : null}
              {layers.sectors && <GpsSectorMarkers markers={furniture.placedSectors} markerScale={markerScale} obstacles={furniture.markerObstacles} />}
              {layers.startFinish && <GpsStartFinishLine placement={furniture.placedStart} svgPoints={NO_POINTS} zoomLevel={zoomLevel}
                markerScale={markerScale} gateLeftSvg={gates?.gateLeftSvg} gateRightSvg={gates?.gateRightSvg} />}
            </svg>
            <RaceCarMarkers viewBox={currentViewBox} positions={positions} cars={cars} followSlot={followSlot}
              unitsPerMeter={unitsPerMeter} markerScale={markerScale} hoverSlot={hoverSlot} onHover={onHover} onFollow={follow}
              tooltip={hoverSlot !== null ? <RaceCarTooltip index={index} clock={clock} slot={hoverSlot} /> : null} />
          </>
        ) : (
          <div role="status" className="absolute inset-0 flex items-center justify-center text-sm text-lmu-muted">Loading the cars…</div>
        )}
        {/* As the lap map's fullscreen page: the timing under the map controls, 14 px apart. */}
        {bounds && <RaceLapTiming clock={clock} car={followSlot === null ? undefined : cars.get(followSlot)} laps={overview.laps}
          totalLaps={totalLaps} className="absolute right-3 top-16 z-10" />}
        {bounds && !window && (
          <div role={poseError ? 'alert' : 'status'} className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md border border-lmu-border bg-lmu-card px-3 py-1.5 text-xs text-lmu-text-soft">
            {poseError ? <>Cars unavailable here: {poseError}
              <button type="button" onClick={poses.retry} className={`underline underline-offset-4 ${FOCUS_RING}`}>Retry</button></> : 'Loading the cars…'}
          </div>
        )}
        {bounds && (
          <GpsMapControls camera={camera} layers={layers} onChange={changeLayers} geometry={trackGeometry} bounds={bounds}
            left={svg.left} right={svg.right} center={svg.center} trajectory={[]} orientation="horizontal"
            hasSectors={sectorMarkers.length > 0} showPlayPause={false} shortcuts="race" fullscreen={false} onToggleView={onToggleView} />
        )}
      </div>
    </div>
  );
};

