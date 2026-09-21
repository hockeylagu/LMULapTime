import React from 'react';
import { RotateCw, ArrowDownRight, CircleDot, ArrowUpRight } from 'lucide-react';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis.js';
import {
  speedDeltaClass,
  timeDeltaClass,
  formatSpeedDelta,
  formatTimeDelta,
  formatBrakingDelta,
  brakingDeltaClass,
  throttleDeltaClass,
} from './CornerTableFormatters.js';

export interface CornerTechniqueDeckProps {
  corner: CornerSegmentComparison;
  isCompareMode?: boolean;
  className?: string;
}

function rotationQuality(pct: number | null): { text: string; color: string; badgeBg: string } {
  if (pct === null) return { text: 'N/A', color: 'text-slate-400', badgeBg: 'bg-slate-800' };
  if (pct >= 80) return { text: 'Optimal (Rotated)', color: 'text-emerald-400', badgeBg: 'bg-emerald-500/20' };
  if (pct >= 60) return { text: 'Moderate', color: 'text-amber-400', badgeBg: 'bg-amber-500/20' };
  return { text: 'Early Gas (Under-Rotated)', color: 'text-rose-400', badgeBg: 'bg-rose-500/20' };
}

export const CornerTechniqueDeck: React.FC<CornerTechniqueDeckProps> = ({
  corner,
  isCompareMode = false,
  className = '',
}) => {
  const rotInfo = rotationQuality(corner.primaryRotationAtThrottlePct ?? null);

  return (
    <div className={`flex flex-col gap-2 p-2 pt-0 text-[11px] font-mono ${className}`}>
      {/* 3-Column Phase-Based Telemetry Strip: Entry → Apex → Exit */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Phase 1: Entry & Braking */}
        <div className="flex flex-col gap-1.5 bg-[#050810] p-2 rounded-lg border border-lmu-border/40">
          <div className="flex items-center gap-1 text-[10px] font-bold text-cyan-400 uppercase tracking-wider border-b border-slate-800/80 pb-1 w-full">
            <ArrowDownRight className="w-3.5 h-3.5" /> Entry Phase
          </div>
          <div className="flex items-center justify-between text-xs font-bold text-white">
            <span className="text-lmu-muted text-[9px] uppercase font-normal">Speed</span>
            <div className="flex items-center">
              <span>{corner.primaryEntrySpeedKmh} <span className="text-[9px] font-normal text-slate-400">km/h</span></span>
              {isCompareMode && (
                <span className={`ml-1 text-[10px] ${speedDeltaClass(corner.entrySpeedDeltaKmh)}`}>
                  {formatSpeedDelta(corner.entrySpeedDeltaKmh)}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-0.5 text-[10px]">
            <div className="flex flex-col">
              <span className="text-lmu-muted text-[9px] uppercase">{isCompareMode ? 'Brake Δ' : 'Braking'}</span>
              <span className={isCompareMode ? brakingDeltaClass(corner.brakingPointDeltaM) : 'text-white font-bold'}>
                {isCompareMode
                  ? formatBrakingDelta(corner.brakingPointDeltaM)
                  : corner.primaryBrakingDistM !== null
                  ? `${corner.minDistM - corner.primaryBrakingDistM}m`
                  : '--'}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-lmu-muted text-[9px] uppercase">Turn-In</span>
              <span className="text-white font-bold">
                {corner.primaryTurnInDistM !== null && corner.primaryTurnInDistM !== undefined
                  ? `${Math.max(0, corner.minDistM - corner.primaryTurnInDistM)}m to apex`
                  : '--'}
              </span>
            </div>

            <div className="flex flex-col col-span-2">
              <span className="text-lmu-muted text-[9px] uppercase">Trail Brake</span>
              <span className="text-white font-bold">
                {corner.trailBrakeDistM ? `${corner.trailBrakeDistM}m` : 'None (Straight)'}
                {corner.trailBrakeDurationSec !== undefined && (
                  <span className="text-[9px] font-normal text-slate-400 ml-1">({corner.trailBrakeDurationSec}s bleed)</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Phase 2: Apex & Rotation */}
        <div className="flex flex-col gap-1.5 bg-[#050810] p-2 rounded-lg border border-lmu-border/40">
          <div className="flex items-center gap-1 text-[10px] font-bold text-rose-400 uppercase tracking-wider border-b border-slate-800/80 pb-1 w-full">
            <CircleDot className="w-3.5 h-3.5" /> Apex Phase
          </div>
          <div className="flex items-center justify-between text-xs font-bold text-white">
            <span className="text-lmu-muted text-[9px] uppercase font-normal">Min Speed</span>
            <div className="flex items-center">
              <span>{corner.primaryMinSpeedKmh} <span className="text-[9px] font-normal text-slate-400">km/h</span></span>
              {isCompareMode && (
                <span className={`ml-1 text-[10px] ${speedDeltaClass(corner.minSpeedDeltaKmh)}`}>
                  {formatSpeedDelta(corner.minSpeedDeltaKmh)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1 pt-0.5 text-[10px]">
            {corner.primaryRotationAtThrottlePct !== null && corner.primaryRotationAtThrottlePct !== undefined ? (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-[9px]">
                  <span title="Rotation Complete When Throttle Applied" className="text-slate-300 flex items-center gap-0.5 whitespace-nowrap">
                    <RotateCw className="w-2.5 h-2.5 text-sky-400 shrink-0" /> Rotation @ Throttle
                  </span>
                  <span className={`font-bold ${rotInfo.color}`}>{corner.primaryRotationAtThrottlePct}%</span>
                </div>
                <div className="relative w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="absolute top-0 bottom-0 left-[80%] w-[1.5px] bg-white/70 z-10" />
                  <div
                    className={`h-full ${corner.primaryRotationAtThrottlePct >= 80 ? 'bg-emerald-400' : corner.primaryRotationAtThrottlePct >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`}
                    style={{ width: `${Math.min(100, Math.max(5, corner.primaryRotationAtThrottlePct))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[8px] text-slate-400">
                  <span className={rotInfo.color}>{rotInfo.text}</span>
                  <span className="text-emerald-400 font-bold">80% Optimal</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                <span className="text-lmu-muted text-[9px] uppercase">Apex Location</span>
                <span className="text-white font-bold">{corner.apexRatioPct !== undefined ? `${corner.apexRatioPct}%` : '--'}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-0.5 border-t border-slate-800/60 text-[9px]">
              <span className="text-lmu-muted uppercase">Peak Rotation:</span>
              <span className="text-white font-bold">
                {corner.primaryPeakYawRateDeg ? `${corner.primaryPeakYawRateDeg}°/s` : '--'}
              </span>
            </div>
          </div>
        </div>

        {/* Phase 3: Exit & Throttle */}
        <div className="flex flex-col gap-1.5 bg-[#050810] p-2 rounded-lg border border-lmu-border/40">
          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wider border-b border-slate-800/80 pb-1 w-full">
            <ArrowUpRight className="w-3.5 h-3.5" /> Exit Phase
          </div>
          <div className="flex items-center justify-between text-xs font-bold text-white">
            <span className="text-lmu-muted text-[9px] uppercase font-normal">Exit Speed</span>
            <div className="flex items-center">
              <span>{corner.primaryExitSpeedKmh} <span className="text-[9px] font-normal text-slate-400">km/h</span></span>
              {isCompareMode && (
                <span className={`ml-1 text-[10px] ${speedDeltaClass(corner.exitSpeedDeltaKmh)}`}>
                  {formatSpeedDelta(corner.exitSpeedDeltaKmh)}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-0.5 text-[10px]">
            <div className="flex flex-col">
              <span className="text-lmu-muted text-[9px] uppercase">{isCompareMode ? 'Thr Δ' : 'Throttle'}</span>
              <span className={isCompareMode ? throttleDeltaClass(corner.throttleOnDeltaM) : 'text-white font-bold'}>
                {isCompareMode
                  ? formatBrakingDelta(corner.throttleOnDeltaM)
                  : corner.primaryThrottleOnDistM !== null
                  ? `${corner.primaryThrottleOnDistM - corner.minDistM}m`
                  : '--'}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-lmu-muted text-[9px] uppercase">{isCompareMode ? 'Δ Time' : 'Duration'}</span>
              <span className={isCompareMode ? timeDeltaClass(corner.timeDeltaSec) : 'text-white font-bold'}>
                {isCompareMode ? formatTimeDelta(corner.timeDeltaSec) : `${corner.primaryTimeSec.toFixed(3)}s`}
              </span>
            </div>

            <div className="flex flex-col col-span-2">
              <span className="text-lmu-muted text-[9px] uppercase">Track Usage</span>
              <span className="text-white font-bold">
                {corner.primaryTrackUsage?.totalSweepM !== undefined
                  ? `${corner.primaryTrackUsage.totalSweepM}m sweep`
                  : corner.primaryTrackUsage?.apexMarginM !== undefined
                  ? `Apex: ${corner.primaryTrackUsage.apexMarginM.toFixed(1)}m`
                  : 'Standard'}
                {corner.primaryTrackUsage?.exitWidthM !== undefined && (
                  <span className="text-[9px] font-normal text-slate-400 ml-1">({corner.primaryTrackUsage.exitWidthM.toFixed(1)}m exit)</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
