import React from 'react';
import { Flag } from 'lucide-react';
import { ReplayTrajectoryData, ReplayLapSummary, ReplayMetadata } from '../../../../shared/types/index.js';
import { useReplayPersonalBest } from './useReplayPersonalBest.js';
import { ComparisonAccuracyNotice } from './ComparisonAccuracyNotice.js';

export interface ReplayPerformanceHeaderProps {
  currentLap: number;
  metadata?: ReplayMetadata | null;
  currentLapSummary: ReplayLapSummary | null | undefined;
  bestS1Sec?: number | null;
  bestS2Sec?: number | null;
  bestS3Sec?: number | null;
  isCompareMode: boolean;
  trajectory?: ReplayTrajectoryData | null;
  baselineTrajectory: ReplayTrajectoryData | null;
  lapDeltas: {
    lapDelta: number | null;
    s1Delta: number | null;
    s2Delta: number | null;
    s3Delta: number | null;
  } | null;
  formatLapTime: (sec?: number | null) => string;
}

export const ReplayPerformanceHeader: React.FC<ReplayPerformanceHeaderProps> = React.memo(({
  currentLap, metadata,
  currentLapSummary,
  bestS1Sec,
  bestS2Sec,
  bestS3Sec,
  isCompareMode,
  trajectory,
  baselineTrajectory,
  lapDeltas,
  formatLapTime,
}) => {
  const { isPersonalBest, error: personalBestError } = useReplayPersonalBest(metadata, trajectory);
  if (!currentLapSummary) return null;

  const isS1Best = Boolean(currentLapSummary.s1Sec && bestS1Sec && Math.abs(currentLapSummary.s1Sec - bestS1Sec) < 0.0005);
  const isS2Best = Boolean(currentLapSummary.s2Sec && bestS2Sec && Math.abs(currentLapSummary.s2Sec - bestS2Sec) < 0.0005);
  const isS3Best = Boolean(currentLapSummary.s3Sec && bestS3Sec && Math.abs(currentLapSummary.s3Sec - bestS3Sec) < 0.0005);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1 shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-black tracking-wider text-white uppercase flex items-center gap-1.5 pl-1">
          <Flag className="w-3.5 h-3.5 text-lmu-accent-text" />
          Lap {currentLap}
        </span>
        {currentLapSummary.isOutlap && (
          <span className="px-2 py-0.5 rounded-full bg-lmu-warn-strong/20 border border-lmu-warn-strong/40 text-lmu-warn-soft font-bold text-[10px]">
            Outlap
          </span>
        )}
        <span
          className={`text-xs font-mono font-bold ${isPersonalBest ? 'text-lmu-personal-best' : currentLapSummary.isBest ? 'text-lmu-session-best' : 'text-white'}`}
          title={isPersonalBest ? 'Personal best · Replay GPS lap time' : currentLapSummary.isBest ? 'Session best · Replay GPS lap time' : 'Replay GPS lap time'}
        >
          {formatLapTime(currentLapSummary.lapTimeSec)}
        </span>

        {/* Overall Lap Delta Pill against Baseline */}
        {isCompareMode && baselineTrajectory && (
          <div className="flex items-center gap-1.5 px-2 py-0.5  text-[11px] font-mono">
            {lapDeltas?.lapDelta !== null && lapDeltas?.lapDelta !== undefined ? (
              <span className={`font-black ${lapDeltas.lapDelta <= 0 ? 'text-lmu-gain' : 'text-lmu-loss'}`}>
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
          <span className={`font-bold ${isS1Best ? 'text-lmu-gold' : 'text-white'}`} title={isS1Best ? 'Session-best sector 1' : 'Sector 1'}>{currentLapSummary.s1Sec?.toFixed(3) ?? '--'}s</span>
          {isCompareMode && lapDeltas?.s1Delta !== null && lapDeltas?.s1Delta !== undefined && (
            <span
              className={`text-[10px] font-bold ${
                lapDeltas.s1Delta <= 0 ? 'text-lmu-gain' : 'text-lmu-loss'
              }`}
            >
              {lapDeltas.s1Delta <= 0 ? '' : '+'}{lapDeltas.s1Delta.toFixed(3)}s
            </span>
          )}
        </div>
        <span className="text-lmu-faint" aria-hidden="true">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-lmu-muted text-[10px]">S2</span>
          <span className={`font-bold ${isS2Best ? 'text-lmu-blue' : 'text-white'}`} title={isS2Best ? 'Session-best sector 2' : 'Sector 2'}>{currentLapSummary.s2Sec?.toFixed(3) ?? '--'}s</span>
          {isCompareMode && lapDeltas?.s2Delta !== null && lapDeltas?.s2Delta !== undefined && (
            <span
              className={`text-[10px] font-bold ${
                lapDeltas.s2Delta <= 0 ? 'text-lmu-gain' : 'text-lmu-loss'
              }`}
            >
              {lapDeltas.s2Delta <= 0 ? '' : '+'}{lapDeltas.s2Delta.toFixed(3)}s
            </span>
          )}
        </div>
        <span className="text-lmu-faint" aria-hidden="true">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-lmu-muted text-[10px]">S3</span>
          <span className={`font-bold ${isS3Best ? 'text-lmu-green' : 'text-white'}`} title={isS3Best ? 'Session-best sector 3' : 'Sector 3'}>{currentLapSummary.s3Sec?.toFixed(3) ?? '--'}s</span>
          {isCompareMode && lapDeltas?.s3Delta !== null && lapDeltas?.s3Delta !== undefined && (
            <span
              className={`text-[10px] font-bold ${
                lapDeltas.s3Delta <= 0 ? 'text-lmu-gain' : 'text-lmu-loss'
              }`}
            >
              {lapDeltas.s3Delta <= 0 ? '' : '+'}{lapDeltas.s3Delta.toFixed(3)}s
            </span>
          )}
        </div>
      </div>

      {personalBestError && <span role="alert" className="text-[10px] text-lmu-muted">Personal best unavailable: {personalBestError}</span>}
      {isCompareMode && <ComparisonAccuracyNotice trajectory={trajectory} baselineTrajectory={baselineTrajectory} />}
    </div>
  );
});
