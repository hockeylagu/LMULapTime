import { placeMarkerBox, type MarkerPoint } from './markerPlacement.js';
import type { MarkerObstacle, RibbonIndex } from './cornerRibbonClearance.js';
import type { DispersedCornerMarker } from '../replayMapUtils.js';

export interface StartFinishPlacementOptions {
  svgPoints: readonly MarkerPoint[];
  zoomLevel?: number;
  markerScale?: number;
  cornerMarkers?: readonly DispersedCornerMarker[];
  pedalMarkers?: readonly MarkerPoint[];
  gateLeftSvg?: MarkerPoint | null;
  gateRightSvg?: MarkerPoint | null;
  obstacles?: readonly MarkerObstacle[];
  ribbon?: RibbonIndex;
}

/** The gate stays at its measured position; its label participates in the shared badge layout. */
export function placeStartFinish({ svgPoints, zoomLevel = 1, markerScale, cornerMarkers = [], pedalMarkers = [],
  gateLeftSvg, gateRightSvg, obstacles = [], ribbon }: StartFinishPlacementOptions) {
  const effectiveZoom = zoomLevel > 0 ? zoomLevel : 1;
  const scale = markerScale ?? 1 / effectiveZoom;
  let left = gateLeftSvg, right = gateRightSvg;
  if (!left || !right) {
    if (svgPoints.length < 2) return null;
    const start = svgPoints[0], next = svgPoints[Math.min(2, svgPoints.length - 1)];
    const dx = next.sx - start.sx, dy = next.sy - start.sy;
    const length = Math.hypot(dx, dy) || 1;
    const width = Math.max(1.5, Number((14 / effectiveZoom).toFixed(2)));
    left = { sx: start.sx + dy / length * width, sy: start.sy - dx / length * width };
    right = { sx: start.sx - dy / length * width, sy: start.sy + dx / length * width };
  }
  const dx = right.sx - left.sx, dy = right.sy - left.sy;
  const length = Math.hypot(dx, dy) || 1;
  const occupied = [...obstacles, ...[...cornerMarkers, ...pedalMarkers].map(point => ({
    x: point.sx, y: point.sy, hw: 14 * scale, hh: 14 * scale,
  }))];
  const candidates = [
    { anchor: left, direction: { sx: -dx / length, sy: -dy / length }, distance: 28 * scale },
    { anchor: right, direction: { sx: dx / length, sy: dy / length }, distance: 28 * scale },
  ];
  const placements = candidates.map(ray => placeMarkerBox(ray, 21 * scale, 9.5 * scale, 8 * scale, occupied, ribbon));
  const travel = placements.map((box, i) => Math.hypot(box.x - candidates[i].anchor.sx, box.y - candidates[i].anchor.sy));
  const label = placements[travel[0] <= travel[1] ? 0 : 1];
  return { x1: left.sx, y1: left.sy, x2: right.sx, y2: right.sy,
    labelX: label.x, labelY: label.y, effectiveZoom, box: label,
    gate: { left, right } };
}
