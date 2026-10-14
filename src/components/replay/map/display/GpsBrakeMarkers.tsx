import React from 'react';
import { MAP_COLORS } from '../../../../utils/themeColors.js';
import { showsFullBrakeBoards, type PlacedBrakeMarker } from './placeBrakeMarkers.js';

interface Props { placement: PlacedBrakeMarker[]; markerScale: number }

/** Braking boards use the same local-meter projection as the track geometry; the scene places them. */
export const GpsBrakeMarkers: React.FC<Props> = React.memo(({ placement: placedMarkers, markerScale }) => {
  // Level of detail: show either the full board (zoomed in) or the roadside LOD tick line (zoomed out)
  // without intermediate levels, preventing visual clutter and overlapping semi-transparent artifacts.
  const showFullBoard = showsFullBrakeBoards(markerScale);
  const badgeOpacity = showFullBoard ? 1 : 0;

  return (
    <g data-testid="gps-brake-markers" aria-label="Braking markers" pointerEvents="none">
      {placedMarkers.map(item => {
        const accessibleLabel = `Brake board, ${item.textLabel}`;
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
            <line
              x1={item.point.sx}
              y1={item.point.sy}
              x2={showFullBoard ? item.lineEndX : item.point.sx + item.ux * 7 * markerScale}
              y2={showFullBoard ? item.lineEndY : item.point.sy + item.uy * 7 * markerScale}
              stroke={item.tickStroke}
              strokeWidth={showFullBoard ? '1.2' : '1.6'}
              strokeOpacity={showFullBoard ? 0.7 : 0.85}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
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
