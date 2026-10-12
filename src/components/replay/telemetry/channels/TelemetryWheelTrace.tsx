import { memo } from 'react';
import type { CornerPaths } from '../telemetryCornerChartPaths.js';
import { WHEEL_CORNER_COLORS } from '../../../../utils/themeColors.js';

const CORNERS = ['fl', 'fr', 'rl', 'rr'] as const;

/** Shared drawing order and styling for four-wheel telemetry; channel scales stay with their callers. */
export const TelemetryWheelTrace = memo(function TelemetryWheelTrace({ paths, baselinePaths }: {
  paths: CornerPaths;
  baselinePaths?: CornerPaths;
}) {
  return (
    <svg viewBox="0 10 1000 85" preserveAspectRatio="none" className="w-full h-full">
      {CORNERS.map(corner => baselinePaths?.[corner] && (
        <path key={`baseline-${corner}`} d={baselinePaths[corner]} fill="none"
          stroke={WHEEL_CORNER_COLORS[corner]} strokeWidth="1" strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke" opacity="0.6" />
      ))}
      {CORNERS.map(corner => paths[corner] && (
        <path key={corner} d={paths[corner]} fill="none" stroke={WHEEL_CORNER_COLORS[corner]}
          strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      ))}
    </svg>
  );
});
