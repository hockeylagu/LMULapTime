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

export const CornerTechniqueDeck: React.FC<CornerTechniqueDeckProps> = ({
  corner,
  isCompareMode = false,
  className = '',
}) => {
  const trackUsage = corner.primaryTrackUsage;
  const hasLateralTrackUsage = trackUsage?.entryOffsetM !== undefined &&
    trackUsage.apexMarginM !== undefined &&
    trackUsage.exitWidthM !== undefined;

  return (
    <div className={`flex flex-col gap-2 p-2 pt-0 text-[11px] font-mono ${className}`}>
      {/* 3-Column Phase-Based Telemetry Strip: Entry → Apex → Exit */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* Phase 1: Entry & Braking */}
        <div className="flex flex-col gap-1.5 bg-[#050810] p-2 rounded-lg border border-lmu-border/40">
          <div className="flex items-center gap-1 text-[10px] font-bold text-cyan-400 uppercase tracking-wider border-b border-slate-800/80 pb-1 w-full">
            <ArrowDownRight className="w-3.5 h-3.5" /> Entry Phase
            {isCompareMode && corner.phaseTiming?.entry && (
              <span className={`ml-auto ${timeDeltaClass(corner.phaseTiming.entry.timeDeltaSec)}`}>
                {formatTimeDelta(corner.phaseTiming.entry.timeDeltaSec)}
              </span>
            )}
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
              <span className="text-lmu-muted text-[9px] uppercase">{isCompareMode ? 'Brake Δ' : 'Brake to Apex'}</span>
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
                {corner.trailBrakeDistM && corner.trailBrakeDistM > 0 ? `${corner.trailBrakeDistM}m` : 'None detected'}
                {corner.trailBrakeDurationSec !== undefined && corner.trailBrakeDurationSec > 0 && (
                  <span className="text-[9px] font-normal text-slate-400 ml-1">({corner.trailBrakeDurationSec}s bleed)</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Phase 2: Apex & Rotation */}
        <div className="flex flex-col gap-1.5 bg-[#050810] p-2 rounded-lg border border-lmu-border/40">
          <div className="flex items-center gap-1 text-[10px] font-bold text-rose-400 uppercase tracking-wider border-b border-slate-800/80 pb-1 w-full">
            <CircleDot className="w-3.5 h-3.5" /> Rotation Phase
            {isCompareMode && (
              <span className={`ml-auto ${timeDeltaClass(corner.phaseTiming?.rotation.timeDeltaSec ?? 0)}`}>
                {corner.phaseTiming ? formatTimeDelta(corner.phaseTiming.rotation.timeDeltaSec) : '--'}
              </span>
            )}
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
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center justify-between text-[9px]">
                  <span title="Heading progress at the first 15% throttle sample" className="text-slate-300 flex items-center gap-0.5 whitespace-nowrap">
                    <RotateCw className="w-2.5 h-2.5 text-sky-400 shrink-0" /> Heading @ 15% throttle
                  </span>
                </div>
                <span className="font-bold text-white">
                  {corner.primaryRotationAtThrottlePct}%
                  {isCompareMode && corner.rotationAtThrottleDeltaPct !== null && corner.rotationAtThrottleDeltaPct !== undefined && (
                    <span className="ml-1 text-slate-400">
                      ({corner.rotationAtThrottleDeltaPct > 0 ? '+' : ''}{corner.rotationAtThrottleDeltaPct}%)
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <div className="flex flex-col">
                <span className="text-lmu-muted text-[9px] uppercase">Apex Location</span>
                <span className="text-white font-bold">{corner.apexRatioPct !== undefined ? `${corner.apexRatioPct}%` : '--'}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-0.5 border-t border-slate-800/60 text-[9px]">
              <span className="text-lmu-muted uppercase">Yaw rate peak:</span>
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
            {isCompareMode && (
              <span className={`ml-auto ${timeDeltaClass(corner.phaseTiming?.exit.timeDeltaSec ?? 0)}`}>
                {corner.phaseTiming ? formatTimeDelta(corner.phaseTiming.exit.timeDeltaSec) : '--'}
              </span>
            )}
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
              <span className="text-lmu-muted text-[9px] uppercase">{isCompareMode ? 'Thr 15% Δ' : 'Throttle 15%'}</span>
              <span className={isCompareMode ? throttleDeltaClass(corner.initialThrottleDeltaM ?? null) : 'text-white font-bold'}>
                {isCompareMode
                  ? formatBrakingDelta(corner.initialThrottleDeltaM ?? null)
                  : corner.primaryInitialThrottleDistM != null
                  ? `${corner.primaryInitialThrottleDistM - corner.minDistM}m`
                  : '--'}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-lmu-muted text-[9px] uppercase">{isCompareMode ? 'Thr 90% Δ' : 'Full Throttle'}</span>
              <span className={isCompareMode ? throttleDeltaClass(corner.throttleOnDeltaM) : 'text-white font-bold'}>
                {isCompareMode
                  ? formatBrakingDelta(corner.throttleOnDeltaM)
                  : corner.primaryThrottleOnDistM !== null
                  ? `${corner.primaryThrottleOnDistM - corner.minDistM}m`
                  : '--'}
              </span>
            </div>

            <div className="flex flex-col col-span-2">
              <span className="text-lmu-muted text-[9px] uppercase">{isCompareMode ? 'Δ Time' : 'Duration'}</span>
              <span className={isCompareMode ? timeDeltaClass(corner.timeDeltaSec) : 'text-white font-bold'}>
                {isCompareMode ? formatTimeDelta(corner.timeDeltaSec) : `${corner.primaryTimeSec.toFixed(3)}s`}
              </span>
            </div>

            <div className="flex flex-col col-span-2">
              <span className="text-lmu-muted text-[9px] uppercase">{hasLateralTrackUsage ? 'Line offsets' : 'Chord sagitta'}</span>
              <span className="text-white font-bold">
                {trackUsage?.totalSweepM !== undefined
                  ? hasLateralTrackUsage ? `${trackUsage.totalSweepM}m total change` : `${trackUsage.totalSweepM}m`
                  : trackUsage?.apexMarginM !== undefined
                  ? `Apex offset: ${trackUsage.apexMarginM.toFixed(1)}m`
                  : 'Standard'}
                {hasLateralTrackUsage && trackUsage.exitWidthM !== undefined && (
                  <span className="text-[9px] font-normal text-slate-400 ml-1">({trackUsage.exitWidthM.toFixed(1)}m exit)</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
