import type { TrackBrakeMarker, TrackBoundaryGeometry } from '../../../../../shared/types/trackGeometry.js';
import { LMU_COLORS, MAP_COLORS, TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { projectBoundaryPoints } from '../replayMapUtils.js';
import { placeMarkerBox } from '../scene/markerPlacement.js';
import type { RibbonIndex } from '../scene/cornerRibbonClearance.js';

export interface BrakeMarkerLayoutOptions {
  markers: TrackBrakeMarker[];
  bounds: TrackBoundaryGeometry['bounds'];
  viewBoxSize: number;
  padding: number;
  markerScale?: number;
  showDistance?: boolean;
  showAds?: boolean;
  showDigi?: boolean;
  ribbon?: RibbonIndex;
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

/** Level of detail: full boards once zoomed in, roadside ticks only at overview zoom. */
export const showsFullBrakeBoards = (markerScale: number) => markerScale < 0.48;

export function placeBrakeMarkers({ markers, bounds, viewBoxSize, padding, markerScale = 1, showDistance = true, showAds = true, showDigi = true, ribbon }: BrakeMarkerLayoutOptions): PlacedBrakeMarker[] {
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
      priority: isNum ? 0 : isDigi ? 2 : 1, // Distance boards first, then ads and digital boards
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

  // Place distance labels first, preserving every measured roadside anchor.
  // All badges use the same collision solver, including crowded distance labels.
  eligible.sort((a, b) => a.priority - b.priority || a.marker.stationM - b.marker.stationM);

  const placedBoxes: Array<{ x: number; y: number; hw: number; hh: number }> = [];
  const results: PlacedBrakeMarker[] = [];

  for (const item of eligible) {
    const hw = (item.width / 2 + 0.7) * markerScale;
    const hh = (item.height / 2 + 0.7) * markerScale;
    const chosen = placeMarkerBox({ anchor: item.point, direction: { sx: item.ux, sy: item.uy },
      distance: (item.width / 2 + 6) * markerScale }, hw, hh, 6 * markerScale, placedBoxes, ribbon);
    const chosenX = chosen.x, chosenY = chosen.y;
    placedBoxes.push(chosen);
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
