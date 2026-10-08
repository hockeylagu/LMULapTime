import React from 'react';
import { CHART_COLORS, LMU_COLORS, MAP_COLORS, TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import type { ProjectedPoint } from '../replayMapUtils.js';

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
  const speed = Math.round(point.speedKmh ?? 0);
  const throttle = Math.round(point.throttle ?? 0);
  const brake = Math.round(point.brake ?? 0);

  const deltaText = deltaTimeSec !== null && deltaTimeSec !== undefined
    ? `${deltaTimeSec > 0 ? '+' : ''}${deltaTimeSec.toFixed(2)}s`
    : null;
  const deltaColor = deltaTimeSec !== null && deltaTimeSec !== undefined
    ? (deltaTimeSec < -0.01 ? MAP_COLORS.gripLimit : deltaTimeSec > 0.01 ? MAP_COLORS.baselineBrake : MAP_COLORS.markerMuted)
    : MAP_COLORS.markerMuted;

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
          {speed} km/h
        </text>
        {deltaText && (
          <text
            x={badgeW * 0.42}
            y={-badgeH * 0.1}
            textAnchor="end"
            fill={deltaColor}
            fontSize={10 * markerScale}
            fontFamily="Consolas, monospace"
            fontWeight="bold"
          >
            {deltaText}
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
          {brake > 5 ? (
            <tspan fill={MAP_COLORS.baselineBrake} fontWeight="bold">BRK {brake}%</tspan>
          ) : throttle > 5 ? (
            <tspan fill={MAP_COLORS.gripLimit} fontWeight="bold">THR {throttle}%</tspan>
          ) : (
            <tspan fill={MAP_COLORS.markerDimmed}>COAST</tspan>
          )}
          {distM !== undefined ? ` · ${Math.round(distM)}m` : ''}
        </text>
      </g>
    </g>
  );
};
