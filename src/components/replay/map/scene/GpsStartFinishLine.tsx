import React, { useMemo } from 'react';
import { placeStartFinish, type StartFinishPlacementOptions } from './startFinishPlacement.js';
import { CHART_COLORS, MAP_COLORS, TELEMETRY_COLORS } from '../../../../utils/themeColors.js';

export interface GpsStartFinishLineProps extends StartFinishPlacementOptions {
  placement?: ReturnType<typeof placeStartFinish>;
}

export const GpsStartFinishLine: React.FC<GpsStartFinishLineProps> = React.memo((props) => {
  const { markerScale } = props;
  const lineData = useMemo(() => props.placement === undefined ? placeStartFinish(props) : props.placement, [props]);
  if (!lineData) return null;

  return (
    <g data-testid="start-finish-line" className="select-none pointer-events-none">
      {/* Black border line */}
      <line
        x1={lineData.x1}
        y1={lineData.y1}
        x2={lineData.x2}
        y2={lineData.y2}
        stroke={CHART_COLORS.black}
        strokeWidth="4.5"
        strokeLinecap="butt"
        vectorEffect="non-scaling-stroke"
      />
      {/* White solid line */}
      <line
        x1={lineData.x1}
        y1={lineData.y1}
        x2={lineData.x2}
        y2={lineData.y2}
        stroke={CHART_COLORS.white}
        strokeWidth="2.2"
        strokeLinecap="butt"
        vectorEffect="non-scaling-stroke"
      />
      {/* Black dashed checkered squares over white line */}
      <line
        x1={lineData.x1}
        y1={lineData.y1}
        x2={lineData.x2}
        y2={lineData.y2}
        stroke={CHART_COLORS.black}
        strokeWidth="2.2"
        strokeDasharray="4 4"
        strokeLinecap="butt"
        vectorEffect="non-scaling-stroke"
      />

      {/* START badge placed beside the road ribbon edge, scaled to constant screen size */}
      <g
        data-testid="start-finish-label"
        transform={`translate(${lineData.labelX}, ${lineData.labelY}) scale(${markerScale ?? (1 / lineData.effectiveZoom)})`}
      >
        <rect
          x="-20"
          y="-8.5"
          width="40"
          height="17"
          rx="3"
          fill={MAP_COLORS.markerBg}
          stroke={TELEMETRY_COLORS.primary}
          strokeWidth="1.2"
          opacity="0.95"
        />
        <text
          x="0"
          y="0"
          textAnchor="middle"
          dominantBaseline="central"
          fill={TELEMETRY_COLORS.primary}
          fontSize="10"
          fontFamily="Consolas, monospace"
          fontWeight="bold"
          letterSpacing="0.05em"
        >
          START
        </text>
      </g>
    </g>
  );
});
