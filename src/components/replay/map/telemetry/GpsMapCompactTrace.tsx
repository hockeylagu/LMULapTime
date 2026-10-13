import { memo, useId } from 'react';
import type { TelemetryChartPathsResult } from '../../telemetry/telemetryChartTypes.js';
import { TELEMETRY_COLORS } from '../../../../utils/themeColors.js';

interface Props {
  channel: 'speed' | 'pedals' | 'delta';
  paths: TelemetryChartPathsResult;
}

/** The selected channel already has a name and live values in the dock; keep the plot itself quiet. */
export const GpsMapCompactTrace = memo(function GpsMapCompactTrace({ channel, paths }: Props) {
  const gradientId = useId();
  const traces = channel === 'pedals' ? [
    { path: paths.throttlePath, baseline: paths.baselineThrottlePath, color: TELEMETRY_COLORS.throttle },
    { path: paths.brakePath, baseline: paths.baselineBrakePath, color: TELEMETRY_COLORS.brake },
  ] : channel === 'speed' ? [
    { path: paths.speedPath, baseline: paths.baselineSpeedPath, color: TELEMETRY_COLORS.primary },
  ] : [{ path: paths.deltaTimePath, baseline: '', color: TELEMETRY_COLORS.rpm }];
  const ticks = channel === 'speed' ? [`${Number(paths.maxSpeed.toFixed(1))} km/h`, `${Number((paths.maxSpeed / 2).toFixed(1))}`, '0']
    : channel === 'pedals' ? ['100%', '50%', '0%']
    : [`−${paths.maxDeltaSec.toFixed(1)}s`, '0', `+${paths.maxDeltaSec.toFixed(1)}s`];
  const tickPositions = channel === 'pedals' ? [2 / 89 * 100, 50, 87 / 89 * 100] : [0, 50, 100];
  return <div className="absolute inset-x-0 top-2 bottom-2" data-testid="compact-telemetry-plot">
    {channel !== 'delta' && <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
      {tickPositions.map(top => <div key={top} style={{ top: `${top}%` }} className="absolute inset-x-0 border-t border-lmu-border/60" />)}
    </div>}
    <svg viewBox={channel === 'speed' ? '0 10 1000 85' : channel === 'pedals' ? '0 8 1000 89' : '0 10 1000 80'}
      preserveAspectRatio="none" className="absolute inset-0 h-full w-full will-change-transform"
      aria-label={channel === 'pedals' ? 'Combined throttle and brake traces' : channel === 'speed' ? 'Speed trace' : 'Comparison delta trace'}>
      {channel === 'delta' && <>
        <defs><linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0">
          {paths.deltaGradientStops.map((stop, index) => <stop key={index} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity} />)}
        </linearGradient></defs>
        <path d={paths.deltaTimeArea} fill={`url(#${gradientId})`} opacity="0.5" />
        <line x1="0" x2="1000" y1="50" y2="50" stroke="currentColor" className="text-lmu-rule" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      </>}
      {traces.map(trace => <g key={trace.color}>
        {trace.baseline && <path d={trace.baseline} fill="none" stroke={channel === 'pedals' ? trace.color : TELEMETRY_COLORS.baseline}
          strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        <path d={trace.path} fill="none" stroke={trace.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </g>)}
    </svg>
    <div aria-hidden="true" className="absolute inset-y-0 -left-12 w-10 font-mono text-[10px] leading-none text-lmu-muted pointer-events-none">
      {ticks.map((tick, index) => <span key={index} style={{ top: `${tickPositions[index]}%` }} className="absolute right-0 -translate-y-1/2 whitespace-nowrap">{tick}</span>)}
    </div>
  </div>;
});
