import type { TrackBrakeMarker, TrackBoundaryGeometry } from '../../../../../shared/types/trackGeometry.js';
import { LMU_COLORS, MAP_COLORS, TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { projectBoundaryPoints } from '../replayMapUtils.js';

export interface BrakeMarkerLayoutOptions {
  markers: TrackBrakeMarker[];
  bounds: TrackBoundaryGeometry['bounds'];
  viewBoxSize: number;
  padding: number;
  markerScale?: number;
  showDistance?: boolean;
  showAds?: boolean;
  showDigi?: boolean;
}

export interface PlacedBrakeMarker {
  id: string;
  marker: TrackBrakeMarker;
  textLabel: string;
  point: { sx: number; sy: number };
  posX: number;
  posY: number;
  lineEndX: number;
  lineEndY: number;
  ux: number;
  uy: number;
  width: number;
  height: number;
  strokeColor: string;
  textColor: string;
  tickStroke: string;
}

const CANDIDATE_OFFSETS: ReadonlyArray<[number, number]> = [
  [0, 0],       // base position
  [1, 0],       // 1 step outward along normal
  [1, 0.7],     // 1 step outward + forward along tangent
  [1, -0.7],    // 1 step outward + backward along tangent
  [2, 0],       // 2 steps outward
  [2, 0.7],     // 2 steps outward + forward
  [2, -0.7],    // 2 steps outward + backward
  [0, 1.2],     // forward along tangent
  [0, -1.2],    // backward along tangent
  [3, 0],       // 3 steps outward
];

/** Level of detail: full boards once zoomed in, roadside ticks only at overview zoom. */
export const showsFullBrakeBoards = (markerScale: number) => markerScale < 0.48;

function checkOverlap(
  x1: number, y1: number, hw1: number, hh1: number,
  x2: number, y2: number, hw2: number, hh2: number,
  gap: number
): boolean {
  return Math.abs(x1 - x2) < (hw1 + hw2 + gap) && Math.abs(y1 - y2) < (hh1 + hh2 + gap);
}

export function placeBrakeMarkers({ markers, bounds, viewBoxSize, padding, markerScale = 1, showDistance = true, showAds = true, showDigi = true }: BrakeMarkerLayoutOptions): PlacedBrakeMarker[] {
  const projected = projectBoundaryPoints(markers.map(marker => marker.center), bounds, viewBoxSize, padding);
  // 1. Filter markers by category settings
  const eligible: Array<{
    index: number;
    marker: TrackBrakeMarker;
    textLabel: string;
    isNum: boolean;
    isDigi: boolean;
    priority: number;
    width: number;
    height: number;
    point: { sx: number; sy: number };
    ux: number;
    uy: number;
    tx: number;
    ty: number;
    strokeColor: string;
    textColor: string;
    tickStroke: string;
  }> = [];

  markers.forEach((marker, index) => {
    const point = projected[index];
    if (!point) return;
    const textLabel = marker.label ?? '';
    if (!textLabel) return;
    const isNum = /^\d+$/.test(textLabel);
    const isDigi = textLabel === 'DIGI';
    if (isNum && !showDistance) return;
    if (!isNum && !isDigi && !showAds) return;
    if (isDigi && !showDigi) return;

    const snx = marker.normal ? marker.normal[0] : (marker.side === 'left' ? -1 : 1);
    const sny = marker.normal ? -marker.normal[1] : 0;
    const normLen = Math.hypot(snx, sny) || 1;
    const ux = snx / normLen;
    const uy = sny / normLen;

    eligible.push({
      index,
      marker,
      textLabel,
      isNum,
      isDigi,
      priority: isNum ? 0 : isDigi ? 2 : 1, // Distance boards first (immovable), then ads, then digi (moves on collision)
      width: textLabel.length >= 4 ? 34 : textLabel.length === 3 ? 28 : textLabel.length === 2 ? 22 : 18,
      height: 16,
      point,
      ux,
      uy,
      tx: -uy,
      ty: ux,
      strokeColor: isDigi ? TELEMETRY_COLORS.primary : isNum ? MAP_COLORS.markerMuted : TELEMETRY_COLORS.baseline,
      textColor: isDigi ? TELEMETRY_COLORS.primary : isNum ? LMU_COLORS.text : TELEMETRY_COLORS.baseline,
      tickStroke: isDigi ? MAP_COLORS.digitalMarkerTick : isNum ? MAP_COLORS.markerMuted : MAP_COLORS.referenceMarkerTick,
    });
  });

  // 2. Sort by priority: distance boards (0) are placed first and stay at base position.
  // Digi boards (2) are placed last and move if overlapping.
  eligible.sort((a, b) => a.priority - b.priority || a.marker.stationM - b.marker.stationM);

  const placedBoxes: Array<{ x: number; y: number; hw: number; hh: number }> = [];
  const results: PlacedBrakeMarker[] = [];

  for (const item of eligible) {
    const hw = (item.width / 2) * markerScale;
    const hh = (item.height / 2) * markerScale;
    const baseDist = item.width / 2 + 6;
    const baseX = item.point.sx + item.ux * baseDist * markerScale;
    const baseY = item.point.sy + item.uy * baseDist * markerScale;
    const stepN = (item.height + 4) * markerScale;
    const stepT = (item.width + 4) * markerScale;

    // Distance boards never move (candidate [0, 0] only).
    // Digi and Ad boards test candidate offsets to avoid overlapping existing boards.
    const offsets = item.priority === 0 ? [[0, 0] as [number, number]] : CANDIDATE_OFFSETS;
    let chosenX = baseX;
    let chosenY = baseY;

    for (let i = 0; i < offsets.length; i++) {
      const [kn, kt] = offsets[i];
      const candX = baseX + (item.ux * kn * stepN + item.tx * kt * stepT);
      const candY = baseY + (item.uy * kn * stepN + item.ty * kt * stepT);
      const collides = placedBoxes.some(b => checkOverlap(candX, candY, hw, hh, b.x, b.y, b.hw, b.hh, 2 * markerScale));
      if (!collides || i === offsets.length - 1) {
        chosenX = candX;
        chosenY = candY;
        if (!collides) break;
      }
    }

    placedBoxes.push({ x: chosenX, y: chosenY, hw, hh });

    // Perpendicular / connection tick line from road edge point to badge border
    const dx = chosenX - item.point.sx;
    const dy = chosenY - item.point.sy;
    const dist = Math.hypot(dx, dy);
    let lineEndX = chosenX;
    let lineEndY = chosenY;
    if (dist > 1) {
      const edgeDist = (Math.min(item.width, item.height) / 2) * markerScale;
      lineEndX = chosenX - (dx / dist) * edgeDist;
      lineEndY = chosenY - (dy / dist) * edgeDist;
    }

    results.push({
      id: item.marker.id,
      marker: item.marker,
      textLabel: item.textLabel,
      point: item.point,
      posX: chosenX,
      posY: chosenY,
      lineEndX,
      lineEndY,
      ux: item.ux,
      uy: item.uy,
      width: item.width,
      height: item.height,
      strokeColor: item.strokeColor,
      textColor: item.textColor,
      tickStroke: item.tickStroke,
    });
  }

  // Sort back by circuit station so foreground order along track is natural
  return results.sort((a, b) => a.marker.stationM - b.marker.stationM);
}
