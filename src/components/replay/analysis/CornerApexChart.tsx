import React, { useMemo } from 'react';
import { X, Flag } from 'lucide-react';
import { ReplayTrajectoryPoint } from '../../../../server/types.js';
import { interpolatePointAtDistance } from '../../../utils/replayComparison.js';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis.js';

export interface CornerApexChartProps {
  corner: CornerSegmentComparison;
  primaryPoints: ReplayTrajectoryPoint[];
  primaryDists: number[];
  baselinePoints?: ReplayTrajectoryPoint[] | null;
  baselineDists?: number[];
  onClose?: () => void;
  className?: string;
}

const SAMPLES = 48;

export const CornerApexChart: React.FC<CornerApexChartProps> = ({
  corner,
  primaryPoints,
  primaryDists,
  baselinePoints,
  baselineDists,
  onClose,
  className = '',
}) => {
  const { primaryPath, baselinePath, minPct } = useMemo(() => {
    const span = Math.max(1, corner.exitDistM - corner.entryDistM);
    const primarySpeeds: number[] = [];
    const baselineSpeeds: number[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const d = corner.entryDistM + (i / SAMPLES) * span;
      primarySpeeds.push(interpolatePointAtDistance(primaryPoints, primaryDists, d).speedKmh);
      if (baselinePoints && baselinePoints.length > 0 && baselineDists && baselineDists.length > 0) {
        baselineSpeeds.push(interpolatePointAtDistance(baselinePoints, baselineDists, d).speedKmh);
      }
    }
    const maxSpd = Math.max(50, ...primarySpeeds, ...baselineSpeeds);
    const toPath = (speeds: number[]) => speeds
      .map((s, i) => {
        const x = (i / SAMPLES) * 1000;
        const y = 95 - Math.min(1, Math.max(0, s / maxSpd)) * 85;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
    return {
      primaryPath: toPath(primarySpeeds),
      baselinePath: baselineSpeeds.length > 0 ? toPath(baselineSpeeds) : '',
      minPct: Math.min(97, Math.max(3, ((corner.minDistM - corner.entryDistM) / span) * 100)),
    };
  }, [corner, primaryPoints, primaryDists, baselinePoints, baselineDists]);

  return (
    <div className={`flex flex-col bg-[#060910] rounded-xl border border-lmu-border/70 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-lmu-border/50 shrink-0">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-white">
          <Flag className="w-3 h-3 text-lmu-accent" />
          Turn {corner.cornerNumber} Apex Chart
        </span>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close corner detail"
            className="p-0.5 rounded text-lmu-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="relative flex-1 min-h-[80px]">
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
          {baselinePath && (
            <path d={baselinePath} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity="0.85" />
          )}
          <path d={primaryPath} fill="none" stroke="#38bdf8" strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <div className="absolute top-0.5 left-1.5 px-1 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono font-bold whitespace-nowrap pointer-events-none">
          ENTRY {corner.primaryEntrySpeedKmh}
        </div>
        <div style={{ left: `${minPct}%` }} className="absolute top-0 bottom-0 w-[1.5px] bg-rose-400/70 pointer-events-none -translate-x-1/2">
          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 px-1 rounded bg-rose-500/20 text-rose-300 text-[9px] font-mono font-bold whitespace-nowrap">
            MIN {corner.primaryMinSpeedKmh}
          </span>
        </div>
        <div className="absolute top-0.5 right-1.5 px-1 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-mono font-bold whitespace-nowrap pointer-events-none">
          EXIT {corner.primaryExitSpeedKmh}
        </div>
      </div>
    </div>
  );
};
