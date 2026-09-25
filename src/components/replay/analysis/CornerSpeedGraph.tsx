import React, { useMemo, useState, useCallback } from 'react';
import { ReplayTrajectoryPoint } from '../../../../server/core/types';
import { interpolatePointAtDistance, findIndexAtDistance } from '../../../utils/replayComparison.js';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis.js';
import {
  detectHandlingBalanceEvents,
} from '../../../utils/handlingBalanceDetection.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';

export interface CornerSpeedGraphProps {
  corner: CornerSegmentComparison;
  primaryPoints: ReplayTrajectoryPoint[];
  primaryDists: number[];
  baselinePoints?: ReplayTrajectoryPoint[];
  baselineDists?: number[];
  currentIndex?: number;
  currentDistM?: number;
  onSelectIndex?: (index: number) => void;
  compact?: boolean;
  className?: string;
}

export interface CornerHandlingBand {
  id: string;
  type: 'understeer' | 'oversteer';
  isTireScrub: boolean;
  label: string;
  xStart: number;
  xEnd: number;
  width: number;
  peakDeg: number;
}

export const CornerSpeedGraph: React.FC<CornerSpeedGraphProps> = ({
  corner,
  primaryPoints,
  primaryDists,
  baselinePoints,
  baselineDists,
  currentIndex,
  currentDistM,
  onSelectIndex,
  compact = false,
  className = '',
}) => {
  const [showUndersteer, setShowUndersteer] = useState(true);
  const [showOversteer, setShowOversteer] = useState(true);
  const [showScrub, setShowScrub] = useState(true);

  const span = Math.max(1, corner.exitDistM - corner.entryDistM);

  // Detect handling balance and tire scrub events across this corner
  const handlingEvents = useMemo(() => {
    return detectHandlingBalanceEvents(primaryPoints, [corner]);
  }, [primaryPoints, corner]);

  // Project events into SVG coordinates [0, 1000]
  const bands = useMemo<CornerHandlingBand[]>(() => {
    const result: CornerHandlingBand[] = [];
    for (const ev of handlingEvents) {
      if (ev.endDistM < corner.entryDistM || ev.startDistM > corner.exitDistM) continue;

      const clampedStartM = Math.max(corner.entryDistM, ev.startDistM);
      const clampedEndM = Math.min(corner.exitDistM, ev.endDistM);

      const xStart = ((clampedStartM - corner.entryDistM) / span) * 1000;
      const xEnd = ((clampedEndM - corner.entryDistM) / span) * 1000;
      const width = Math.max(4, xEnd - xStart);

      result.push({
        id: ev.id,
        type: ev.type,
        isTireScrub: Boolean(ev.isTireScrub),
        label: ev.isTireScrub ? 'SCRUB' : ev.type === 'understeer' ? 'US' : 'OS',
        xStart: Number(xStart.toFixed(1)),
        xEnd: Number(xEnd.toFixed(1)),
        width: Number(width.toFixed(1)),
        peakDeg: ev.peakDeg,
      });
    }
    return result;
  }, [handlingEvents, corner.entryDistM, corner.exitDistM, span]);

  // Speed paths & scrub point calculations
  const { primaryPath, baselinePath, minPct, scrubPct, currentSpeed, currentHandling } = useMemo(() => {
    const primarySpeeds: { dist: number; speed: number }[] = [];
    const baselineSpeeds: { dist: number; speed: number }[] = [];

    let minSpd = corner.primaryMinSpeedKmh;
    let maxSpd = Math.max(corner.primaryEntrySpeedKmh, corner.primaryExitSpeedKmh);

    if (baselinePoints && baselineDists && baselinePoints.length > 0) {
      if (corner.baselineMinSpeedKmh !== undefined) minSpd = Math.min(minSpd, corner.baselineMinSpeedKmh);
      if (corner.baselineEntrySpeedKmh !== undefined) maxSpd = Math.max(maxSpd, corner.baselineEntrySpeedKmh);
      if (corner.baselineExitSpeedKmh !== undefined) maxSpd = Math.max(maxSpd, corner.baselineExitSpeedKmh);
    }

    const spdPadding = Math.max(10, (maxSpd - minSpd) * 0.15);
    const chartMin = Math.max(0, minSpd - spdPadding);
    const chartMax = maxSpd + spdPadding;
    const spdRange = Math.max(1, chartMax - chartMin);

    for (let i = 0; i < primaryPoints.length; i++) {
      const d = primaryDists[i];
      if (d >= corner.entryDistM && d <= corner.exitDistM) {
        primarySpeeds.push({ dist: d, speed: primaryPoints[i].speedKmh ?? 0 });
      }
    }

    if (baselinePoints && baselineDists && baselinePoints.length > 0) {
      for (let i = 0; i < baselinePoints.length; i++) {
        const d = baselineDists[i];
        if (d >= corner.entryDistM && d <= corner.exitDistM) {
          baselineSpeeds.push({ dist: d, speed: baselinePoints[i].speedKmh ?? 0 });
        }
      }
    }

    const toPath = (speeds: { dist: number; speed: number }[]) => {
      if (speeds.length < 2) return '';
      return speeds.map((pt, i) => {
        const x = Number((((pt.dist - corner.entryDistM) / span) * 1000).toFixed(1));
        const y = Number((100 - ((pt.speed - chartMin) / spdRange) * 100).toFixed(1));
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ');
    };

    let sPct: number | null = null;
    let curSpd: number | null = null;
    let activeHandling: { label: string; color: string; deg: number } | null = null;

    if (currentDistM !== undefined && currentDistM >= corner.entryDistM && currentDistM <= corner.exitDistM) {
      sPct = Math.min(100, Math.max(0, ((currentDistM - corner.entryDistM) / span) * 100));
      const pt = currentIndex !== undefined ? primaryPoints[currentIndex] : undefined;
      curSpd = typeof pt?.speedKmh === 'number'
        ? Math.round(pt.speedKmh)
        : Math.round(interpolatePointAtDistance(primaryPoints, primaryDists, currentDistM).speedKmh);

      // Check if current position falls into any handling event
      const ev = handlingEvents.find(e => currentDistM >= e.startDistM && currentDistM <= e.endDistM);
      const balanceDeg = pt?.understeerDeg;
      if (ev) {
        const color = ev.isTireScrub ? 'text-rose-300 border-rose-500/60 bg-rose-950/90' : ev.type === 'understeer' ? 'text-sky-300 border-sky-500/60 bg-sky-950/90' : 'text-amber-300 border-amber-500/60 bg-amber-950/90';
        activeHandling = { label: ev.isTireScrub ? 'SCRUB' : ev.type === 'understeer' ? 'US' : 'OS', color, deg: ev.peakDeg };
      } else if (balanceDeg !== undefined) {
        if (balanceDeg >= 2.0) activeHandling = { label: 'US', color: 'text-sky-300 border-sky-500/60 bg-sky-950/90', deg: balanceDeg };
        else if (balanceDeg <= -1.0) activeHandling = { label: 'OS', color: 'text-amber-300 border-amber-500/60 bg-amber-950/90', deg: balanceDeg };
      }
    }

    return {
      primaryPath: toPath(primarySpeeds),
      baselinePath: baselineSpeeds.length > 0 ? toPath(baselineSpeeds) : '',
      minPct: Math.min(97, Math.max(3, ((corner.minDistM - corner.entryDistM) / span) * 100)),
      scrubPct: sPct,
      currentSpeed: curSpd,
      currentHandling: activeHandling,
    };
  }, [corner, primaryPoints, primaryDists, baselinePoints, baselineDists, span, currentDistM, currentIndex, handlingEvents]);

  const handleScrub = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSelectIndex || primaryDists.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetDistM = corner.entryDistM + ratio * span;
    onSelectIndex(findIndexAtDistance(primaryDists, targetDistM));
  }, [onSelectIndex, primaryDists, corner.entryDistM, span]);

  // Filter bands based on toggles
  const visibleBands = useMemo(() => {
    return bands.filter(b => {
      if (b.isTireScrub) return showScrub;
      if (b.type === 'understeer') return showUndersteer;
      return showOversteer;
    });
  }, [bands, showScrub, showUndersteer, showOversteer]);

  const hasUS = bands.some(b => b.type === 'understeer' && !b.isTireScrub);
  const hasScrub = bands.some(b => b.isTireScrub);
  const hasOS = bands.some(b => b.type === 'oversteer');

  return (
    <div
      data-chart="speed-profile"
      className={`relative flex flex-col bg-lmu-deep rounded-lg border border-lmu-border/60 overflow-hidden justify-between ${className}`}
    >
      {/* Legend & Handling Overlay Toggles */}
      {!compact && (
        <div className="flex items-center justify-between text-[10px] font-mono px-2.5 py-1.5 border-b border-slate-800/80 bg-lmu-surface">
          <span className="text-xs font-semibold text-slate-300">Speed & Handling Profile</span>
          <div className="flex items-center gap-1">
            {[
              { label: 'US', active: showUndersteer && hasUS, onClick: () => setShowUndersteer(v => !v), color: 'bg-sky-500/20 border-sky-500/50 text-sky-300' },
              { label: 'Scrub', active: showScrub && hasScrub, onClick: () => setShowScrub(v => !v), color: 'bg-rose-500/20 border-rose-500/50 text-rose-300' },
              { label: 'OS', active: showOversteer && hasOS, onClick: () => setShowOversteer(v => !v), color: 'bg-amber-500/20 border-amber-500/50 text-amber-300' },
            ].map(btn => (
              <button
                key={btn.label}
                type="button"
                onClick={btn.onClick}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors cursor-pointer ${
                  btn.active ? btn.color : 'bg-slate-900/60 border-slate-800 text-slate-500'
                }`}
                title={`Toggle ${btn.label} overlay`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SVG Canvas with Shaded Handling Bands + Speed Traces */}
      <div
        className={`relative ${compact ? 'h-[58px]' : 'h-[90px]'} w-full bg-lmu-deep cursor-crosshair overflow-hidden`}
        onClick={handleScrub}
        onMouseMove={(e) => { if (e.buttons === 1) handleScrub(e); }}
        title="Click or drag to scrub replay at this corner"
      >
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-full">
          {/* Handling Balance Shaded Regions */}
          {visibleBands.map(band => {
            const fill = band.isTireScrub ? 'rgba(244, 63, 94, 0.22)' : band.type === 'understeer' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(245, 158, 11, 0.20)';
            const stroke = band.isTireScrub ? TELEMETRY_COLORS.tireScrub : band.type === 'understeer' ? TELEMETRY_COLORS.understeer : TELEMETRY_COLORS.oversteer;
            return (
              <g key={band.id} className="pointer-events-none">
                <rect x={band.xStart} y={0} width={band.width} height={100} fill={fill} />
                <line x1={band.xStart} y1={0} x2={band.xStart} y2={100} stroke={stroke} strokeWidth={0.8} strokeOpacity={0.7} vectorEffect="non-scaling-stroke" />
                <line x1={band.xEnd} y1={0} x2={band.xEnd} y2={100} stroke={stroke} strokeWidth={0.8} strokeOpacity={0.7} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}

          {/* Speed curves */}
          {baselinePath && <path d={baselinePath} fill="none" stroke={TELEMETRY_COLORS.baseline} strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" opacity="0.85" />}
          <path d={primaryPath} fill="none" stroke={TELEMETRY_COLORS.primary} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Apex minimum speed callout */}
        {!compact && (
          <div style={{ left: `${minPct}%` }} className="absolute top-0 bottom-0 w-[1.5px] bg-rose-400/80 pointer-events-none -translate-x-1/2">
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 px-1 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 text-[8px] font-mono font-bold whitespace-nowrap">
              Apex: {corner.primaryMinSpeedKmh}
            </span>
          </div>
        )}

        {compact && (
          <>
            <div className="absolute top-0.5 left-1.5 px-1 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono font-bold whitespace-nowrap pointer-events-none">ENTRY {corner.primaryEntrySpeedKmh}</div>
            <div style={{ left: `${minPct}%` }} className="absolute top-0 bottom-0 w-[1.5px] bg-rose-400/70 pointer-events-none -translate-x-1/2">
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 px-1 rounded bg-rose-500/20 text-rose-300 text-[9px] font-mono font-bold whitespace-nowrap">MIN {corner.primaryMinSpeedKmh}</span>
            </div>
            <div className="absolute top-0.5 right-1.5 px-1 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-mono font-bold whitespace-nowrap pointer-events-none">EXIT {corner.primaryExitSpeedKmh}</div>
          </>
        )}

        {/* Handling Band Pill Labels at top */}
        {!compact && visibleBands.map((band) => (
          <div
            key={`lbl-${band.id}`}
            style={{ left: `${(band.xStart + band.width / 2) / 10}%` }}
            className="absolute top-1 -translate-x-1/2 pointer-events-none z-10"
          >
            <span className={`px-1 py-0.2 rounded text-[8px] font-mono font-bold border whitespace-nowrap shadow-sm ${
              band.isTireScrub
                ? 'bg-rose-950/90 border-rose-500/60 text-rose-300'
                : band.type === 'understeer'
                ? 'bg-sky-950/90 border-sky-500/60 text-sky-300'
                : 'bg-amber-950/90 border-amber-500/60 text-amber-300'
            }`}>
              {band.label} {band.peakDeg > 0 ? `+${band.peakDeg}°` : `${band.peakDeg}°`}
            </span>
          </div>
        ))}

        {/* Synchronized Scrub Line + Live Speed & Handling Badge */}
        {scrubPct !== null && (
          <div style={{ left: `${scrubPct}%` }} className="absolute top-0 bottom-0 w-[1px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] pointer-events-none -translate-x-1/2 z-20">
            {currentSpeed !== null && (
              <div className="absolute top-1 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-none">
                <span className="px-1.5 py-0.5 rounded bg-lmu-badge border border-white/80 text-white text-[9px] font-mono font-bold shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
                  {currentSpeed} km/h
                </span>
                {currentHandling && (
                  <span className={`px-1 py-0.2 rounded border text-[8px] font-mono font-bold shadow whitespace-nowrap ${currentHandling.color}`}>
                    {currentHandling.label} {currentHandling.deg > 0 ? `+${currentHandling.deg.toFixed(1)}°` : `${currentHandling.deg.toFixed(1)}°`}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
