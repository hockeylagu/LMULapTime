import React, { useMemo, useState, useEffect } from 'react';
import { Compass } from 'lucide-react';
import { ReplayTrajectoryPoint, ReplayTelemetryPoint } from '../../../../server/core/types';
import { PointComparison } from '../../../utils/replayComparison.js';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis.js';
import { getSteerPercent } from '../../../utils/formatters.js';
import {
  detectHandlingBalanceEvents,
  computeVisibleHandlingBands,
} from '../../../utils/handlingBalanceDetection.js';

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
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Handling balance limit shaded regions (Understeer / Tire Scrub / Oversteer) */}
      {visibleBands.map((band) => {
        const isUS = band.type === 'understeer';
        const isScrub = showScrub && band.isTireScrub;
        const fill = !isUS ? 'rgba(245, 158, 11, 0.22)' : isScrub ? 'rgba(244, 63, 94, 0.24)' : 'rgba(56, 189, 248, 0.18)';
        const stroke = !isUS ? '#f59e0b' : isScrub ? '#f43f5e' : '#38bdf8';
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
      <line x1="0" y1="50" x2="1000" y2="50" stroke="#818cf8" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />

      {baselineSteerPath && (
        <path d={baselineSteerPath} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity="0.85" />
      )}
      {steerPath && (
        <path d={steerPath} fill="none" stroke="#818cf8" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  ), [steerPath, baselineSteerPath, showScrub, visibleBands]);

  const steerPercent = getSteerPercent(currentPoint?.steerYaw);
  const baseSteerPercent = getSteerPercent(currentComparison?.baseline.steerYaw);
  const steerDir = steerPercent < -1 ? 'LEFT' : steerPercent > 1 ? 'RIGHT' : 'CENTER';

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
        return { label: `SCRUB (+${balance.toFixed(1)}°)`, color: 'text-rose-400' };
      }
      if (showBalance) {
        if (activeEvent.type === 'understeer') {
          return { label: `US (+${balance.toFixed(1)}°)`, color: 'text-sky-300' };
        }
        return { label: `OS (${balance.toFixed(1)}°)`, color: 'text-amber-300' };
      }
      return null;
    }

    if (showBalance) {
      if (balance >= 2.0) return { label: `US (+${balance.toFixed(1)}°)`, color: 'text-sky-300' };
      if (balance <= -1.0) return { label: `OS (${balance.toFixed(1)}°)`, color: 'text-amber-300' };
    }
    return null;
  }, [showBalance, showScrub, currentPoint, events]);

  return (
    <div className="relative flex-1 basis-0 min-h-[64px] border-b border-lmu-border/40 group bg-[#0e0c1a]/50">
      {/* Top Left Channel Title & Live Telemetry Values */}
      <div className="absolute top-2 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="p-1 rounded bg-indigo-500/20 text-indigo-400 font-black text-[10px] tracking-wider flex items-center gap-1">
          <Compass className="w-3 h-3" />
          STEERING
        </span>
        <span className="text-xs font-mono font-bold text-indigo-300">
          {Math.abs(steerPercent).toFixed(1)}% {steerDir}
        </span>
        {currentComparison && (
          <span className="text-[11px] font-mono text-amber-400/90 ml-1 pl-2 border-l border-white/10">
            Base: {Math.abs(baseSteerPercent).toFixed(1)}%
          </span>
        )}
        {cursorBalance && (
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-900/90 border border-white/10 ${cursorBalance.color}`}>
            {cursorBalance.label}
          </span>
        )}
      </div>

      {/* Merged Legend & Selection Toggle */}
      <div className="absolute top-2 right-3 z-20 flex items-center rounded-lg bg-slate-900/90 border border-slate-700/80 p-0.5 shadow-[0_0_10px_rgba(0,0,0,0.5)] pointer-events-auto">
        <button
          type="button"
          onClick={handleToggleBalance}
          title={showBalance ? 'Hide Understeer / Oversteer Overlay' : 'Show Understeer / Oversteer Overlay'}
          className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider transition-all flex items-center gap-1.5 ${
            showBalance
              ? 'bg-slate-800 text-slate-200 border border-sky-500/40 shadow-[0_0_8px_rgba(56,189,248,0.2)]'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
          }`}
        >
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full transition-all ${showBalance ? 'bg-sky-400 shadow-[0_0_4px_#38bdf8]' : 'bg-slate-600'}`} />
            <span className={showBalance ? 'text-sky-300 font-black' : 'text-slate-500'}>US</span>
          </span>
          <span className="opacity-30">/</span>
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full transition-all ${showBalance ? 'bg-amber-400 shadow-[0_0_4px_#f59e0b]' : 'bg-slate-600'}`} />
            <span className={showBalance ? 'text-amber-300 font-black' : 'text-slate-500'}>OS</span>
          </span>
        </button>
        <button
          type="button"
          aria-label="Tire Push Overlay"
          onClick={handleToggleScrub}
          title={showScrub ? 'Remove Tire Scrub Zones' : 'Add Tire Scrub Zones'}
          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider transition-all flex items-center gap-1 ml-0.5 ${
            showScrub
              ? 'bg-rose-950/80 text-rose-300 border border-rose-500/60 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
              : 'text-slate-500 hover:text-rose-300 hover:bg-slate-800/40'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full transition-all ${showScrub ? 'bg-rose-400 shadow-[0_0_4px_#f43f5e]' : 'bg-slate-600'}`} />
          <span className={showScrub ? 'text-rose-300 font-black' : 'text-slate-500'}>SCRUB</span>
        </button>
      </div>

      {/* Grid Lines */}
      <div className="absolute inset-0 flex flex-col justify-between py-1.5 px-3 pointer-events-none opacity-20">
        <div className="border-b border-indigo-400/30 w-full text-[8px] text-indigo-400 font-mono">-100% L</div>
        <div className="border-b border-indigo-400/50 w-full text-[8px] text-indigo-300 font-mono">0% Center</div>
        <div className="border-b border-indigo-400/30 w-full text-[8px] text-indigo-400 font-mono">+100% R</div>
      </div>

      {/* Understeer / Oversteer / Tire Scrub Top Badges */}
      {(showBalance || showScrub) && (
        <div className="absolute inset-x-0 top-0 h-4 pointer-events-none z-10 overflow-hidden">
          {visibleBands.map((band) => {
            const isUS = band.type === 'understeer';
            const isScrub = showScrub && band.isTireScrub;
            const leftPct = Math.min(97, Math.max(0, band.xStart / 10));
            const badgeLabel = !isUS ? band.label : isScrub ? band.label : `US ${band.phase}`;
            const badgeClass = !isUS
              ? 'text-amber-300 bg-amber-950/90 border-amber-400/60 shadow-[0_1px_4px_rgba(245,158,11,0.25)]'
              : isScrub
                ? 'text-rose-300 bg-rose-950/90 border-rose-400/70 shadow-[0_1px_4px_rgba(244,63,94,0.3)]'
                : 'text-sky-300 bg-sky-950/90 border-sky-400/60 shadow-[0_1px_4px_rgba(56,189,248,0.25)]';
            const titleType = !isUS ? 'Oversteer' : isScrub ? `Tire Scrub (${band.scrubSeverityPct}% severity)` : 'Understeer';

            return (
              <div
                key={band.id}
                className={`absolute top-0 px-1 py-0.2 text-[8px] sm:text-[9px] font-mono font-black tracking-wider whitespace-nowrap border-b border-r rounded-br ${badgeClass}`}
                style={{ left: `${leftPct}%` }}
                title={`${titleType} (${band.phase}): Peak ${band.peakDeg}°`}
              >
                {badgeLabel}
              </div>
            );
          })}
        </div>
      )}

      {chartSvg}

      {/* Cursor Value Callout */}
      {isCursorInView && (
        <div
          className={`absolute pointer-events-none z-50 flex items-center gap-1 ${
            cursorPct < 15 ? 'bottom-2' : 'top-2'
          } ${cursorPct > 85 ? '-translate-x-full -ml-2.5' : 'ml-2.5'}`}
          style={{ left: `${cursorPct}%` }}
        >
          <span className="px-2 py-0.5 rounded-md bg-[#070c18] border border-indigo-400/80 font-mono font-bold text-[11px] text-indigo-200 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
            {steerPercent > 0 ? `+${steerPercent.toFixed(0)}%` : `${steerPercent.toFixed(0)}%`}
          </span>
          {currentComparison && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#070c18] border border-amber-500/80 font-mono font-bold text-[10px] text-amber-300 shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
              B: {baseSteerPercent.toFixed(0)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
});
