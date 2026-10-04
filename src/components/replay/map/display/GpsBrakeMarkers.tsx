import React, { useMemo } from 'react';
import type { TrackBrakeMarker, TrackBoundaryGeometry } from '../../../../../shared/types/trackGeometry.js';
import { LMU_COLORS, MAP_COLORS } from '../../../../utils/themeColors.js';
import { projectBoundaryPoints } from '../replayMapUtils.js';

interface Props {
  markers: TrackBrakeMarker[];
  bounds: TrackBoundaryGeometry['bounds'];
  viewBoxSize: number;
  padding: number;
  markerScale?: number;
}

/** Braking boards use the same local-meter projection as the track geometry. */
export const GpsBrakeMarkers: React.FC<Props> = React.memo(({
  markers,
  bounds,
  viewBoxSize,
  padding,
  markerScale = 1,
}) => {
  const projected = useMemo(
    () => projectBoundaryPoints(markers.map(marker => marker.center), bounds, viewBoxSize, padding),
    [markers, bounds, viewBoxSize, padding]
  );

  return (
    <g data-testid="gps-brake-markers" aria-label="Braking markers" pointerEvents="none">
      {markers.map((marker, index) => {
        const point = projected[index];
        if (!point) return null;
        const textLabel = marker.label ?? '';
        if (!textLabel) return null;
        const accessibleLabel = `Brake board, ${textLabel}`;
        const width = textLabel.length >= 3 ? 28 : textLabel.length === 2 ? 22 : 18;
        const height = 16;

        // Vector pointing outward from track in screen space:
        // In local track space, +x is screen right, +z is screen UP.
        // Therefore normal [nx, nz] maps to screen normal [nx, -nz].
        const snx = marker.normal ? marker.normal[0] : (marker.side === 'left' ? -1 : 1);
        const sny = marker.normal ? -marker.normal[1] : 0;
        const normLen = Math.hypot(snx, sny) || 1;
        const ux = snx / normLen;
        const uy = sny / normLen;

        // Zoom-dependent level of detail: badges smoothly fade in as the camera zooms into a corner/sector,
        // while subtle perpendicular tick marks always show the precise roadside brake stations.
        const badgeOpacity = Math.max(0, Math.min(1, (0.48 - markerScale) / 0.12));
        const extraMargin = 5 + 3 * Math.min(1, markerScale);
        const shiftX = ux * (width / 2 + extraMargin);
        const shiftY = uy * (height / 2 + extraMargin);
        const posX = point.sx + shiftX * markerScale;
        const posY = point.sy + shiftY * markerScale;
        const tickLength = badgeOpacity > 0 ? extraMargin : 7;

        return (
          <g
            key={marker.id}
            data-marker-id={marker.id}
            data-station-m={marker.stationM}
            role="img"
            aria-label={accessibleLabel}
          >
            <title>{accessibleLabel}</title>
            {/* Roadside perpendicular tick line */}
            <line
              x1={point.sx}
              y1={point.sy}
              x2={point.sx + ux * tickLength * markerScale}
              y2={point.sy + uy * tickLength * markerScale}
              stroke={MAP_COLORS.markerMuted}
              strokeWidth={badgeOpacity > 0 ? '1.1' : '1.6'}
              strokeOpacity={badgeOpacity > 0 ? 0.5 : 0.85}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* Upright badge box smoothly fading in with zoom */}
            <g
              opacity={badgeOpacity}
              transform={`translate(${posX}, ${posY}) scale(${markerScale})`}
              className="transition-opacity duration-150"
            >
              <rect
                x={-width / 2}
                y={-height / 2}
                width={width}
                height={height}
                rx="3"
                fill={MAP_COLORS.markerUnselected}
                stroke={MAP_COLORS.markerMuted}
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill={LMU_COLORS.text}
                fontSize="11"
                fontFamily="Consolas, monospace"
                fontWeight="bold"
                className="select-none pointer-events-none"
              >
                {textLabel}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
});
