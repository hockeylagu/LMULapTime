import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { PaceBadge } from '../../common/index.js';
import { sessionLapComparePath, sessionTelemetryPath } from '../sessionDetailHelpers.js';

export interface BestLapBlockProps {
  session: DetailedSession;
  selectedDriver: DriverData;
  isCurrentSessionAllTimePB: boolean;
  allTimeCategoryTrackPB: number | null;
}

/**
 * The anchor of the session summary: the best lap, large and white (gold when it is the driver's
 * personal best here) and its pace band. The time opens the lap's telemetry (the leaderboard when the
 * session has no replay).
 */
export const BestLapBlock: React.FC<BestLapBlockProps> = ({
  selectedDriver,
  isCurrentSessionAllTimePB: isPB,
  allTimeCategoryTrackPB,
  session,
}) => {
  const [searchParams] = useSearchParams();
  const bestLapNum =
    selectedDriver.bestLapNum ||
    (selectedDriver.bestLapTime
      ? selectedDriver.laps?.find(
          (l) => l.lapTime && Math.abs(l.lapTime - selectedDriver.bestLapTime!) < 0.001
        )?.lapNum
      : undefined) ||
    (selectedDriver.laps && selectedDriver.laps.length > 0 ? selectedDriver.laps[0].lapNum : 1);

  const hasReplay = Boolean(session.matchingReplayFile);

  const targetUrl = session.matchingReplayFile
    ? sessionTelemetryPath(searchParams, session, selectedDriver, bestLapNum) ?? sessionLapComparePath(session, selectedDriver, bestLapNum)
    : sessionLapComparePath(session, selectedDriver, bestLapNum);

  return (
    <div className="min-w-0">
      <p className={`text-[10px] uppercase tracking-wider font-semibold ${isPB ? 'text-lmu-personal-best' : 'text-lmu-muted'}`}>
        {isPB ? 'Personal best' : 'Best lap'}
        {bestLapNum ? ` · L${bestLapNum}` : ''}
      </p>
      <Link
        to={targetUrl}
        title={hasReplay ? `Open telemetry for Lap ${bestLapNum}` : `Open Lap ${bestLapNum} on the leaderboard`}
        className={`group mt-0.5 inline-flex items-center gap-1.5 font-mono text-3xl font-extrabold leading-tight cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent ${
          isPB ? 'text-lmu-personal-best' : 'text-white'
        }`}
      >
        {selectedDriver.bestLapTimeString}
        <ChevronRight
          className="w-5 h-5 text-lmu-muted group-hover:text-white transition-colors"
          aria-hidden="true"
        />
      </Link>
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        <PaceBadge
          category={selectedDriver.bestLapPaceCategory}
          percentage={selectedDriver.bestLapPacePercentage}
          wet={selectedDriver.bestLapWet}
          showPercentage={true}
          size="xs"
        />
        {!isPB && allTimeCategoryTrackPB && (
          <span className="text-[11px] text-lmu-muted" title="Your personal best on this layout in this class">
            PB <span className="font-mono text-lmu-personal-best">{formatTime(allTimeCategoryTrackPB)}</span>
          </span>
        )}
      </div>
    </div>
  );
};
