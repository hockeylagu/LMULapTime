import React, { useMemo } from 'react';
import { Scale, Sparkles } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';

export interface TelemetryUndersteerChannelProps {
  understeerPath: string;
  baselineUndersteerPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryUndersteerChannel: React.FC<TelemetryUndersteerChannelProps> = React.memo(({
  understeerPath,
  baselineUndersteerPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Neutral zero centerline */}
      <line x1="0" y1="50" x2="1000" y2="50" stroke="#fbbf24" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />
      {baselineUndersteerPath && (
        <path
          d={baselineUndersteerPath}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {understeerPath && (
        <path
          d={understeerPath}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1.3"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [understeerPath, baselineUndersteerPath]);

  const balance = currentPoint?.understeerDeg;
  const hasBalance = balance !== undefined || Boolean(understeerPath);
  const baseBalance = currentComparison?.baseline.understeerDeg;

  const formatBalance = (deg: number | undefined): { text: string; colorClass: string } => {
    if (deg === undefined || Math.abs(deg) < 0.2) {
      return { text: '0.00° Neutral', colorClass: 'text-amber-300' };
    }
    if (deg > 0) {
      return { text: `+${deg.toFixed(2)}° Understeer (Push)`, colorClass: 'text-amber-400' };
    }
    return { text: `${deg.toFixed(2)}° Oversteer (Loose)`, colorClass: 'text-rose-400' };
  };

  const currentFormatted = formatBalance(balance);

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-[#161208]/50">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-amber-500/20 text-amber-300 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Scale className="w-3 h-3" />
          HANDLING BALANCE
        </span>
        <span className="px-1 py-0.2 rounded bg-violet-500/20 text-violet-300 font-bold text-[8px] tracking-wider flex items-center gap-0.5">
          <Sparkles className="w-2.5 h-2.5" /> COMPUTED
        </span>
        {hasBalance ? (
          <span className={`text-xs font-mono font-bold ${currentFormatted.colorClass}`}>
            {currentFormatted.text}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            Awaiting telemetry
          </span>
        )}
        {baseBalance !== undefined && (
          <span className="text-[11px] font-mono text-sky-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {baseBalance > 0 ? `+${baseBalance.toFixed(2)}°` : `${baseBalance.toFixed(2)}°`}
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-1.5 px-3 pointer-events-none opacity-20">
        <div className="border-b border-amber-400/30 w-full text-[8px] text-amber-400 font-mono">+8° Understeer (Front Push)</div>
        <div className="border-b border-amber-400/50 w-full text-[8px] text-amber-300 font-mono">0° Neutral Balance</div>
        <div className="border-b border-rose-400/30 w-full text-[8px] text-rose-400 font-mono">-8° Oversteer (Rear Loose)</div>
      </div>

      {chartSvg}

      {isCursorInView && hasBalance && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className={`px-2 py-0.5 rounded-md bg-[#070c18] border border-amber-400/80 font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap ${currentFormatted.colorClass}`}>
            {currentFormatted.text}
          </span>
          {baseBalance !== undefined && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#070c18] border border-sky-500/80 font-mono font-bold text-[10px] text-sky-300 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {baseBalance > 0 ? `+${baseBalance.toFixed(2)}°` : `${baseBalance.toFixed(2)}°`}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
