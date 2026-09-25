import React, { useMemo } from 'react';
import { Disc, AlertTriangle, Sparkles } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';

export interface TelemetryTireSlipChannelProps {
  tireSlipPath: string;
  tireSlipArea?: string;
  baselineTireSlipPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
}

export const TelemetryTireSlipChannel: React.FC<TelemetryTireSlipChannelProps> = React.memo(({
  tireSlipPath,
  tireSlipArea,
  baselineTireSlipPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
}) => {
  const chartSvg = useMemo(() => (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="tireSlipGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TELEMETRY_COLORS.brake} stopOpacity="0.4" />
          <stop offset="60%" stopColor={TELEMETRY_COLORS.baseline} stopOpacity="0.2" />
          <stop offset="100%" stopColor={TELEMETRY_COLORS.throttle} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {/* 80% critical slip threshold line */}
      <line x1="0" y1="27" x2="1000" y2="27" stroke={TELEMETRY_COLORS.brake} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.3" />
      {tireSlipArea && (
        <path d={tireSlipArea} fill="url(#tireSlipGradient)" />
      )}
      {baselineTireSlipPath && (
        <path
          d={baselineTireSlipPath}
          fill="none"
          stroke={TELEMETRY_COLORS.primary}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      )}
      {tireSlipPath && (
        <path
          d={tireSlipPath}
          fill="none"
          stroke={TELEMETRY_COLORS.brake}
          strokeWidth="1.3"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  ), [tireSlipPath, tireSlipArea, baselineTireSlipPath]);

  const slipPct = currentPoint?.tireSlipPct;
  const hasSlip = slipPct !== undefined || Boolean(tireSlipPath);
  const baseSlip = currentComparison?.baseline.tireSlipPct;

  const isLockup = Boolean(currentPoint?.wheelLockActive);
  const isAbs = Boolean(currentPoint?.absActive);
  const isTc = Boolean(currentPoint?.tcActive);

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-rose-950/20">
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-red-500/20 text-red-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Disc className="w-3 h-3" />
          TIRE SLIP & LOCKUP
        </span>
        <span className="px-1 py-0.2 rounded bg-violet-500/20 text-violet-300 font-bold text-[8px] tracking-wider flex items-center gap-0.5">
          <Sparkles className="w-2.5 h-2.5" /> COMPUTED
        </span>
        {isLockup && (
          <span className="px-1.5 py-0.2 rounded bg-rose-500 text-white font-black text-[9px] tracking-wider flex items-center gap-0.5 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]">
            <AlertTriangle className="w-2.5 h-2.5" /> LOCKUP
          </span>
        )}
        {isAbs && !isLockup && (
          <span className="px-1.5 py-0.2 rounded bg-amber-500 text-black font-black text-[9px] tracking-wider">
            ABS
          </span>
        )}
        {isTc && (
          <span className="px-1.5 py-0.2 rounded bg-sky-500 text-black font-black text-[9px] tracking-wider">
            TC
          </span>
        )}
        {hasSlip ? (
          <span className={`text-xs font-mono font-bold ${slipPct && slipPct > 80 ? 'text-rose-400' : slipPct && slipPct > 50 ? 'text-amber-300' : 'text-emerald-400'}`}>
            {slipPct !== undefined ? `${slipPct}% Saturation` : '0%'}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-lmu-muted italic">
            Awaiting telemetry
          </span>
        )}
        {baseSlip !== undefined && (
          <span className="text-[11px] font-mono text-sky-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {baseSlip}%
          </span>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col justify-between py-1.5 px-3 pointer-events-none opacity-20">
        <div className="border-b border-red-400/30 w-full text-[8px] text-red-400 font-mono">100% Saturation / Skid</div>
        <div className="border-b border-amber-400/30 w-full text-[8px] text-amber-300 font-mono">50% Dynamic Grip</div>
        <div className="border-b border-emerald-400/30 w-full text-[8px] text-emerald-400 font-mono">0% Free Rolling</div>
      </div>

      {chartSvg}

      {isCursorInView && hasSlip && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-lmu-badge border border-red-400/80 font-mono font-bold text-[11px] text-red-200 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {slipPct !== undefined ? `${slipPct}%` : '0%'}
            {isLockup && ' (LOCKUP)'}
          </span>
          {baseSlip !== undefined && (
            <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-sky-500/80 font-mono font-bold text-[10px] text-sky-300 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {baseSlip}%
            </span>
          )}
        </div>
      )}
    </div>
  );
});
