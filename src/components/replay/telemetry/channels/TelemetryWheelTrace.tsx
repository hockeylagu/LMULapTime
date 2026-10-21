import { memo, type ReactNode } from 'react';
import type { CornerPaths } from '../telemetryCornerChartPaths.js';
import { WHEEL_CORNER_COLORS } from '../../../../utils/themeColors.js';

const CORNERS = ['fl', 'fr', 'rl', 'rr'] as const;

/** Shared drawing order and styling for four-wheel telemetry; channel scales stay with their callers. */
export const TelemetryWheelTrace = memo(function TelemetryWheelTrace({ paths, baselinePaths, guides }: {
  paths: CornerPaths;
  baselinePaths?: CornerPaths;
  /** Reference lines drawn beneath the traces, in the same 0–1000 × 10–95 view box. */
  guides?: ReactNode;
}) {
  return (
    <svg viewBox="0 10 1000 85" preserveAspectRatio="none" className="w-full h-full">
      {guides}
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
