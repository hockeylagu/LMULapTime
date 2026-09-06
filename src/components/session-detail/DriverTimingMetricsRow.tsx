import { Activity } from 'lucide-react';
import { DetailedSession, DriverData } from '../../../server/types.js';
import { formatTime, getDisplayTrackName } from '../../utils/formatters.js';
import { updateHashParams } from '../../utils/urlParams.js';
import { PaceBadge } from '../common';

export interface DriverTimingMetricsRowProps {
  session?: DetailedSession;
  selectedDriver: DriverData;
  isRaceSession: boolean;
  isCurrentSessionAllTimePB: boolean;
  allTimeCategoryTrackPB: number | null;
  top3Avg: number | null;
  top3DeltaToBest: number | null;
  avgLapTime: number | null;
  deltaToBest: number | null;
  lapStdDev: number | null;
  consistencyScore: number | null;
  cleanLapsCount: number;
  totalLapsCount: number;
  hasMultipleLaps: boolean;
  theoGap: number | null;
  avgS1: number | null;
  avgS2: number | null;
  avgS3: number | null;
}

export const DriverTimingMetricsRow: React.FC<DriverTimingMetricsRowProps> = ({
  session,
  selectedDriver,
  isRaceSession,
  isCurrentSessionAllTimePB,
  allTimeCategoryTrackPB,
  top3Avg,
  top3DeltaToBest,
  avgLapTime,
  deltaToBest,
  lapStdDev,
  consistencyScore,
  cleanLapsCount,
  totalLapsCount,
  hasMultipleLaps,
  theoGap,
  avgS1,
  avgS2,
  avgS3,
}) => {
  const bestLapNum =
    selectedDriver.bestLapNum ||
    (selectedDriver.bestLapTime
      ? selectedDriver.laps?.find(
          (l) => l.lapTime && Math.abs(l.lapTime - selectedDriver.bestLapTime!) < 0.001
        )?.lapNum
      : undefined) ||
    (selectedDriver.laps && selectedDriver.laps.length > 0 ? selectedDriver.laps[0].lapNum : 1);

  const handleOpenBestLapTelemetry = () => {
    if (!bestLapNum) return;
    if (session?.matchingReplayFile) {
      updateHashParams({ replay: '1', lap: String(bestLapNum) });
    } else if (session) {
      const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
      const carClass = selectedDriver.carClass || 'LMGT3';
      window.location.hash = `#compare?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
        carClass
      )}&sessionId=${encodeURIComponent(session.id)}&lapNum=${bestLapNum}`;
    }
  };

  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 ${
        isRaceSession ? 'border-t border-lmu-border/40 pt-2.5' : ''
      }`}
    >
      {/* 1. Best Lap */}
      <div
        onClick={handleOpenBestLapTelemetry}
        className={`p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between transition-all ${
          bestLapNum
            ? 'cursor-pointer hover:border-lmu-gold/60 hover:bg-lmu-card/80 group/card shadow-sm'
            : ''
        }`}
        title={bestLapNum ? `Click to open telemetry for Best Lap (Lap ${bestLapNum})` : undefined}
      >
        <div>
          <div className="flex items-center justify-between gap-1">
            <p
              className={`text-[10px] uppercase font-semibold flex items-center gap-1 ${
                isCurrentSessionAllTimePB ? 'text-lmu-gold font-bold' : 'text-lmu-blue font-semibold'
              }`}
            >
              {isCurrentSessionAllTimePB ? `⭐ Personal Best` : '★ Session Best Lap'}
            </p>
            {bestLapNum && (
              <span className="text-[9px] text-lmu-muted group-hover/card:text-lmu-gold transition-colors font-sans flex items-center gap-0.5">
                <Activity className="w-2.5 h-2.5" />
                <span>L{bestLapNum} Telemetry →</span>
              </span>
            )}
          </div>
          <h4
            className={`text-xl font-extrabold font-mono mt-0.5 ${isCurrentSessionAllTimePB ? 'text-lmu-gold' : 'text-lmu-blue'}`}
          >
            {selectedDriver.bestLapTimeString}
          </h4>
        </div>
        {selectedDriver.bestLapPaceCategory && (
          <div className="mt-1 flex items-center gap-1 flex-wrap">
            <PaceBadge
              category={selectedDriver.bestLapPaceCategory}
              percentage={selectedDriver.bestLapPacePercentage}
              showPercentage={true}
              size="xs"
            />
            {!isCurrentSessionAllTimePB && allTimeCategoryTrackPB && (
              <span className="text-[10px] text-lmu-muted" title="Track PB">
                PB: <strong className="text-lmu-gold font-mono">{formatTime(allTimeCategoryTrackPB)}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. Top 3 Clean Lap Avg (True Pace) */}
      <div className="p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-lmu-muted uppercase font-semibold">Top 3 Lap Avg</p>
            <span className="text-[9px] font-bold font-mono px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/40">
              True Pace
            </span>
          </div>
          <h4 className="text-xl font-extrabold text-cyan-300 font-mono mt-0.5">
            {top3Avg ? formatTime(top3Avg) : '--:--.---'}
          </h4>
        </div>
        <div className="mt-1 space-y-0.5 text-[10px] text-lmu-muted">
          <div className="flex items-center justify-between">
            <span>
              Gap to PB:{' '}
              <strong className="text-cyan-200 font-mono">
                {top3DeltaToBest !== null ? `+${top3DeltaToBest.toFixed(3)}s` : '--'}
              </strong>
            </span>
          </div>
          <p className="text-[9px] text-lmu-muted truncate" title="Average of 3 fastest valid flying laps">
            Repeatable Pace Trend
          </p>
        </div>
      </div>

      {/* 3. Session Lap Average */}
      <div className="p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-lmu-muted uppercase font-semibold">Session Lap Average</p>
            {consistencyScore !== null && (
              <span
                className={`text-[9px] font-bold font-mono px-1.5 py-0.2 rounded border ${
                  consistencyScore >= 99
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                    : consistencyScore >= 97
                    ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
                    : consistencyScore >= 94
                    ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                    : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                }`}
                title="Pace consistency rating based on clean lap standard deviation"
              >
                {consistencyScore.toFixed(1)}% Consist
              </span>
            )}
          </div>
          <h4 className="text-xl font-extrabold text-indigo-300 font-mono mt-0.5">
            {avgLapTime ? formatTime(avgLapTime) : '--:--.---'}
          </h4>
        </div>
        <div className="mt-1 space-y-0.5 text-[10px] text-lmu-muted">
          <div className="flex items-center justify-between">
            <span>
              Gap:{' '}
              <strong className="text-indigo-200 font-mono">
                {deltaToBest !== null ? `+${deltaToBest.toFixed(3)}s` : '--'}
              </strong>
            </span>
            {lapStdDev !== null && (
              <span title="Standard deviation of clean flying lap times">
                Std: <strong className="text-white font-mono">±{lapStdDev.toFixed(3)}s</strong>
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-[9px] text-lmu-muted">
            <span>
              Clean Laps: <strong className="text-white font-mono">{cleanLapsCount}</strong> /{' '}
              {totalLapsCount}
            </span>
            {hasMultipleLaps && (
              <span
                className="text-[8px] uppercase tracking-wider text-amber-400/80 font-semibold"
                title="Lap 1 (Start/Out-lap) is excluded from flying averages"
              >
                Excl. L1
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. Theoretical Best */}
      <div className="p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between">
        <div>
          <p className="text-[10px] text-lmu-muted uppercase font-semibold">Theoretical Best</p>
          <h4 className="text-xl font-extrabold text-lmu-green font-mono mt-0.5">
            {selectedDriver.theoreticalBestString}
          </h4>
        </div>
        <p className="text-[10px] text-lmu-muted mt-1">
          Potential:{' '}
          <strong className="text-emerald-400 font-mono">
            {theoGap !== null && theoGap > 0 ? `-${theoGap.toFixed(3)}s` : '0.000s'}
          </strong>
        </p>
      </div>

      {/* 5. Best Sectors (S1 / S2 / S3) & Averages */}
      <div className="p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between">
        <p className="text-[10px] text-lmu-muted uppercase font-semibold">Sectors (Best / Avg)</p>
        <div className="mt-1 space-y-0.5 text-xs font-mono">
          <div className="grid grid-cols-[20px_auto_1fr] items-center gap-2">
            <span className="text-lmu-muted text-[10px] font-semibold">S1:</span>
            <strong className="text-lmu-gold font-bold">{formatTime(selectedDriver.bestS1)}</strong>
            <span className="text-lmu-muted text-[11px] text-right">({formatTime(avgS1)})</span>
          </div>
          <div className="grid grid-cols-[20px_auto_1fr] items-center gap-2">
            <span className="text-lmu-muted text-[10px] font-semibold">S2:</span>
            <strong className="text-lmu-blue font-bold">{formatTime(selectedDriver.bestS2)}</strong>
            <span className="text-lmu-muted text-[11px] text-right">({formatTime(avgS2)})</span>
          </div>
          <div className="grid grid-cols-[20px_auto_1fr] items-center gap-2">
            <span className="text-lmu-muted text-[10px] font-semibold">S3:</span>
            <strong className="text-lmu-green font-bold">{formatTime(selectedDriver.bestS3)}</strong>
            <span className="text-lmu-muted text-[11px] text-right">({formatTime(avgS3)})</span>
          </div>
        </div>
      </div>
    </div>
  );
};
