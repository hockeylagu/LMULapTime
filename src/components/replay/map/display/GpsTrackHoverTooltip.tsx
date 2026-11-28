import React from 'react';
import { CHART_COLORS, LMU_COLORS, MAP_COLORS, TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import type { ProjectedPoint } from '../replayMapUtils.js';
import { trackHoverRows } from '../../../../utils/trackHoverRows.js';

export interface GpsTrackHoverTooltipProps {
  point: ProjectedPoint;
  markerScale: number;
  deltaTimeSec?: number | null;
  distM?: number;
}

export const GpsTrackHoverTooltip: React.FC<GpsTrackHoverTooltipProps> = ({
  point,
  markerScale,
  deltaTimeSec,
  distM,
}) => {
  const rows = trackHoverRows(point, deltaTimeSec, distM);

  const badgeY = point.sy - 26 * markerScale;
  const badgeW = 115 * markerScale;
  const badgeH = 32 * markerScale;

  return (
    <g data-testid="gps-track-hover-tooltip" className="pointer-events-none select-none">
      {/* Target ring on the apex/braking track vertex */}
      <circle
        cx={point.sx}
        cy={point.sy}
        r={5.5 * markerScale}
        fill={TELEMETRY_COLORS.primary}
        fillOpacity="0.4"
        stroke={CHART_COLORS.white}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      {/* Micro-telemetry pill */}
      <g transform={`translate(${point.sx}, ${badgeY})`}>
        <rect
          x={-badgeW / 2}
          y={-badgeH / 2}
          width={badgeW}
          height={badgeH}
          rx={5 * markerScale}
          fill={MAP_COLORS.markerBg}
          fillOpacity="0.94"
          stroke={MAP_COLORS.trackBoundary}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
        {/* Row 1: Speed + Delta */}
        <text
          x={-badgeW * 0.42}
          y={-badgeH * 0.1}
          fill={LMU_COLORS.text}
          fontSize={11 * markerScale}
          fontFamily="Consolas, monospace"
          fontWeight="bold"
        >
          {rows.speed}
        </text>
        {rows.delta && (
          <text
            x={badgeW * 0.42}
            y={-badgeH * 0.1}
            textAnchor="end"
            fill={rows.delta.colour}
            fontSize={10 * markerScale}
            fontFamily="Consolas, monospace"
            fontWeight="bold"
          >
            {rows.delta.text}
          </text>
        )}
        {/* Row 2: Pedals (THR / BRK) & optional Distance */}
        <text
          x={-badgeW * 0.42}
          y={badgeH * 0.32}
          fill={MAP_COLORS.markerMuted}
          fontSize={10 * markerScale}
          fontFamily="Consolas, monospace"
        >
          <tspan fill={rows.pedal.colour} fontWeight={rows.pedal.bold ? 'bold' : undefined}>{rows.pedal.text}</tspan>
          {rows.distance ? ` · ${rows.distance}` : ''}
        </text>
      </g>
    </g>
  );
};
