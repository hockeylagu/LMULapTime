import { Activity } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import type { ConsistencyRating } from '../../../../shared/domain/lapComparison.js';
import { formatTime, getDisplayTrackName } from '../../../../shared/domain/formatters.js';
import { PaceBadge } from '../../common';
import { SectorsMetricBox } from './SectorsMetricBox.js';

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
  /** Clean laps per condition, when the session mixes dry and wet laps. */
  consistencyGroups?: ConsistencyRating['conditionGroups'];
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
  consistencyGroups,
  totalLapsCount,
  hasMultipleLaps,
  theoGap,
  avgS1,
  avgS2,
  avgS3,
}) => {
  const groupsText = consistencyGroups?.map((g) => `${g.group} ${g.laps}`).join(' · ');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
      const telemetryParams = new URLSearchParams(searchParams);
      telemetryParams.set('replayName', session.matchingReplayFile.name);
      telemetryParams.set('lap', String(bestLapNum));
      navigate(`/telemetry?${telemetryParams.toString()}`);
    } else if (session) {
      const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
      const carClass = selectedDriver.carClass || 'LMGT3';
      navigate(`/leaderboard?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
        carClass
      )}&sessionId=${encodeURIComponent(session.id)}&lapNum=${bestLapNum}`);
    }
  };

  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 ${
        isRaceSession ? 'border-t border-lmu-border/40 pt-2.5' : ''
      }`}
    >
      {/* 1. Best Lap */}
      <div
        onClick={handleOpenBestLapTelemetry}
        className={`p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between transition-all ${
          bestLapNum
            ? 'cursor-pointer hover:border-lmu-gold/60 hover:bg-lmu-card/80 group/card'
            : ''
        }`}
        title={bestLapNum ? `Click to open telemetry for Best Lap (Lap ${bestLapNum})` : undefined}
      >
        <div>
          <div className="flex items-center justify-between gap-1">
            <p
              className={`text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1 ${
                isCurrentSessionAllTimePB ? 'text-lmu-gold font-bold' : 'text-lmu-blue font-semibold'
              }`}
            >
              {isCurrentSessionAllTimePB ? `⭐ Personal Best` : '★ Session Best'}
            </p>
            {bestLapNum && (
              <span className="text-[10px] text-lmu-muted group-hover/card:text-lmu-gold transition-colors font-sans flex items-center gap-0.5">
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
            <p className="text-[10px] text-lmu-muted uppercase tracking-wider font-semibold">Top 3 Lap Avg</p>
            <span className="text-[10px] font-bold font-mono px-1.5 py-px rounded bg-lmu-aqua-deep/60 text-lmu-aqua-soft border border-lmu-aqua-strong/40">
              True Pace
            </span>
          </div>
          <h4 className="text-xl font-extrabold text-lmu-aqua-soft font-mono mt-0.5">
            {top3Avg ? formatTime(top3Avg) : '--:--.---'}
          </h4>
        </div>
        <div className="mt-1 space-y-0.5 text-[10px] text-lmu-muted">
          <div className="flex items-center justify-between">
            <span>
              Gap to PB:{' '}
              <strong className="text-lmu-aqua-soft font-mono">
                {top3DeltaToBest !== null ? `+${top3DeltaToBest.toFixed(3)}s` : '--'}
              </strong>
            </span>
          </div>
          <p className="text-[10px] text-lmu-muted truncate" title="Average of 3 fastest valid flying laps">
            Repeatable Pace Trend
          </p>
        </div>
      </div>

      {/* 3. Session Lap Average */}
      <div className="p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-lmu-muted uppercase tracking-wider font-semibold">Session Lap Average</p>
            {consistencyScore !== null && (
              <span
                className={`text-[10px] font-bold font-mono px-1.5 py-px rounded border whitespace-nowrap ${
                  consistencyScore >= 99
                    ? 'bg-lmu-gain-deep/60 text-lmu-gain-soft border-lmu-gain-strong/40'
                    : consistencyScore >= 97
                    ? 'bg-lmu-aqua-deep/60 text-lmu-aqua-soft border-lmu-aqua-strong/40'
                    : consistencyScore >= 94
                    ? 'bg-lmu-warn-deep/60 text-lmu-warn-soft border-lmu-warn-strong/40'
                    : 'bg-lmu-loss-deep/60 text-lmu-loss-soft border-lmu-loss-strong/40'
                }`}
                title={groupsText
                  ? `Pace consistency within each condition (${groupsText} clean laps): a change of conditions is not held against it`
                  : 'Pace consistency rating based on clean lap standard deviation'}
              >
                {consistencyScore.toFixed(1)}% Consist
              </span>
            )}
          </div>
          <h4 className="text-xl font-extrabold text-lmu-indigo-soft font-mono mt-0.5">
            {avgLapTime ? formatTime(avgLapTime) : '--:--.---'}
          </h4>
        </div>
        <div className="mt-1 space-y-0.5 text-[10px] text-lmu-muted">
          <div className="flex items-center justify-between">
            <span>
              Gap:{' '}
              <strong className="text-lmu-indigo-soft font-mono">
                {deltaToBest !== null ? `+${deltaToBest.toFixed(3)}s` : '--'}
              </strong>
            </span>
            {lapStdDev !== null && (
              <span title={groupsText ? `Standard deviation of clean flying lap times, within each condition (${groupsText})` : 'Standard deviation of clean flying lap times'}>
                Std: <strong className="text-white font-mono">±{lapStdDev.toFixed(3)}s</strong>
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] text-lmu-muted">
            <span>
              Clean Laps: <strong className="text-white font-mono">{cleanLapsCount}</strong> /{' '}
              {totalLapsCount}
            </span>
            {hasMultipleLaps && (
              <span
                className="text-[10px] uppercase tracking-wider text-lmu-warn/80 font-semibold"
                title="Lap 1 (Start/Out-lap) is excluded from flying averages"
              >
                Excl. L1
              </span>
            )}
          </div>
          {groupsText && (
            <p className="text-[10px] text-lmu-info-soft truncate" data-testid="consistency-groups"
              title="Consistency is measured within each condition, then combined">
              Per condition: {groupsText}
            </p>
          )}
        </div>
      </div>

      {/* 4. Theoretical Best */}
      <div className="p-2.5 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 flex flex-col justify-between">
        <div>
          <p className="text-[10px] text-lmu-muted uppercase tracking-wider font-semibold">Theoretical Best</p>
          <h4 className="text-xl font-extrabold text-lmu-green font-mono mt-0.5">
            {selectedDriver.theoreticalBestString}
          </h4>
        </div>
        <p className="text-[10px] text-lmu-muted mt-1">
          Potential:{' '}
          <strong className="text-lmu-gain font-mono">
            {theoGap !== null && theoGap > 0 ? `-${theoGap.toFixed(3)}s` : '0.000s'}
          </strong>
        </p>
      </div>

      {/* 5. Best and average sectors against the same car */}
      <SectorsMetricBox
        selectedDriver={selectedDriver}
        drivers={session?.drivers ?? []}
        averages={{ s1: avgS1, s2: avgS2, s3: avgS3, lap: avgLapTime }}
      />
    </div>
  );
};
