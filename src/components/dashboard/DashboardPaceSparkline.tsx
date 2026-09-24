import React from 'react';
import type { RecentPacePoint } from './useDashboardTrends.js';

export interface DashboardPaceSparklineProps {
  points: RecentPacePoint[];
  paceDelta: number | null;
  paceTrendDirection: 'improving' | 'declining' | 'steady' | 'none';
  className?: string;
}

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
  const height = 44;
  const paddingX = 12;
  const paddingY = 8;

  // Pace %: lower percentage is faster (closer to 100% alien benchmark).
  // Invert Y mapping so faster pace is rendered higher up (trending UPWARDS).
  const values = points.map(p => p.pacePercentage);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal > 0.1 ? maxVal - minVal : 1;

  const getX = (idx: number) => paddingX + (idx / (points.length - 1)) * (width - 2 * paddingX);
  const getY = (val: number) => {
    // Inverted: minVal (fastest) gets paddingY (top), maxVal (slowest) gets height - paddingY (bottom)
    const ratio = (val - minVal) / range;
    return paddingY + ratio * (height - 2 * paddingY);
  };

  const coords = points.map((p, i) => ({
    x: Number(getX(i).toFixed(1)),
    y: Number(getY(p.pacePercentage).toFixed(1)),
    point: p,
  }));

  const lineD = coords.reduce((acc, c, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`, '');
  const areaD = `${lineD} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;

  const strokeColor =
    paceTrendDirection === 'improving' ? '#10b981' : paceTrendDirection === 'declining' ? '#f59e0b' : '#38bdf8';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} data-testid="dashboard-pace-sparkline">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-lmu-muted uppercase tracking-wider font-semibold font-mono">Pace Trajectory</span>
        <span
          className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10.5px] ${
            paceTrendDirection === 'improving'
              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
              : paceTrendDirection === 'declining'
              ? 'bg-amber-950/60 text-amber-400 border border-amber-500/30'
              : 'bg-sky-950/60 text-sky-400 border border-sky-500/30'
          }`}
        >
          {paceTrendDirection === 'improving' && `+${paceDelta}% Gain ↗`}
          {paceTrendDirection === 'declining' && `${paceDelta}% Delta ↘`}
          {paceTrendDirection === 'steady' && 'Steady Pace →'}
        </span>
      </div>

      <div className="relative w-full h-11 bg-slate-950/60 rounded-md border border-slate-800/80 overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full block" preserveAspectRatio="none">
          <defs>
            <linearGradient id="paceSparklineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill="url(#paceSparklineGrad)" />

          {/* Line stroke */}
          <path d={lineD} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Data point dots - perfectly circular aspect-square overlays immune to SVG preserveAspectRatio distortion */}
        {coords.map((c, i) => {
          const isLatest = i === coords.length - 1;
          const leftPct = (c.x / width) * 100;
          const topPct = (c.y / height) * 100;
          return (
            <div
              key={c.point.id || i}
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                backgroundColor: isLatest ? strokeColor : '#0f172a',
                borderColor: strokeColor,
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 aspect-square rounded-full cursor-pointer transition-transform hover:scale-125 ${
                isLatest
                  ? 'w-2.5 h-2.5 border-2 shadow-sm shadow-emerald-500/50'
                  : 'w-2 h-2 border-[1.5px]'
              }`}
              title={`${c.point.trackName} · ${c.point.bestLapTimeString} (${c.point.pacePercentage}%)`}
            />
          );
        })}
      </div>

      {/* Axis range labels */}
      <div className="flex justify-between items-center text-[10px] font-mono text-lmu-muted px-0.5">
        <span>{points[0].pacePercentage.toFixed(1)}% (Past)</span>
        <span className="text-white font-medium">{points[points.length - 1].pacePercentage.toFixed(1)}% (Latest)</span>
      </div>
    </div>
  );
};
