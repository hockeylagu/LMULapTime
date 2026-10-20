import React from 'react';
import { MAP_COLORS } from '../../../../utils/themeColors.js';
import { showsFullBrakeBoards, type PlacedBrakeMarker } from './placeBrakeMarkers.js';
import { markerSegmentsOverlap, markerLineHitsBox, type MarkerPoint } from '../scene/markerPlacement.js';
import type { MarkerObstacle } from '../scene/cornerRibbonClearance.js';
import { EMPTY_ARRAY } from '../../../../utils/emptyDefaults.js';

interface Props {
  placement: PlacedBrakeMarker[];
  markerScale: number;
  obstacles?: readonly MarkerObstacle[];
  timingGates?: ReadonlyArray<{ left: MarkerPoint; right: MarkerPoint }>;
  startFinishGate?: { left: MarkerPoint; right: MarkerPoint } | null;
}

/** Braking boards use the same local-meter projection as the track geometry; the scene places them. */
export const GpsBrakeMarkers: React.FC<Props> = React.memo(({ placement: placedMarkers, markerScale, startFinishGate, obstacles = EMPTY_ARRAY, timingGates = EMPTY_ARRAY }) => {
  // Level of detail: show either the full board (zoomed in) or the roadside LOD tick line (zoomed out)
  // without intermediate levels, preventing visual clutter and overlapping semi-transparent artifacts.
  const showFullBoard = showsFullBrakeBoards(markerScale);
  const badgeOpacity = showFullBoard ? 1 : 0;
  const acceptedTicks: Array<{ left: MarkerPoint; right: MarkerPoint }> = [];
  const gates = [...timingGates, ...(startFinishGate ? [startFinishGate] : [])];

  return (
    <g data-testid="gps-brake-markers" aria-label="Braking markers" pointerEvents="none">
      {placedMarkers.map(item => {
        const accessibleLabel = `Brake board, ${item.textLabel}`;
        const tickEnd = { sx: showFullBoard ? item.lineEndX : item.point.sx + item.ux * 7 * markerScale,
          sy: showFullBoard ? item.lineEndY : item.point.sy + item.uy * 7 * markerScale };
        const hideTick = [...gates, ...acceptedTicks].some(gate => markerSegmentsOverlap(item.point, tickEnd, gate, 7 * markerScale))
          || obstacles.some(box => !(box.x === item.posX && box.y === item.posY)
            && markerLineHitsBox(item.point, tickEnd, box, 3 * markerScale));
        if (!hideTick) acceptedTicks.push({ left: item.point, right: tickEnd });
        return (
          <g
            key={item.id}
            data-marker-id={item.id}
            data-station-m={item.marker.stationM}
            role="img"
            aria-label={accessibleLabel}
          >
            <title>{accessibleLabel}</title>
            {/* Roadside tick: a short stub at full-track zoom (LOD line), a connection line to the badge once it shows (full board) */}
            {!hideTick && <line
              x1={item.point.sx}
              y1={item.point.sy}
              x2={tickEnd.sx}
              y2={tickEnd.sy}
              stroke={item.tickStroke}
              strokeWidth={showFullBoard ? '1.2' : '1.6'}
              strokeOpacity={showFullBoard ? 0.7 : 0.85}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />}
            {/* Badge box: hidden at overview zoom, fully visible once zoomed in */}
            <g
              opacity={badgeOpacity}
              transform={`translate(${item.posX}, ${item.posY}) scale(${markerScale})`}
            >
              <rect
                x={-item.width / 2}
                y={-item.height / 2}
                width={item.width}
                height={item.height}
                rx="3"
                fill={MAP_COLORS.markerUnselected}
                stroke={item.strokeColor}
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill={item.textColor}
                fontSize="11"
                fontFamily="Consolas, monospace"
                fontWeight="bold"
                className="select-none pointer-events-none"
              >
                {item.textLabel}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
});
