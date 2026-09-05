import React from 'react';
import { Flag } from 'lucide-react';
import { ReplayTrajectoryData } from '../../../server/types.js';

export interface ReplayPerformanceHeaderProps {
  currentLap: number;
  currentLapSummary: any;
  isCompareMode: boolean;
  baselineTrajectory: ReplayTrajectoryData | null;
  baselineReplayName: string | null;
  replayName: string | null;
  baselineLapNumber: number | null;
  lapDeltas: {
    lapDelta: number | null;
    s1Delta: number | null;
    s2Delta: number | null;
    s3Delta: number | null;
  } | null;
  formatLapTime: (sec?: number | null) => string;
}

export const ReplayPerformanceHeader: React.FC<ReplayPerformanceHeaderProps> = ({
  currentLap,
  currentLapSummary,
  isCompareMode,
  baselineTrajectory,
  baselineReplayName,
  replayName,
  baselineLapNumber,
  lapDeltas,
  formatLapTime,
}) => {
  if (!currentLapSummary) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 rounded-xl bg-[#090d16] border border-lmu-border/60 shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-black tracking-wider text-white uppercase flex items-center gap-1.5 pl-1">
          <Flag className="w-3.5 h-3.5 text-lmu-accent" />
          Lap {currentLap}
        </span>
        {currentLapSummary.isBest && (
          <span className="px-2 py-0.5 rounded-full bg-lmu-gold/20 border border-lmu-gold/40 text-lmu-gold font-bold text-[10px] shadow-sm">
            ★ Fastest Lap
          </span>
        )}
        {currentLapSummary.isOutlap && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px]">
            Outlap
          </span>
        )}
        <span
          className={`text-xs font-mono font-bold ${currentLapSummary.isBest ? 'text-lmu-gold font-extrabold' : 'text-emerald-400'}`}
          title="Replay GPS Lap Time"
        >
          {formatLapTime(currentLapSummary.lapTimeSec)}
        </span>
        {currentLapSummary.validatedTimeSec ? (
          <span
            className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-400/10 border border-cyan-400/30 text-cyan-300"
            title={`Session Log Official Time: ${formatLapTime(currentLapSummary.validatedTimeSec)}${typeof currentLapSummary.timeDiffSec === 'number' ? `\nDelta: ${currentLapSummary.timeDiffSec > 0 ? '+' : ''}${currentLapSummary.timeDiffSec.toFixed(3)}s` : ''}`}
          >
            Log: {formatLapTime(currentLapSummary.validatedTimeSec)}
          </span>
        ) : null}

        {/* Overall Lap Delta Pill against Baseline */}
        {isCompareMode && baselineTrajectory && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#131024] border border-amber-500/40 text-[11px] font-mono shadow-sm">
            <span className="text-amber-400 font-bold text-[10px]">
              vs {baselineReplayName === replayName ? `L${baselineTrajectory.currentLap ?? baselineLapNumber}` : `${baselineReplayName?.slice(0, 14)}… L${baselineTrajectory.currentLap ?? baselineLapNumber}`}:
            </span>
            {lapDeltas?.lapDelta !== null && lapDeltas?.lapDelta !== undefined ? (
              <span className={`font-black ${lapDeltas.lapDelta <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                Δ {lapDeltas.lapDelta <= 0 ? '' : '+'}{lapDeltas.lapDelta.toFixed(3)}s ({lapDeltas.lapDelta <= 0 ? 'Faster' : 'Slower'})
              </span>
            ) : (
              <span className="text-lmu-muted">--</span>
            )}
          </div>
        )}
      </div>

      {/* 3 Sectors Summary Pills */}
      <div className="flex items-center gap-1.5 text-[10px] font-mono pr-1">
        <div className="px-2 py-0.5 rounded-lg bg-lmu-gold/10 border border-lmu-gold/30 text-lmu-gold flex items-center gap-1">
          <span className="font-bold text-lmu-gold/80">S1:</span>
          <span className="font-black">{currentLapSummary.s1Sec ? currentLapSummary.s1Sec.toFixed(3) + 's' : '--'}</span>
          {lapDeltas?.s1Delta !== null && lapDeltas?.s1Delta !== undefined && (
            <span className={`text-[9px] font-bold pl-1 border-l border-lmu-gold/30 ${
              lapDeltas.s1Delta <= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {lapDeltas.s1Delta <= 0 ? '' : '+'}{lapDeltas.s1Delta.toFixed(2)}s
            </span>
          )}
        </div>
        <div className="px-2 py-0.5 rounded-lg bg-lmu-blue/10 border border-lmu-blue/30 text-lmu-blue flex items-center gap-1">
          <span className="font-bold text-lmu-blue/80">S2:</span>
          <span className="font-black">{currentLapSummary.s2Sec ? currentLapSummary.s2Sec.toFixed(3) + 's' : '--'}</span>
          {lapDeltas?.s2Delta !== null && lapDeltas?.s2Delta !== undefined && (
            <span className={`text-[9px] font-bold pl-1 border-l border-lmu-blue/30 ${
              lapDeltas.s2Delta <= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {lapDeltas.s2Delta <= 0 ? '' : '+'}{lapDeltas.s2Delta.toFixed(2)}s
            </span>
          )}
        </div>
        <div className="px-2 py-0.5 rounded-lg bg-lmu-green/10 border border-lmu-green/30 text-lmu-green flex items-center gap-1">
          <span className="font-bold text-lmu-green/80">S3:</span>
          <span className="font-black">{currentLapSummary.s3Sec ? currentLapSummary.s3Sec.toFixed(3) + 's' : '--'}</span>
          {lapDeltas?.s3Delta !== null && lapDeltas?.s3Delta !== undefined && (
            <span className={`text-[9px] font-bold pl-1 border-l border-lmu-green/30 ${
              lapDeltas.s3Delta <= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {lapDeltas.s3Delta <= 0 ? '' : '+'}{lapDeltas.s3Delta.toFixed(2)}s
            </span>
          )}
        </div>
        <div className="hidden md:flex px-2 py-0.5 rounded-lg bg-lmu-dark border border-lmu-border text-lmu-muted items-center gap-1">
          <span>1,200 pts</span>
        </div>
      </div>
    </div>
  );
};
