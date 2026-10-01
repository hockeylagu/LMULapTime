import React, { useMemo } from 'react';
import { Scale, Sparkles } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { CHART_COLORS, TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';
import { TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';

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
    <svg viewBox="0 8 1000 84" preserveAspectRatio="none" className="w-full h-full">
      {/* Neutral zero centerline */}
      <line x1="0" y1="50" x2="1000" y2="50" stroke={CHART_COLORS.playerHighlight} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />
      {baselineUndersteerPath && (
        <path
          d={baselineUndersteerPath}
          fill="none"
          stroke={TELEMETRY_COLORS.understeer}
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
          stroke={CHART_COLORS.playerHighlight}
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
      return { text: '0.00° Neutral', colorClass: 'text-lmu-warn-soft' };
    }
    if (deg > 0) {
      return { text: `+${deg.toFixed(2)}° Understeer (Push)`, colorClass: 'text-lmu-warn' };
    }
    return { text: `${deg.toFixed(2)}° Oversteer (Loose)`, colorClass: 'text-lmu-loss' };
  };

  const currentFormatted = formatBalance(balance);

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-lmu-warn-deep/20">
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 pointer-events-none">
        <span className="text-lmu-warn-soft font-black text-[10px] tracking-wider flex items-center gap-1">
          <Scale className="w-3 h-3" />
          HANDLING BALANCE
        </span>
        <span className="px-1 py-px rounded bg-lmu-violet-strong/20 text-lmu-violet-soft font-bold text-[10px] tracking-wider flex items-center gap-0.5">
          <Sparkles className="w-2.5 h-2.5" /> COMPUTED
        </span>
        {!(hasBalance) && (<span className="text-[10px] font-mono text-lmu-muted italic">
            Awaiting telemetry
          </span>)}
      </div>

      <TelemetryStaticTrace chart={chartSvg} gridClassName="absolute inset-0 pointer-events-none opacity-20" gridLines={[
        { label: '+8° Understeer (Front Push)', borderClassName: 'border-b border-lmu-warn/30', labelClassName: 'text-[10px] text-lmu-warn font-mono' },
        { label: '0° Neutral Balance', borderClassName: 'border-b border-lmu-warn/50', labelClassName: 'text-[10px] text-lmu-warn-soft font-mono' },
        { label: '-8° Oversteer (Rear Loose)', borderClassName: 'border-b border-lmu-loss/30', labelClassName: 'text-[10px] text-lmu-loss font-mono' },
      ]} />

      {isCursorInView && hasBalance && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className={`px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-warn/80 font-mono font-bold text-[11px] shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap ${currentFormatted.colorClass}`}>
            {currentFormatted.text}
          </span>
          {baseBalance !== undefined && (
            <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-lmu-info-strong/80 font-mono font-bold text-[10px] text-lmu-info-soft shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {baseBalance > 0 ? `+${baseBalance.toFixed(2)}°` : `${baseBalance.toFixed(2)}°`}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
