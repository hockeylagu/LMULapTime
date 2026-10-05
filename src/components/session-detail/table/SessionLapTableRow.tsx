import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { DetailedSession, DriverData, LapData } from '../../../../shared/types/index.js';
import { formatTime, getDisplayTrackName, computeTheoreticalGap } from '../../../../shared/domain/formatters.js';
import { isRacingLap } from '../../../../shared/domain/lapComparison.js';
import { PaceBadge } from '../../common';
import { SessionLapStatusBadge } from './SessionLapStatusBadge.js';
import { CompoundCell, FuelCell, TireWearCell } from './SessionLapResourceCells.js';
import { SessionLapTableActions } from './SessionLapTableActions.js';
import { SessionLapDetailsRow } from './SessionLapDetailsRow.js';
import { lapEventsTooltip, type LapDetailSection } from './lapDetailSections.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { linkClickHandler } from '../../../utils/linkClick.js';

/** A row that opens on Enter: the focus ring sits inside the row, so the table's edge does not clip it. */
const FOCUS_ROW = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lmu-accent';

/** A sector time; the driver's best of the sector takes its sector color and says so to screen readers. */
const SectorCell: React.FC<{ time: number | null; sector: 1 | 2 | 3; isBest: boolean; bestClass: string }> = ({
  time, sector, isBest, bestClass,
}) => (
  <td className={`px-3 py-2.5 text-right ${isBest ? `${bestClass} font-bold` : 'text-lmu-text-soft'}`} title={isBest ? `Your best sector ${sector}` : undefined}>
    {formatTime(time)}
    {isBest && <span className="sr-only"> (best sector {sector})</span>}
  </td>
);

export interface SessionLapTableRowProps {
  session: DetailedSession;
  selectedDriver?: DriverData;
  lap: LapData;
  lapClassPos: number;
  detailSections: LapDetailSection[];
  bestLap: number | null;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoBest: number | null;
  isCurrentSessionAllTimePB: boolean;
  isMultiClass: boolean;
  hasTireWearData: boolean;
  hasFuelData: boolean;
  isExpanded: boolean;
  onToggleExpanded: (lapNum: number) => void;
  /** The table's column count, for the expanded row to span. */
  columnCount: number;
}

export const SessionLapTableRow: React.FC<SessionLapTableRowProps> = ({
  session,
  selectedDriver,
  lap: l,
  lapClassPos,
  detailSections,
  bestLap,
  bestS1,
  bestS2,
  bestS3,
  theoBest,
  isCurrentSessionAllTimePB,
  isMultiClass,
  hasTireWearData,
  hasFuelData,
  isExpanded,
  onToggleExpanded,
  columnCount,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // The parser infers a missing lap time from the elapsed time and marks out-laps (isOutLap).
  const displayLapTime = l.lapTime;
  const displayLapTimeString = l.lapTimeString;
  const isInferredLap = Boolean(l.isInferred);
  const isOutLap = Boolean(l.isOutLap);
  const isRacing = isRacingLap(l);

  const isSessionBest =
    displayLapTime !== null &&
    bestLap !== null &&
    Math.abs(displayLapTime - bestLap) < 0.0005 &&
    isRacing;
  const isLapAllTimePB = isSessionBest && isCurrentSessionAllTimePB;

  let deltaStr = '--';
  if (displayLapTime && bestLap) {
    const delta = displayLapTime - bestLap;
    if (Math.abs(delta) < 0.0005 && isRacing) {
      deltaStr = isLapAllTimePB ? 'Personal best' : 'Session best';
    } else {
      deltaStr = `+${delta.toFixed(3)}s`;
    }
  }

  const theoGapLap =
    isRacing
      ? computeTheoreticalGap(displayLapTime, theoBest)
      : null;

  const isS1Best = l.s1 !== null && bestS1 !== null && Math.abs(l.s1 - bestS1) < 0.0005;
  const isS2Best = l.s2 !== null && bestS2 !== null && Math.abs(l.s2 - bestS2) < 0.0005;
  const isS3Best = l.s3 !== null && bestS3 !== null && Math.abs(l.s3 - bestS3) < 0.0005;

  const eventsTooltip = lapEventsTooltip(l);

  const incompleteTooltip = eventsTooltip
    ? `Incomplete Lap:\n${eventsTooltip}`
    : 'Incomplete Lap (lap not finished or missing sector timing)';

  const telemetryUrl = session.matchingReplayFile
    ? (() => {
        const telemetryParams = new URLSearchParams(searchParams);
        telemetryParams.set('replayName', session.matchingReplayFile.name);
        telemetryParams.set('lap', String(l.lapNum));
        return `/telemetry?${telemetryParams.toString()}`;
      })()
    : (() => {
        const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
        const carClass = selectedDriver?.carClass || 'LMGT3';
        return `/leaderboard?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
          carClass
        )}&sessionId=${encodeURIComponent(session.id)}&lapNum=${l.lapNum}`;
      })();

  const handleOpenTelemetry = () => {
    navigate(telemetryUrl);
  };

  return (
    <>
    <tr
      onClick={handleOpenTelemetry}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        handleOpenTelemetry();
      }}
      tabIndex={0}
      aria-label={`Lap ${l.lapNum}, ${isInferredLap ? `about ${displayLapTimeString}` : displayLapTimeString}: open its telemetry`}
      className={`transition-colors cursor-pointer group ${FOCUS_ROW} ${
        isLapAllTimePB ? 'bg-lmu-personal-best/8 hover:bg-lmu-personal-best/12' : isSessionBest ? 'bg-lmu-session-best-strong/10 hover:bg-lmu-session-best-strong/15' : 'hover:bg-lmu-cardHover'
      } ${FOCUS_RING}`}
      title={`Click to open telemetry for Lap ${l.lapNum}`}
    >
      <td
        className="px-3 py-2.5 font-semibold text-lmu-text-soft whitespace-nowrap"
        title={l.elapsedTimeString ? `Session Time: ${l.elapsedTimeString}` : undefined}
      >
        <span className="inline-flex items-center gap-1.5">
          {detailSections.length > 0 ? (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onToggleExpanded(l.lapNum); }}
              className={`w-6 h-6 inline-flex items-center justify-center rounded text-lmu-muted hover:text-white hover:bg-white/10 ${FOCUS_RING}`}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Hide' : 'Show'} what happened on lap ${l.lapNum}`}
              title={`${isExpanded ? 'Hide' : 'Show'} what happened on this lap`}
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-5" aria-hidden="true" />
          )}
          <Link
            to={telemetryUrl}
            onClick={linkClickHandler(handleOpenTelemetry, { stop: true })}
            className="hover:underline hover:text-white"
          >
            {l.lapNum}
          </Link>
        </span>
      </td>
      <td
        className="px-3 py-2.5 text-right text-sm font-semibold text-lmu-text-soft"
        title={isMultiClass && l.position ? `Class: P${lapClassPos} (Overall: P${l.position})` : undefined}
      >
        {lapClassPos ? `P${lapClassPos}` : l.position ? `P${l.position}` : '-'}
      </td>
      <td
        className={`px-3 py-2.5 text-right text-sm font-bold ${
          isLapAllTimePB
            ? 'text-lmu-personal-best font-extrabold'
            : isSessionBest
            ? 'text-lmu-session-best font-bold'
            : isInferredLap || !l.isValid
            ? 'text-white italic font-mono'
            : 'text-white'
        }`}
      >
        {isInferredLap ? `~${displayLapTimeString}` : displayLapTimeString}
      </td>
      <td className="px-3 py-2.5 text-right font-semibold text-xs whitespace-nowrap">
        <span
          className={
            isLapAllTimePB ? 'text-lmu-personal-best font-extrabold font-sans' : isSessionBest ? 'text-lmu-session-best font-bold font-sans' : 'text-lmu-text-soft'
          }
        >
          {deltaStr}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap text-lmu-text-soft" title={`Gap to Theoretical Optimal (${formatTime(theoBest)})`}>
        {theoGapLap !== null ? `+${theoGapLap.toFixed(3)}s` : <span className="text-lmu-faint">--</span>}
      </td>
      <td className="px-3 py-2.5 font-sans">
        {isRacing && (l.conditions || l.paceCategory) ? (
          <PaceBadge
            category={l.paceCategory}
            percentage={l.pacePercentage}
            wet={Boolean(l.conditions)}
            showPercentage={true}
            size="sm"
          />
        ) : (
          <span className="text-lmu-muted text-xs">-</span>
        )}
      </td>
      <SectorCell time={l.s1} sector={1} isBest={isS1Best} bestClass="text-lmu-gold" />
      <SectorCell time={l.s2} sector={2} isBest={isS2Best} bestClass="text-lmu-blue" />
      <SectorCell time={l.s3} sector={3} isBest={isS3Best} bestClass="text-lmu-green" />
      <CompoundCell lap={l} />
      {hasTireWearData && <TireWearCell lap={l} />}
      {hasFuelData && <FuelCell lap={l} />}
      <td className="px-3 py-2.5 text-left font-sans">
        <SessionLapStatusBadge
          lap={l}
          isPitStop={l.isPitStop}
          isOutLap={isOutLap}
          isRaceSession={session.sessionType === 'Race'}
          isInferredLap={isInferredLap}
          incompleteTooltip={incompleteTooltip}
        />
      </td>
      <td className="px-2 py-2 text-center font-sans">
        <SessionLapTableActions
          session={session}
          lapNum={l.lapNum}
          selectedDriver={selectedDriver}
          telemetryUrl={telemetryUrl}
          onOpenTelemetry={handleOpenTelemetry}
        />
      </td>
    </tr>
    {isExpanded && detailSections.length > 0 && (
      <SessionLapDetailsRow lapNum={l.lapNum} lap={l} sections={detailSections} columnCount={columnCount} />
    )}
    </>
  );
};
