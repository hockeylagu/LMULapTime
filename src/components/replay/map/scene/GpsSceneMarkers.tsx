import type { PedalMarkerPoint } from '../gpsTrackMapTypes.js';
import React, { useMemo } from 'react';
import { GpsScenePedalMarker } from './GpsScenePedalMarker.js';
import { CHART_COLORS, MAP_COLORS } from '../../../../utils/themeColors.js';
import { isPointInViewBox, parseViewBox, PEDAL_MARKER_LINE_HALF_LEN,
  PEDAL_MARKER_TAG_BASE_OFFSET, PEDAL_MARKER_TAG_STAGGER_OFFSET } from '../replayMapUtils.js';
import { buildRibbonIndex, type RibbonIndex, type MarkerObstacle } from './cornerRibbonClearance.js';
import { placeMarkerBox, placeCornerBadges, cornerExteriorSigns, markerSegmentsOverlap } from './markerPlacement.js';
import { MarkerGuide } from './MarkerGuide.js';

export interface CornerMarkerPoint {
  cornerNumber: number;
  sx: number;
  sy: number;
  idx: number;
  actualSx: number;
  actualSy: number;
}


export interface GpsSceneMarkersProps {
  cornerMarkers?: CornerMarkerPoint[];
  markers?: CornerMarkerPoint[];
  selectedCornerNumber?: number | null;
  onSelectCornerNumber?: (cornerNumber: number) => void;
  onSelectIndex?: (index: number) => void;
  pedalMarkers: PedalMarkerPoint[];
  markerScale?: number;
  zoomLevel?: number;
  primaryOpacity?: number;
  baselineOpacity?: number;
  dimNonSelectedTrack?: boolean;
  showCornerFlags?: boolean;
  viewBox?: string;
  leftBoundary?: Array<{ sx: number; sy: number }>;
  rightBoundary?: Array<{ sx: number; sy: number }>;
  markerObstacles?: MarkerObstacle[];
  trajectories?: ReadonlyArray<readonly { sx: number; sy: number }[]>;
  ribbon?: RibbonIndex;
  /** Areas badges avoid but lines may cross, such as the start/finish gate. */
  reserved?: MarkerObstacle[];
}

export const GpsSceneMarkers: React.FC<GpsSceneMarkersProps> = React.memo(({
  cornerMarkers,
  markers,
  selectedCornerNumber,
  onSelectCornerNumber,
  onSelectIndex,
  pedalMarkers,
  markerScale = 1,
  zoomLevel,
  primaryOpacity = 1,
  baselineOpacity = 1,
  dimNonSelectedTrack = false,
  showCornerFlags = true,
  viewBox,
  leftBoundary,
  rightBoundary,
  markerObstacles,
  trajectories,
  ribbon,
  reserved,
}) => {
  const viewBoxRect = useMemo(() => parseViewBox(viewBox), [viewBox]);

  const cornersToRender = useMemo(() => {
    return cornerMarkers ?? markers ?? [];
  }, [cornerMarkers, markers]);

  // Zoom-independent, so wheel steps only pay for the nearby-segment queries.
  const ribbonIndex = useMemo(() => ribbon ?? buildRibbonIndex(leftBoundary ?? [], rightBoundary ?? [], trajectories),
    [ribbon, leftBoundary, rightBoundary, trajectories]);

  const placementObstacles = useMemo(() => [...(markerObstacles ?? []), ...(reserved ?? [])], [markerObstacles, reserved]);

  const apexLabels = useMemo(() => {
    const occupied = [...placementObstacles];
    const result = new Map<number, MarkerObstacle>();
    for (const marker of cornersToRender) {
      if (showCornerFlags && marker.cornerNumber !== selectedCornerNumber) continue;
      const dx = marker.sx - marker.actualSx, dy = marker.sy - marker.actualSy;
      const box = placeMarkerBox({ anchor: { sx: marker.actualSx, sy: marker.actualSy },
        direction: { sx: dx, sy: dy }, distance: 32 * markerScale },
      20.6 * markerScale, 9.6 * markerScale, 8 * markerScale, occupied, ribbonIndex);
      result.set(marker.cornerNumber, box);
      occupied.push(box);
    }
    return result;
  }, [cornersToRender, showCornerFlags, selectedCornerNumber, markerScale, placementObstacles, ribbonIndex]);

  const exteriorSigns = useMemo(() => cornerExteriorSigns(cornersToRender, trajectories?.[0] ?? []), [cornersToRender, trajectories]);

  const cornerPositions = useMemo(() => placeCornerBadges(cornersToRender, { selectedCornerNumber, zoomLevel, markerScale,
    occupied: [...placementObstacles, ...apexLabels.values()], ribbon: ribbonIndex, exteriorSigns,
  }).map(({ marker: m, isSelected, isHidden, x, y }) => ({
    ...m, isSelected, isHidden, isDimmed: selectedCornerNumber != null && !isSelected, posX: x, posY: y,
    apexLabelX: apexLabels.get(m.cornerNumber)?.x ?? m.actualSx,
    apexLabelY: apexLabels.get(m.cornerNumber)?.y ?? m.actualSy,
  })), [cornersToRender, selectedCornerNumber, zoomLevel, markerScale, ribbonIndex, placementObstacles, apexLabels, exteriorSigns]);

  const flagBoxes = useMemo(() => showCornerFlags ? cornerPositions.filter(marker => !marker.isHidden).map(marker => ({
    x: marker.posX, y: marker.posY,
    hw: (marker.isSelected ? 17.6 : 14.3) * markerScale, hh: (marker.isSelected ? 17.6 : 14.3) * markerScale })) : [],
  [showCornerFlags, cornerPositions, markerScale]);

  const visiblePedalMarkers = useMemo(() => {
    let list = pedalMarkers;
    if (dimNonSelectedTrack && selectedCornerNumber != null) {
      list = list.filter(p => p.cornerNumber === selectedCornerNumber);
    }
    if (viewBoxRect) {
      list = list.filter(p => isPointInViewBox(p.sx, p.sy, viewBoxRect));
    }
    return list;
  }, [pedalMarkers, dimNonSelectedTrack, selectedCornerNumber, viewBoxRect]);

  const placedPedals = useMemo(() => {
    const lines: Array<{ left: { sx: number; sy: number }; right: { sx: number; sy: number } }> = [];
    const occupied = [...placementObstacles, ...apexLabels.values(), ...flagBoxes];
    return visiblePedalMarkers.map(marker => {
      const ray = { anchor: { sx: marker.sx, sy: marker.sy },
        direction: { sx: marker.nx ?? 0, sy: marker.ny ?? 1 },
        distance: Math.max(PEDAL_MARKER_LINE_HALF_LEN + 10.4 + 8,
          PEDAL_MARKER_LINE_HALF_LEN + (marker.isStaggered ? PEDAL_MARKER_TAG_STAGGER_OFFSET : PEDAL_MARKER_TAG_BASE_OFFSET)) * markerScale };
      const candidates = [ray, { ...ray, direction: { sx: -ray.direction.sx, sy: -ray.direction.sy } }]
        .map(candidate => placeMarkerBox(candidate, 10.4 * markerScale, 10.4 * markerScale, 8 * markerScale, occupied, ribbonIndex));
      const distance = (box: MarkerObstacle) => Math.hypot(box.x - marker.sx, box.y - marker.sy);
      const badge = candidates[distance(candidates[0]) <= distance(candidates[1]) ? 0 : 1];
      occupied.push(badge);
      const half = PEDAL_MARKER_LINE_HALF_LEN * markerScale;
      const line = { left: { sx: marker.sx - ray.direction.sx * half, sy: marker.sy - ray.direction.sy * half },
        right: { sx: marker.sx + ray.direction.sx * half, sy: marker.sy + ray.direction.sy * half } };
      const showLine = !lines.some(other => markerSegmentsOverlap(line.left, line.right, other, 3 * markerScale));
      if (showLine) lines.push(line);
      return { marker, badgePosition: { sx: badge.x, sy: badge.y }, showLine };
    });
  }, [visiblePedalMarkers, placementObstacles, apexLabels, flagBoxes, markerScale, ribbonIndex]);

  const visibleCornerFlags = useMemo(() => {
    const placed = cornerPositions.filter(c => !c.isHidden);
    const candidates = viewBoxRect
      ? placed.filter(c => isPointInViewBox(c.posX, c.posY, viewBoxRect) || isPointInViewBox(c.actualSx, c.actualSy, viewBoxRect))
      : placed;
    // Selected corners win collisions. The screen-space margin reveals more labels as zoom increases.
    const ordered = [...candidates].sort((a, b) => Number(b.isSelected) - Number(a.isSelected));
    const kept: typeof cornerPositions = [];
    for (const marker of ordered) {
      if (marker.isSelected || kept.every(other => Math.hypot(marker.posX - other.posX, marker.posY - other.posY) > 34 * markerScale)) {
        kept.push(marker);
      }
    }
    return kept;
  }, [cornerPositions, markerScale, viewBoxRect]);

  const visibleApexMarkers = useMemo(() => {
    if (!viewBoxRect) return cornerPositions;
    return cornerPositions.filter(m => isPointInViewBox(m.actualSx, m.actualSy, viewBoxRect));
  }, [cornerPositions, viewBoxRect]);

  const badgeBoxes = [...(markerObstacles ?? []), ...apexLabels.values(), ...flagBoxes,
    ...placedPedals.map(pedal => ({ x: pedal.badgePosition.sx, y: pedal.badgePosition.sy,
      hw: 10.4 * markerScale, hh: 10.4 * markerScale }))];

  return (
    <>
      {!showCornerFlags && visibleApexMarkers.map(m => {
        const labelX = m.apexLabelX, labelY = m.apexLabelY;

        return (
          <g
            key={`apex-${m.cornerNumber}`}
            data-testid={`apex-marker-${m.cornerNumber}`}
            opacity={m.isDimmed ? 0.6 : 1}
            className={`cursor-pointer group transition-opacity duration-150 ${m.isDimmed ? 'hover:opacity-100' : ''}`}
            onClick={e => {
              e.stopPropagation();
              onSelectCornerNumber?.(m.cornerNumber);
              onSelectIndex?.(m.idx);
            }}
          >
            <MarkerGuide from={{ sx: m.actualSx, sy: m.actualSy }} to={{ sx: labelX, sy: labelY }} badgeCenter={{ sx: labelX, sy: labelY }} obstacles={badgeBoxes} stroke={MAP_COLORS.apex} strokeWidth="1.2" strokeDasharray="2.5 2" opacity={m.isDimmed ? 0.5 : 0.8} vectorEffect="non-scaling-stroke" />
            {/* Zoom-agnostic apex red dot anchored at trajectory point */}
            <g transform={`translate(${m.actualSx}, ${m.actualSy}) scale(${markerScale})`} pointerEvents="none">
              <circle r="4" fill={MAP_COLORS.apex} stroke={CHART_COLORS.white} strokeWidth="1.5" />
            </g>
            <g transform={`translate(${labelX}, ${labelY}) scale(${markerScale})`}>
              <rect x="-20" y="-9" width="40" height="18" rx="3" fill={MAP_COLORS.markerBg} stroke={MAP_COLORS.apex} strokeWidth="1.2" opacity={m.isDimmed ? 0.75 : 0.95} className="transition-transform group-hover:scale-110" />
              <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fill={MAP_COLORS.apexText} fontSize="10" fontFamily="Consolas, monospace" fontWeight="bold" letterSpacing="0.06em" className="select-none pointer-events-none">
                APEX
              </text>
            </g>
          </g>
        );
      })}

      {showCornerFlags && visibleCornerFlags.map(m => (
        <g
          key={`corner-${m.cornerNumber}`}
          data-testid={`corner-flag-${m.cornerNumber}`}
          opacity={m.isDimmed ? 0.6 : 1}
          className={`cursor-pointer group transition-opacity duration-150 ${m.isDimmed ? 'hover:opacity-100' : ''}`}
          onClick={e => {
            e.stopPropagation();
            onSelectCornerNumber?.(m.cornerNumber);
            onSelectIndex?.(m.idx);
          }}
        >
          {/* Guide tether connecting badge to apex in world coordinates */}
          <MarkerGuide
            from={{ sx: m.posX, sy: m.posY }} to={{ sx: m.actualSx, sy: m.actualSy }}
            badgeCenter={{ sx: m.posX, sy: m.posY }} obstacles={badgeBoxes}
            stroke={m.isSelected ? MAP_COLORS.apex : MAP_COLORS.markerMuted}
            strokeWidth={m.isSelected ? '2' : '1.3'}
            strokeDasharray={m.isSelected ? undefined : '3 3'}
            opacity={m.isSelected ? 0.9 : m.isDimmed ? 0.45 : 0.6}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          {/* Zoom-agnostic apex dot and APEX pill on trajectory for selected corner */}
          {m.isSelected && (
            <g
              data-testid={`apex-marker-${m.cornerNumber}`}
              transform={`translate(${m.actualSx}, ${m.actualSy}) scale(${markerScale})`}
              pointerEvents="none"
            >
              <circle r="8" fill={MAP_COLORS.apex} opacity="0.3" />
              <circle r="4.5" fill={MAP_COLORS.apex} stroke={CHART_COLORS.white} strokeWidth="1.5" />
              <g transform={`translate(${(m.apexLabelX - m.actualSx) / markerScale}, ${(m.apexLabelY - m.actualSy) / markerScale})`}>
                <rect x="-20" y="-9" width="40" height="18" rx="3" fill={MAP_COLORS.markerBg} stroke={MAP_COLORS.apex} strokeWidth="1.2" opacity="0.95" />
                <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fill={MAP_COLORS.apexText} fontSize="10" fontFamily="Consolas, monospace" fontWeight="bold" letterSpacing="0.06em" className="select-none">
                  APEX
                </text>
              </g>
            </g>
          )}
          {/* Badge anchored at (posX, posY), scaled to constant screen size */}
          <g transform={`translate(${m.posX}, ${m.posY}) scale(${markerScale})`}>
            <circle
              r={m.isSelected ? 16.5 : 13.5}
              fill={m.isSelected ? MAP_COLORS.apex : MAP_COLORS.markerUnselected}
              stroke={m.isSelected ? CHART_COLORS.white : m.isDimmed ? MAP_COLORS.markerDimmed : MAP_COLORS.markerMuted}
              strokeWidth={m.isSelected ? 2.2 : 1.6}
            />
            <text
              x="0"
              y="0"
              textAnchor="middle"
              dominantBaseline="central"
              className={`font-mono font-bold select-none pointer-events-none ${
                m.isSelected ? 'fill-white text-sm' : m.isDimmed ? 'fill-lmu-text text-xs' : 'fill-lmu-text text-xs'
              }`}
            >
              T{m.cornerNumber}
            </text>
          </g>
        </g>
      ))}

      {placedPedals.map(({ marker: m, badgePosition, showLine }) => (
        <GpsScenePedalMarker
          key={`pedal-${m.isBaseline ? 'base' : 'prim'}-${m.kind}-${m.distM}`}
          marker={m}
          badgePosition={badgePosition}
          obstacles={badgeBoxes} showLine={showLine}
          markerScale={markerScale}
          opacity={(m.isBaseline ? baselineOpacity : primaryOpacity) ?? 1}
        />
      ))}
    </>
  );
});
