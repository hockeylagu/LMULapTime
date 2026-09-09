import React from 'react';
import { Flag } from 'lucide-react';
import { ReplayTrajectoryData, ReplayLapSummary } from '../../../server/types.js';

export interface ReplayPerformanceHeaderProps {
  currentLap: number;
  currentLapSummary: ReplayLapSummary | null | undefined;
  bestS1Sec?: number | null;
  bestS2Sec?: number | null;
  bestS3Sec?: number | null;
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

export const ReplayPerformanceHeader: React.FC<ReplayPerformanceHeaderProps> = React.memo(({
  currentLap,
  currentLapSummary,
  bestS1Sec,
  bestS2Sec,
  bestS3Sec,
  isCompareMode,
  baselineTrajectory,
  baselineReplayName,
  replayName,
  baselineLapNumber,
  lapDeltas,
  formatLapTime,
}) => {
  if (!currentLapSummary) return null;

  const isS1Best = Boolean(currentLapSummary.s1Sec && bestS1Sec && Math.abs(currentLapSummary.s1Sec - bestS1Sec) < 0.0005);
  const isS2Best = Boolean(currentLapSummary.s2Sec && bestS2Sec && Math.abs(currentLapSummary.s2Sec - bestS2Sec) < 0.0005);
  const isS3Best = Boolean(currentLapSummary.s3Sec && bestS3Sec && Math.abs(currentLapSummary.s3Sec - bestS3Sec) < 0.0005);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 rounded-xl bg-[#090d16] border border-lmu-border/60 shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-black tracking-wider text-white uppercase flex items-center gap-1.5 pl-1">
          <Flag className="w-3.5 h-3.5 text-lmu-accent" />
          Lap {currentLap}
        </span>
        {currentLapSummary.isBest && (
          <span className="px-2 py-0.5 rounded-full bg-lmu-gold/15 border border-lmu-gold/40 text-lmu-gold font-bold text-[10px] shadow-sm">
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

      <div className="flex items-center gap-2 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-lmu-muted text-[10px]">S1</span>
          <span className={`font-bold ${isS1Best ? 'text-lmu-gold' : 'text-white'}`}>{currentLapSummary.s1Sec?.toFixed(3) ?? '--'}s</span>
          {isCompareMode && lapDeltas?.s1Delta !== null && lapDeltas?.s1Delta !== undefined && (
            <span
              className={`text-[10px] font-bold ${
                lapDeltas.s1Delta <= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {lapDeltas.s1Delta <= 0 ? '' : '+'}{lapDeltas.s1Delta.toFixed(3)}s
            </span>
          )}
        </div>
        <span className="text-white/20">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-lmu-muted text-[10px]">S2</span>
          <span className={`font-bold ${isS2Best ? 'text-lmu-blue' : 'text-white'}`}>{currentLapSummary.s2Sec?.toFixed(3) ?? '--'}s</span>
          {isCompareMode && lapDeltas?.s2Delta !== null && lapDeltas?.s2Delta !== undefined && (
            <span
              className={`text-[10px] font-bold ${
                lapDeltas.s2Delta <= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {lapDeltas.s2Delta <= 0 ? '' : '+'}{lapDeltas.s2Delta.toFixed(3)}s
            </span>
          )}
        </div>
        <span className="text-white/20">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-lmu-muted text-[10px]">S3</span>
          <span className={`font-bold ${isS3Best ? 'text-lmu-green' : 'text-white'}`}>{currentLapSummary.s3Sec?.toFixed(3) ?? '--'}s</span>
          {isCompareMode && lapDeltas?.s3Delta !== null && lapDeltas?.s3Delta !== undefined && (
            <span
              className={`text-[10px] font-bold ${
                lapDeltas.s3Delta <= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {lapDeltas.s3Delta <= 0 ? '' : '+'}{lapDeltas.s3Delta.toFixed(3)}s
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
