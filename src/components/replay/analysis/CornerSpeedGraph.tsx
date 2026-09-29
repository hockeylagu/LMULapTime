import React, { useMemo, useState, useCallback } from 'react';
import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { findIndexAtDistance } from '../../../utils/lapAlignment.js';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis/index.js';
import {
  detectHandlingBalanceEvents,
} from '../../../utils/handlingBalanceDetection.js';
import { buildHandlingBands, computeCornerSpeedProfile } from './cornerSpeedProfile.js';
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

  const bands = useMemo(() => buildHandlingBands(handlingEvents, corner), [handlingEvents, corner]);

  const { primaryPath, baselinePath, minPct, scrubPct, currentSpeed, currentHandling } = useMemo(
    () => computeCornerSpeedProfile({ corner, primaryPoints, primaryDists, baselinePoints, baselineDists, currentIndex, currentDistM, handlingEvents }),
    [corner, primaryPoints, primaryDists, baselinePoints, baselineDists, currentDistM, currentIndex, handlingEvents]
  );

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
        <div className="flex items-center justify-between text-[10px] font-mono px-2.5 py-1.5 border-b border-lmu-border/80 bg-lmu-surface">
          <span className="text-xs font-semibold text-lmu-text-soft">Speed & Handling Profile</span>
          <div className="flex items-center gap-1">
            {[
              { label: 'US', active: showUndersteer && hasUS, onClick: () => setShowUndersteer(v => !v), color: 'bg-lmu-info-strong/20 border-lmu-info-strong/50 text-lmu-info-soft' },
              { label: 'Scrub', active: showScrub && hasScrub, onClick: () => setShowScrub(v => !v), color: 'bg-lmu-loss-strong/20 border-lmu-loss-strong/50 text-lmu-loss-soft' },
              { label: 'OS', active: showOversteer && hasOS, onClick: () => setShowOversteer(v => !v), color: 'bg-lmu-warn-strong/20 border-lmu-warn-strong/50 text-lmu-warn-soft' },
            ].map(btn => (
              <button
                key={btn.label}
                type="button"
                onClick={btn.onClick}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                  btn.active ? btn.color : 'bg-lmu-card/60 border-lmu-border text-lmu-faint'
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
          <div style={{ left: `${minPct}%` }} className="absolute top-0 bottom-0 w-[1.5px] bg-lmu-loss/80 pointer-events-none -translate-x-1/2">
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 px-1 rounded bg-lmu-loss-deep/80 border border-lmu-loss-strong/40 text-lmu-loss-soft text-[10px] font-mono font-bold whitespace-nowrap">
              Apex: {corner.primaryMinSpeedKmh}
            </span>
          </div>
        )}

        {compact && (
          <>
            <div className="absolute top-0.5 left-1.5 px-1 rounded bg-lmu-aqua-strong/20 text-lmu-aqua-soft text-[10px] font-mono font-bold whitespace-nowrap pointer-events-none">ENTRY {corner.primaryEntrySpeedKmh}</div>
            <div style={{ left: `${minPct}%` }} className="absolute top-0 bottom-0 w-[1.5px] bg-lmu-loss/70 pointer-events-none -translate-x-1/2">
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 px-1 rounded bg-lmu-loss-strong/20 text-lmu-loss-soft text-[10px] font-mono font-bold whitespace-nowrap">MIN {corner.primaryMinSpeedKmh}</span>
            </div>
            <div className="absolute top-0.5 right-1.5 px-1 rounded bg-lmu-gain-strong/20 text-lmu-gain-soft text-[10px] font-mono font-bold whitespace-nowrap pointer-events-none">EXIT {corner.primaryExitSpeedKmh}</div>
          </>
        )}

        {/* Handling Band Pill Labels at top */}
        {!compact && visibleBands.map((band) => (
          <div
            key={`lbl-${band.id}`}
            style={{ left: `${(band.xStart + band.width / 2) / 10}%` }}
            className="absolute top-1 -translate-x-1/2 pointer-events-none z-10"
          >
            <span className={`px-1 py-0.2 rounded text-[10px] font-mono font-bold border whitespace-nowrap shadow-sm ${
              band.isTireScrub
                ? 'bg-lmu-loss-deep/90 border-lmu-loss-strong/60 text-lmu-loss-soft'
                : band.type === 'understeer'
                ? 'bg-lmu-info-deep/90 border-lmu-info-strong/60 text-lmu-info-soft'
                : 'bg-lmu-warn-deep/90 border-lmu-warn-strong/60 text-lmu-warn-soft'
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
                <span className="px-1.5 py-0.5 rounded bg-lmu-badge border border-white/80 text-white text-[10px] font-mono font-bold shadow-[0_2px_10px_rgba(0,0,0,0.85)] whitespace-nowrap">
                  {currentSpeed} km/h
                </span>
                {currentHandling && (
                  <span className={`px-1 py-0.2 rounded border text-[10px] font-mono font-bold shadow whitespace-nowrap ${currentHandling.color}`}>
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
