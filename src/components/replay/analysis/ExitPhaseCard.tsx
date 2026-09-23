import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis.js';
import {
  speedDeltaClass,
  timeDeltaClass,
  formatSpeedDelta,
  formatTimeDelta,
  formatBrakingDelta,
  throttleDeltaClass,
} from './CornerTableFormatters.js';

export interface ExitPhaseCardProps {
  corner: CornerSegmentComparison;
  isCompareMode: boolean;
  initialThrottleOffset: number | null;
  fullThrottleOffset: number | null;
}

export const ExitPhaseCard: React.FC<ExitPhaseCardProps> = ({
  corner,
  isCompareMode,
  initialThrottleOffset,
  fullThrottleOffset,
}) => {
  const trackUsage = corner.primaryTrackUsage;
  const exitSpaceLeftM = trackUsage?.exitSpaceLeftM;
  const exitSpaceDeltaM = corner.exitSpaceDeltaM;

  return (
    <div className="flex flex-col bg-[#050810] p-2.5 rounded-lg border border-lmu-border/40 min-w-0">
      <div className="flex items-center justify-between h-7 border-b border-slate-800/80 pb-1 w-full min-w-0">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider whitespace-nowrap">
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
          <span>Exit Phase</span>
        </span>
        {isCompareMode && (
          <span className={`shrink-0 text-[10px] whitespace-nowrap ml-1 ${timeDeltaClass(corner.phaseTiming?.exit.timeDeltaSec ?? 0)}`}>
            {corner.phaseTiming ? formatTimeDelta(corner.phaseTiming.exit.timeDeltaSec) : '--'}
          </span>
        )}
      </div>

      {/* Hero Speed Metric */}
      <div className="flex items-center justify-between h-8 py-1 border-b border-slate-800/60 min-w-0">
        <span className="text-slate-400 text-[10px] uppercase font-semibold text-left whitespace-nowrap">Exit Speed</span>
        <div className="flex items-center gap-1 shrink-0 text-right whitespace-nowrap">
          <span className="text-sm font-bold text-white">{corner.primaryExitSpeedKmh}</span>
          <span className="text-[10px] text-slate-400">km/h</span>
          {isCompareMode && (
            <span className={`ml-1 text-[10px] ${speedDeltaClass(corner.exitSpeedDeltaKmh)}`}>
              {formatSpeedDelta(corner.exitSpeedDeltaKmh)}
            </span>
          )}
        </div>
      </div>

      {/* Consistent 4-Row Breakdown */}
      <div className="flex flex-col text-[10px] divide-y divide-slate-800/40">
        <div className="flex items-center justify-between h-7 gap-1.5 min-w-0">
          <span
            className="text-slate-400 text-left whitespace-nowrap"
            title={isCompareMode ? 'Throttle 15% Delta' : 'Initial Throttle Application (15%)'}
          >
            {isCompareMode ? 'Thr 15% Δ' : 'Throttle 15%'}
          </span>
          <span
            className={`shrink-0 text-right whitespace-nowrap ${
              isCompareMode ? throttleDeltaClass(corner.initialThrottleDeltaM ?? null) : 'text-white font-bold'
            }`}
            title={
              isCompareMode
                ? formatBrakingDelta(corner.initialThrottleDeltaM ?? null)
                : initialThrottleOffset !== null
                ? initialThrottleOffset === 0
                  ? 'At apex (0m)'
                  : `${initialThrottleOffset}m past apex`
                : '--'
            }
          >
            {isCompareMode ? (
              formatBrakingDelta(corner.initialThrottleDeltaM ?? null)
            ) : initialThrottleOffset !== null ? (
              <>
                <span>{initialThrottleOffset}m</span>{' '}
                <span className="text-[9px] text-slate-400 font-normal">
                  {initialThrottleOffset === 0 ? 'apex' : 'past'}
                </span>
              </>
            ) : (
              '--'
            )}
          </span>
        </div>

        <div className="flex items-center justify-between h-7 gap-1.5 min-w-0">
          <span
            className="text-slate-400 text-left whitespace-nowrap"
            title={isCompareMode ? 'Full Throttle Delta' : 'Full Throttle Commitment (90%)'}
          >
            {isCompareMode ? 'Thr 90% Δ' : 'Full Throttle'}
          </span>
          <span
            className={`shrink-0 text-right whitespace-nowrap ${
              isCompareMode ? throttleDeltaClass(corner.throttleOnDeltaM) : 'text-white font-bold'
            }`}
            title={
              isCompareMode
                ? formatBrakingDelta(corner.throttleOnDeltaM)
                : fullThrottleOffset !== null
                ? fullThrottleOffset === 0
                  ? 'At apex (0m)'
                  : `${fullThrottleOffset}m past apex`
                : '--'
            }
          >
            {isCompareMode ? (
              formatBrakingDelta(corner.throttleOnDeltaM)
            ) : fullThrottleOffset !== null ? (
              <>
                <span>{fullThrottleOffset}m</span>{' '}
                <span className="text-[9px] text-slate-400 font-normal">
                  {fullThrottleOffset === 0 ? 'apex' : 'past'}
                </span>
              </>
            ) : (
              '--'
            )}
          </span>
        </div>

        <div className="flex items-center justify-between h-7 gap-1.5 min-w-0">
          <span
            className="text-slate-400 text-left whitespace-nowrap"
            title={isCompareMode ? 'Time Delta' : 'Corner Duration'}
          >
            {isCompareMode ? 'Δ Time' : 'Duration'}
          </span>
          <span
            className={`shrink-0 text-right whitespace-nowrap ${
              isCompareMode ? timeDeltaClass(corner.timeDeltaSec) : 'text-white font-bold'
            }`}
            title={isCompareMode ? formatTimeDelta(corner.timeDeltaSec) : `${corner.primaryTimeSec.toFixed(3)}s`}
          >
            {isCompareMode ? formatTimeDelta(corner.timeDeltaSec) : `${corner.primaryTimeSec.toFixed(3)}s`}
          </span>
        </div>

        {/* Row 4: Track Exit Space Left */}
        <div className="flex items-center justify-between h-7 gap-1.5 min-w-0">
          <span
            className="text-slate-400 text-left whitespace-nowrap"
            title={
              isCompareMode
                ? 'Exit Space Delta: difference in unused track space at exit compared to baseline (negative = used more track width)'
                : 'Exit Space: remaining lateral space to outside track edge at corner exit (indicates if more track was available)'
            }
          >
            {isCompareMode ? 'Exit Space Δ' : 'Exit Space'}
          </span>
          <span className="shrink-0 text-right whitespace-nowrap">
            {isCompareMode ? (
              exitSpaceDeltaM !== null && exitSpaceDeltaM !== undefined ? (
                <span
                  className={
                    exitSpaceDeltaM < 0
                      ? 'text-emerald-400 font-bold'
                      : exitSpaceDeltaM > 0
                      ? 'text-amber-400 font-bold'
                      : 'text-slate-400 font-normal'
                  }
                  title={
                    exitSpaceDeltaM < 0
                      ? `Used ${Math.abs(exitSpaceDeltaM).toFixed(1)}m more track width on exit than baseline`
                      : exitSpaceDeltaM > 0
                      ? `Left ${exitSpaceDeltaM.toFixed(1)}m more unused space on exit than baseline (pinched exit)`
                      : 'Identical track width used on exit'
                  }
                >
                  {exitSpaceDeltaM > 0 ? `+${exitSpaceDeltaM.toFixed(1)}m` : exitSpaceDeltaM < 0 ? `-${Math.abs(exitSpaceDeltaM).toFixed(1)}m` : '0.0m'}
                </span>
              ) : exitSpaceLeftM !== undefined ? (
                <span className="text-white font-bold" title={`${exitSpaceLeftM.toFixed(1)}m space left to track edge`}>
                  {exitSpaceLeftM.toFixed(1)}m <span className="text-[9px] text-slate-400 font-normal">left</span>
                </span>
              ) : trackUsage?.totalSweepM !== undefined ? (
                <span className="text-white font-bold" title={`${trackUsage.totalSweepM}m total lateral sweep`}>
                  {trackUsage.totalSweepM}m
                </span>
              ) : (
                <span className="text-slate-500">--</span>
              )
            ) : exitSpaceLeftM !== undefined ? (
              <span
                className={
                  exitSpaceLeftM < 0
                    ? 'text-rose-400 font-bold'
                    : exitSpaceLeftM <= 0.2
                    ? 'text-emerald-400 font-bold'
                    : exitSpaceLeftM <= 0.9
                    ? 'text-white font-bold'
                    : 'text-amber-400 font-bold'
                }
                title={
                  exitSpaceLeftM < 0
                    ? `${Math.abs(exitSpaceLeftM).toFixed(1)}m over exit track edge (off track / exceeded track limits)`
                    : exitSpaceLeftM <= 0.2
                    ? `${exitSpaceLeftM.toFixed(1)}m space left to track edge (full track used)`
                    : exitSpaceLeftM <= 0.9
                    ? `${exitSpaceLeftM.toFixed(1)}m space left to track edge`
                    : `${exitSpaceLeftM.toFixed(1)}m space left to track edge (more track available to carry exit speed)`
                }
              >
                <span>
                  {exitSpaceLeftM < 0
                    ? `${exitSpaceLeftM.toFixed(1)}m`
                    : exitSpaceLeftM === 0
                    ? '0.0m'
                    : `${exitSpaceLeftM.toFixed(1)}m`}
                </span>{' '}
                <span className="text-[9px] text-slate-400 font-normal">
                  {exitSpaceLeftM < 0 ? 'off-track' : 'left'}
                </span>
              </span>
            ) : trackUsage?.totalSweepM !== undefined ? (
              <span
                className="text-white font-bold"
                title={`${trackUsage.totalSweepM}m total lateral sweep`}
              >
                {trackUsage.totalSweepM}m
              </span>
            ) : (
              <span className="text-slate-500">--</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
