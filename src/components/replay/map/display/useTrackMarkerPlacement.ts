import { useMemo } from 'react';
import type { ReplayTrajectoryData } from '../../../../../shared/types/index.js';
import type { TrackBoundaryGeometry } from '../../../../../shared/types/trackGeometry.js';
import { projectBoundaryPoints } from '../replayMapUtils.js';
import { placeBrakeMarkers, showsFullBrakeBoards } from './placeBrakeMarkers.js';
import type { MapLayers } from './mapLayers.js';
import { placeStartFinish } from '../scene/startFinishPlacement.js';
import { placeSectorMarkers, type SectorMapMarker } from '../scene/GpsSectorMarkers.js';
import type { RibbonIndex } from '../scene/cornerRibbonClearance.js';

type Point = { sx: number; sy: number };

/**
 * The sector lines in SVG space: the package's timing gates, else the lap's sector frames on its own projected points
 * (a map without a lap has the gates only).
 */
export function projectSectorMarkers(geometry: TrackBoundaryGeometry | null | undefined, bounds: TrackBoundaryGeometry['bounds'],
  viewBoxSize: number, padding: number, sectors?: ReplayTrajectoryData['sectors'], svgPoints: readonly Point[] = []): SectorMapMarker[] {
  const markers: SectorMapMarker[] = [];
  for (const key of ['s1', 's2'] as const) {
    const gate = geometry?.timingGates?.[key === 's1' ? 'sector1' : 'sector2'];
    if (gate && [...gate.left, ...gate.right].every(Number.isFinite)
      && (gate.left[0] !== gate.right[0] || gate.left[1] !== gate.right[1])) {
      const [left, right] = projectBoundaryPoints([gate.left, gate.right], bounds, viewBoxSize, padding);
      markers.push({ key, left, right });
      continue;
    }
    const frame = sectors?.[key === 's1' ? 's1Frame' : 's2Frame'];
    if (frame === undefined || !Number.isInteger(frame) || frame <= 0 || frame >= svgPoints.length - 1) continue;
    const point = svgPoints[frame];
    if (Number.isFinite(point.sx) && Number.isFinite(point.sy)) markers.push({ key, point });
  }
  return markers;
}

interface Options {
  layers: MapLayers;
  brakeMarkers: TrackBoundaryGeometry['brakeMarkers'];
  bounds: TrackBoundaryGeometry['bounds'];
  viewBoxSize: number;
  padding: number;
  markerScale: number;
  zoomLevel: number;
  ribbon: RibbonIndex;
  /** The lap's projected points: the start/finish line falls back to their start without a gate. */
  svgPoints: readonly Point[];
  gateLeftSvg?: Point | null;
  gateRightSvg?: Point | null;
  sectorMarkers: SectorMapMarker[];
}

/**
 * Where the map's track furniture goes, each clear of the others: brake boards, the start/finish line and the sector lines,
 * as the layers show them; and the boxes the turn and pedal badges keep clear of.
 */
export function useTrackMarkerPlacement({ layers, brakeMarkers, bounds, viewBoxSize, padding, markerScale, zoomLevel, ribbon,
  svgPoints, gateLeftSvg, gateRightSvg, sectorMarkers }: Options) {
  const placedBrakes = useMemo(() => layers.brakeMarkers ? placeBrakeMarkers({ markers: brakeMarkers ?? [],
    bounds, viewBoxSize, padding, markerScale, ribbon,
    showDistance: layers.brakeDistance, showAds: layers.brakeAds, showDigi: layers.brakeDigi }) : [],
  [layers.brakeMarkers, layers.brakeDistance, layers.brakeAds, layers.brakeDigi, brakeMarkers, bounds, viewBoxSize, padding, markerScale, ribbon]);
  const brakeBoxes = useMemo(() => showsFullBrakeBoards(markerScale) ? placedBrakes.map(board => ({
    x: board.posX, y: board.posY, hw: (board.width / 2 + 0.7) * markerScale, hh: (board.height / 2 + 0.7) * markerScale,
  })) : [], [placedBrakes, markerScale]);
  const placedStart = useMemo(() => layers.startFinish ? placeStartFinish({ svgPoints, zoomLevel, markerScale,
    gateLeftSvg, gateRightSvg, obstacles: brakeBoxes, ribbon }) : null,
  [layers.startFinish, svgPoints, zoomLevel, markerScale, gateLeftSvg, gateRightSvg, brakeBoxes, ribbon]);
  const timingObstacles = useMemo(() => [...brakeBoxes, ...(placedStart ? [placedStart.box] : [])], [brakeBoxes, placedStart]);
  const placedSectors = useMemo(() => layers.sectors ? placeSectorMarkers(sectorMarkers, markerScale, zoomLevel,
    timingObstacles, ribbon) : [], [layers.sectors, sectorMarkers, markerScale, zoomLevel, timingObstacles, ribbon]);
  // Keeps badges off the gate itself; pedal lines may still cross it.
  const gateReservation = useMemo(() => layers.startFinish && svgPoints.length ? [{ x: svgPoints[0].sx, y: svgPoints[0].sy,
    hw: 13 * markerScale, hh: 13 * markerScale }] : [], [layers.startFinish, svgPoints, markerScale]);
  const badgeObstacles = useMemo(() => [...timingObstacles,
    ...placedSectors.map(marker => ({ x: marker.x, y: marker.y, hw: marker.hw, hh: marker.hh }))],
  [timingObstacles, placedSectors]);
  const markerObstacles = useMemo(() => [...badgeObstacles, ...gateReservation], [badgeObstacles, gateReservation]);
  const sectorGates = useMemo(() => placedSectors.flatMap(marker => marker.left ? [{ left: marker.left, right: marker.right }] : []), [placedSectors]);
  const sceneMarkerObstacles = useMemo(() => [...badgeObstacles, ...placedBrakes.map(board => {
    const x2 = showsFullBrakeBoards(markerScale) ? board.lineEndX : board.point.sx + board.ux * 7 * markerScale;
    const y2 = showsFullBrakeBoards(markerScale) ? board.lineEndY : board.point.sy + board.uy * 7 * markerScale;
    return { x: (board.point.sx + x2) / 2, y: (board.point.sy + y2) / 2,
      hw: Math.abs(x2 - board.point.sx) / 2 + 2 * markerScale, hh: Math.abs(y2 - board.point.sy) / 2 + 2 * markerScale };
  })], [badgeObstacles, placedBrakes, markerScale]);
  return { placedBrakes, placedStart, placedSectors, sectorGates, gateReservation, markerObstacles, sceneMarkerObstacles };
}
