import React from 'react';
import type { RecentPacePoint } from './useDashboardTrends.js';

export interface DashboardPaceSparklineProps {
  points: RecentPacePoint[];
  paceDelta: number | null;
  paceTrendDirection: 'improving' | 'declining' | 'steady' | 'none';
  className?: string;
}

/** Smallest pace span the chart shows, so a few tenths of noise never fill its whole height. */
const MIN_RANGE = 1.5;
/** Pace-% domain of the chart: the sessions' own span, never narrower than MIN_RANGE. */
const paceDomain = (values: number[]): { lo: number; hi: number } => {
  const lo = Math.min(...values);
  const maxVal = Math.max(...values);
  if (maxVal - lo >= MIN_RANGE) return { lo, hi: maxVal };
  const mid = (lo + maxVal) / 2;
  return { lo: mid - MIN_RANGE / 2, hi: mid + MIN_RANGE / 2 };
};

const TREND_STYLES = {
  improving: { line: 'text-lmu-gain', pill: 'bg-lmu-gain-deep/60 text-lmu-gain border-lmu-gain-strong/30' },
  declining: { line: 'text-lmu-loss', pill: 'bg-lmu-loss-deep/60 text-lmu-loss border-lmu-loss-strong/30' },
  steady: { line: 'text-lmu-info', pill: 'bg-lmu-raised/60 text-lmu-text-soft border-lmu-rule' },
  none: { line: 'text-lmu-info', pill: '' },
} as const;

const dateOf = (timeString: string) => timeString.split(' ')[0];

export const DashboardPaceSparkline: React.FC<DashboardPaceSparklineProps> = ({
  points,
  paceDelta,
  paceTrendDirection,
  className = '',
}) => {
  if (points.length < 2) {
    return (
      <div className={`flex items-center text-xs text-lmu-muted italic py-2 ${className}`}>
        Complete more timed sessions to track pace progression.
      </div>
    );
  }

  const width = 220;
  const height = 72;
  const paddingX = 12;
  const paddingY = 10;

  // Pace %: lower is faster (100% is the alien benchmark), so faster sessions sit higher.
  const { lo, hi } = paceDomain(points.map(p => p.pacePercentage));
  const getX = (idx: number) => paddingX + (idx / (points.length - 1)) * (width - 2 * paddingX);
  const getY = (val: number) => paddingY + ((val - lo) / (hi - lo)) * (height - 2 * paddingY);

  const coords = points.map((p, i) => ({
    x: Number(getX(i).toFixed(1)),
    y: Number(getY(p.pacePercentage).toFixed(1)),
    point: p,
  }));

  const lineD = coords.reduce((acc, c, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`, '');
  const areaD = `${lineD} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;
  const trend = TREND_STYLES[paceTrendDirection];
  const latest = points[points.length - 1];

  return (
    <div className={`flex flex-col gap-2 ${className}`} data-testid="dashboard-pace-sparkline">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-lmu-muted font-mono">Pace Trajectory</span>
          <span className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-[28px] leading-8 font-mono font-extrabold text-white tabular-nums">
              {latest.pacePercentage.toFixed(1)}%
            </span>
            <span className="text-xs text-lmu-muted">of benchmark</span>
          </span>
        </div>
        {paceTrendDirection !== 'none' && (
          <span className={`mb-1 font-mono font-bold px-1.5 py-0.5 rounded text-[11px] border ${trend.pill}`}>
            {/* paceDelta is the drop in benchmark %, so positive is faster. */}
            {paceTrendDirection === 'improving' && paceDelta !== null && `${paceDelta.toFixed(2)}% faster ↗`}
            {paceTrendDirection === 'declining' && paceDelta !== null && `${Math.abs(paceDelta).toFixed(2)}% slower ↘`}
            {paceTrendDirection === 'steady' && 'Steady Pace →'}
          </span>
        )}
      </div>

      <div className={`relative w-full h-[72px] bg-lmu-deep/60 rounded-md border border-lmu-border/80 overflow-hidden ${trend.line}`}>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full block" preserveAspectRatio="none">
          <path d={areaD} fill="currentColor" fillOpacity="0.1" />
          <path d={lineD} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* Dots are HTML overlays so preserveAspectRatio="none" never squashes them into ovals */}
        {coords.map((c, i) => {
          const isLatest = i === coords.length - 1;
          return (
            <div
              key={c.point.id || i}
              style={{ left: `${(c.x / width) * 100}%`, top: `${(c.y / height) * 100}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 aspect-square rounded-full border-current ${
                isLatest ? 'w-2.5 h-2.5 border-2 bg-current' : 'w-2 h-2 border-[1.5px] bg-lmu-surface'
              }`}
              title={`${c.point.trackName} · ${c.point.bestLapTimeString} (${c.point.pacePercentage}%)`}
            />
          );
        })}
      </div>

      <div className="flex justify-between items-center text-xs font-mono text-lmu-muted px-0.5">
        <span>{dateOf(points[0].timeString)}</span>
        <span className="text-lmu-text-soft">{dateOf(latest.timeString)}</span>
      </div>
    </div>
  );
};
