import React, { useMemo, useState, useEffect } from 'react';
import { Compass } from 'lucide-react';
import { ReplayTrajectoryPoint, ReplayTelemetryPoint } from '../../../../../../shared/types/index.js';
import { PointComparison } from '../../../../../utils/replayComparison.js';
import { CornerSegmentComparison } from '../../../../../utils/cornerAnalysis/index.js';
import { getSteerPercent } from '../../../../../../shared/domain/formatters.js';
import {
  detectHandlingBalanceEvents,
  computeVisibleHandlingBands,
} from '../../../../../utils/handlingBalanceDetection.js';
import { TELEMETRY_COLORS } from '../../../../../utils/themeColors.js';
import { TelemetryGridLine, TelemetryStaticTrace } from '../../TelemetryStaticTrace.js';
import { TelemetrySteerOverlayToggles } from './TelemetrySteerOverlayToggles.js';

const steerGridLines = (range: number): readonly TelemetryGridLine[] => [
  { label: `-${range}% L`, yPercent: 0, borderClassName: 'border-b border-lmu-indigo/30', labelClassName: 'text-[10px] text-lmu-indigo font-mono' },
  { label: '0% Center', yPercent: 50, borderClassName: 'border-b border-lmu-indigo/50', labelClassName: 'text-[10px] text-lmu-indigo-soft font-mono' },
  { label: `+${range}% R`, yPercent: 100, borderClassName: 'border-b border-lmu-indigo/30', labelClassName: 'text-[10px] text-lmu-indigo font-mono' },
];

export interface TelemetrySteerChannelProps {
  steerPath: string;
  baselineSteerPath?: string;
  currentPoint?: ReplayTelemetryPoint;
  currentComparison?: PointComparison | null;
  isCursorInView: boolean;
  cursorPct: number;
  points?: ReplayTrajectoryPoint[];
  cornerSegments?: CornerSegmentComparison[];
  pointComparisons?: PointComparison[];
  cumDists?: number[];
  viewStart?: number;
  viewEnd?: number;
}

export const TelemetrySteerChannel: React.FC<TelemetrySteerChannelProps> = React.memo(({
  steerPath,
  baselineSteerPath,
  currentPoint,
  currentComparison,
  isCursorInView,
  cursorPct,
  points,
  cornerSegments,
  pointComparisons,
  cumDists,
  viewStart,
  viewEnd,
}) => {
  const [scaleMode, setScaleMode] = useState('fit');
  const fittedRange = useMemo(() => {
    if (!points?.length) return 100;
    let peak = 0;
    for (const point of points) peak = Math.max(peak, Math.abs(getSteerPercent(point.steerYaw)));
    for (const comparison of pointComparisons ?? []) peak = Math.max(peak, Math.abs(getSteerPercent(comparison.baseline.steerYaw)));
    return Math.min(100, Math.max(25, Math.ceil(peak * 1.1 / 5) * 5));
  }, [points, pointComparisons]);
  const range = scaleMode === 'fit' ? fittedRange : Number(scaleMode);
  const gridLines = useMemo(() => steerGridLines(range), [range]);

  const [showBalance, setShowBalance] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('lmu_telemetry_steer_balance_overlay');
      return saved === null ? true : saved !== 'false';
    } catch {
      return true;
    }
  });

  const [showScrub, setShowScrub] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('lmu_telemetry_steer_scrub_overlay');
      return saved === null ? true : saved !== 'false';
    } catch {
      return true;
    }
  });

  const handleToggleBalance = () => setShowBalance((prev) => !prev);
  const handleToggleScrub = () => setShowScrub((prev) => !prev);

  useEffect(() => {
    try {
      localStorage.setItem('lmu_telemetry_steer_balance_overlay', String(showBalance));
      localStorage.setItem('lmu_telemetry_steer_scrub_overlay', String(showScrub));
    } catch {
      // Ignore
    }
  }, [showBalance, showScrub]);

  // Detect handling balance limit events across the full lap
  const events = useMemo(() => {
    if (!points || points.length === 0) return [];
    return detectHandlingBalanceEvents(points, cornerSegments, undefined, pointComparisons);
  }, [points, cornerSegments, pointComparisons]);

  // Project events into SVG coordinate space [0, 1000] for current viewport zoom
  const visibleBands = useMemo(() => {
    if ((!showBalance && !showScrub) || events.length === 0 || viewStart === undefined || viewEnd === undefined || !cumDists) {
      return [];
    }
    const allBands = computeVisibleHandlingBands(events, viewStart, viewEnd, cumDists);
    return allBands.filter((b) => {
      if (b.isTireScrub) return showScrub || showBalance;
      return showBalance;
    });
  }, [events, showBalance, showScrub, viewStart, viewEnd, cumDists]);

  const chartSvg = useMemo(() => (
    <svg viewBox="0 10 1000 80" preserveAspectRatio="none" className="w-full h-full">
      {/* Handling balance limit shaded regions (Understeer / Tire Scrub / Oversteer) */}
      {visibleBands.map((band) => {
        const isUS = band.type === 'understeer';
        const isScrub = showScrub && band.isTireScrub;
        const fill = !isUS ? 'rgba(245, 158, 11, 0.22)' : isScrub ? 'rgba(244, 63, 94, 0.24)' : 'rgba(56, 189, 248, 0.18)';
        const stroke = !isUS ? TELEMETRY_COLORS.oversteer : isScrub ? TELEMETRY_COLORS.tireScrub : TELEMETRY_COLORS.understeer;
        const strokeOpacity = isScrub ? 0.85 : 0.65;

        return (
          <g key={band.id} className="pointer-events-none">
            <rect x={band.xStart} y={0} width={band.width} height={100} fill={fill} />
            <line x1={band.xStart} y1={0} x2={band.xStart} y2={100} stroke={stroke} strokeWidth={0.8} strokeOpacity={strokeOpacity} vectorEffect="non-scaling-stroke" />
            <line x1={band.xEnd} y1={0} x2={band.xEnd} y2={100} stroke={stroke} strokeWidth={0.8} strokeOpacity={strokeOpacity} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}

      {/* Zero centerline */}
      <line x1="0" y1="50" x2="1000" y2="50" stroke={TELEMETRY_COLORS.steer} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />

      <g transform={`translate(0 50) scale(1 ${100 / range}) translate(0 -50)`}>
      {baselineSteerPath && (
        <path d={baselineSteerPath} fill="none" stroke={TELEMETRY_COLORS.baseline} strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity="0.85" />
      )}
      {steerPath && (
        <path d={steerPath} fill="none" stroke={TELEMETRY_COLORS.steer} strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      )}
      </g>
    </svg>
  ), [steerPath, baselineSteerPath, showScrub, visibleBands, range]);

  const steerPercent = getSteerPercent(currentPoint?.steerYaw);
  const baseSteerPercent = getSteerPercent(currentComparison?.baseline.steerYaw);

  // Active handling balance state under the cursor
  const cursorBalance = useMemo(() => {
    if ((!showBalance && !showScrub) || !currentPoint) return null;
    const balance = currentPoint.understeerDeg;
    if (balance === undefined) return null;

    const activeEvent = events.find(
      (e) => currentPoint.timeSec !== undefined && currentPoint.timeSec >= e.startTimeSec && currentPoint.timeSec <= e.endTimeSec
    );

    if (activeEvent) {
      if (showScrub && activeEvent.isTireScrub) {
        return { label: `SCRUB (+${balance.toFixed(1)}°)`, color: 'text-lmu-loss' };
      }
      if (showBalance) {
        if (activeEvent.type === 'understeer') {
          return { label: `US (+${balance.toFixed(1)}°)`, color: 'text-lmu-info-soft' };
        }
        return { label: `OS (${balance.toFixed(1)}°)`, color: 'text-lmu-warn-soft' };
      }
      return null;
    }

    return null;
  }, [showBalance, showScrub, currentPoint, events]);

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-lmu-indigo-deep/20">
      {/* Top Left Channel Title & Live Telemetry Values */}
      <div className="absolute top-1 left-3 h-5 z-20 flex items-center gap-2 pointer-events-none">
        <span className="text-lmu-indigo font-black text-[10px] tracking-wider flex items-center gap-1">
          <Compass className="w-3 h-3" />
          STEERING
        </span>

        {cursorBalance && (
          <span className={`text-[10px] font-mono font-bold px-1.5 py-px rounded bg-lmu-card/90 border border-white/10 ${cursorBalance.color}`}>
            {cursorBalance.label}
          </span>
        )}
      </div>

      <TelemetrySteerOverlayToggles
        scaleMode={scaleMode}
        fittedRange={fittedRange}
        onScaleChange={setScaleMode}
        showBalance={showBalance}
        showScrub={showScrub}
        onToggleBalance={handleToggleBalance}
        onToggleScrub={handleToggleScrub}
      />

      <TelemetryStaticTrace
        chart={chartSvg}
        gridLines={gridLines}
        gridClassName="absolute inset-0 pointer-events-none opacity-20"
      />

      {/* Understeer / Oversteer / Tire Scrub Top Badges */}
      {(showBalance || showScrub) && (
        <div className="absolute inset-x-0 top-8 h-8 pointer-events-none z-10 overflow-hidden">
          {visibleBands.map((band, bandIndex) => {
            const isUS = band.type === 'understeer';
            const isScrub = showScrub && band.isTireScrub;
            const leftPct = Math.min(97, Math.max(0, band.xStart / 10));
            const badgeLabel = !isUS ? band.label : isScrub ? band.label : `US ${band.phase}`;
            const badgeClass = !isUS
              ? 'text-lmu-warn-soft bg-lmu-warn-deep/90 border-lmu-warn/60'
              : isScrub
                ? 'text-lmu-loss-soft bg-lmu-loss-deep/90 border-lmu-loss/70'
                : 'text-lmu-info-soft bg-lmu-info-deep/90 border-lmu-info/60';
            const titleType = !isUS ? 'Suspected oversteer' : isScrub ? 'Suspected tire scrub' : 'Suspected understeer';
            const timeCost = band.timeLossSec === null ? 'Time cost unconfirmed' : `+${band.timeLossSec.toFixed(2)} s lost during event vs baseline; other causes may contribute`;

            return (
              <div
                key={band.id}
                className={`absolute px-1 py-px text-[10px] font-mono font-black tracking-wider whitespace-nowrap border-b border-r rounded-br pointer-events-auto ${badgeClass}`}
                style={{ left: `${leftPct}%`, top: `${(bandIndex % 2) * 16}px` }}
                title={`${titleType} (${band.phase}). ${band.evidence}. ${timeCost}. ${band.advice}`}
              >
                {badgeLabel}{band.timeLossSec !== null && ` +${band.timeLossSec.toFixed(2)}s`}
              </div>
            );
          })}
        </div>
      )}

      {/* Cursor Value Callout */}
      {isCursorInView && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 top-9 ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-lmu-badge border border-lmu-indigo/80 font-mono font-bold text-[11px] text-lmu-indigo-soft shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {steerPercent > 0 ? `+${steerPercent.toFixed(0)}%` : `${steerPercent.toFixed(0)}%`}
          </span>
          {currentComparison && (
            <span className="px-1.5 py-0.5 rounded-md bg-lmu-badge border border-lmu-warn-strong/80 font-mono font-bold text-[10px] text-lmu-warn-soft shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {baseSteerPercent.toFixed(0)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
});
