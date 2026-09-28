import React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { DetailedSession, DriverData, LapData } from '../../../../shared/types/index.js';
import { formatTime, getDisplayTrackName, computeTheoreticalGap } from '../../../../shared/domain/formatters.js';
import { computeLapToLapDelta, isRacingLap } from '../../../../shared/domain/lapComparison.js';
import { PaceBadge } from '../../common';
import { SessionLapStatusBadge } from './SessionLapStatusBadge.js';
import { SessionLapTableActions } from './SessionLapTableActions.js';
import { SessionLapDetailsRow } from './SessionLapDetailsRow.js';
import { lapDetailSections, lapEventsTooltip } from './lapDetailSections.js';

const COMPOUND_STYLES: Record<string, string | undefined> = {
  S: 'border-white text-white',
  M: 'border-yellow-400 text-yellow-400',
  H: 'border-red-500 text-red-500',
  W: 'border-sky-400 text-sky-400',
};

export interface SessionLapTableRowProps {
  session: DetailedSession;
  selectedDriver?: DriverData;
  lap: LapData;
  prevLap: LapData | null;
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
  prevLap,
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
      deltaStr = isLapAllTimePB ? '⭐ Personal Best' : '★ Session Best';
    } else {
      deltaStr = `+${delta.toFixed(3)}s`;
    }
  }

  const lapToLap = computeLapToLapDelta(prevLap?.lapTime, displayLapTime);

  const theoGapLap =
    isRacing && !isSessionBest
      ? computeTheoreticalGap(displayLapTime, theoBest)
      : null;

  const isS1Best = l.s1 !== null && bestS1 !== null && Math.abs(l.s1 - bestS1) < 0.0005;
  const isS2Best = l.s2 !== null && bestS2 !== null && Math.abs(l.s2 - bestS2) < 0.0005;
  const isS3Best = l.s3 !== null && bestS3 !== null && Math.abs(l.s3 - bestS3) < 0.0005;

  const lapClassPos =
    isMultiClass && l.position > 0
      ? 1 +
        (session.drivers || [])
          .filter(
            (d) =>
              d.name !== selectedDriver?.name &&
              (d.carClass || '').toLowerCase() === (selectedDriver?.carClass || '').toLowerCase()
          )
          .filter((d) => {
            const otherLap = d.laps?.find((ol) => ol.lapNum === l.lapNum);
            return otherLap && otherLap.position > 0 && otherLap.position < l.position;
          }).length
      : l.position;

  const compound = l.fCompound || l.rCompound;
  const compoundLetter = compound ? compound.trim().charAt(0).toUpperCase() : '';
  const compoundStyle = COMPOUND_STYLES[compoundLetter];

  const eventsTooltip = lapEventsTooltip(l);
  const detailSections = lapDetailSections(l);

  const incompleteTooltip = eventsTooltip
    ? `Incomplete Lap:\n${eventsTooltip}`
    : 'Incomplete Lap (lap not finished or missing sector timing)';

  const handleOpenTelemetry = () => {
    if (session.matchingReplayFile) {
      const telemetryParams = new URLSearchParams(searchParams);
      telemetryParams.set('replayName', session.matchingReplayFile.name);
      telemetryParams.set('lap', String(l.lapNum));
      navigate(`/telemetry?${telemetryParams.toString()}`);
    } else {
      const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
      const carClass = selectedDriver?.carClass || 'LMGT3';
      navigate(`/leaderboard?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
        carClass
      )}&sessionId=${encodeURIComponent(session.id)}&lapNum=${l.lapNum}`);
    }
  };

  return (
    <>
    <tr
      onClick={handleOpenTelemetry}
      className={`hover:bg-lmu-card/70 transition-colors cursor-pointer group ${
        isLapAllTimePB ? 'bg-lmu-gold/15' : isSessionBest ? 'bg-lmu-blue/10' : ''
      }`}
      title={`Click to open telemetry for Lap ${l.lapNum}`}
    >
      <td
        className="px-3 py-2.5 font-bold text-white whitespace-nowrap"
        title={l.elapsedTimeString ? `Session Time: ${l.elapsedTimeString}` : undefined}
      >
        <span className="inline-flex items-center gap-1">
          {detailSections.length > 0 ? (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onToggleExpanded(l.lapNum); }}
              className="-ml-1 p-0.5 rounded text-lmu-muted hover:text-white hover:bg-white/10"
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Hide' : 'Show'} what happened on lap ${l.lapNum}`}
              title={`${isExpanded ? 'Hide' : 'Show'} what happened on this lap`}
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
          ) : (
            <span className="w-4" aria-hidden="true" />
          )}
          {l.lapNum}
        </span>
      </td>
      <td
        className="px-3 py-2.5 text-lmu-muted font-mono"
        title={isMultiClass && l.position ? `Class: P${lapClassPos} (Overall: P${l.position})` : undefined}
      >
        {lapClassPos ? (isMultiClass ? `P${lapClassPos}` : lapClassPos) : l.position || '-'}
      </td>
      <td
        className={`px-3 py-2.5 text-right font-bold ${
          isLapAllTimePB
            ? 'text-lmu-gold font-extrabold'
            : isSessionBest
            ? 'text-lmu-blue font-bold'
            : isInferredLap
            ? 'text-amber-300/80 italic font-mono'
            : 'text-white'
        }`}
      >
        {isInferredLap ? `~${displayLapTimeString}` : displayLapTimeString}
      </td>
      <td className="px-3 py-2.5 text-center font-sans">
        {isRacing && l.paceCategory ? (
          <PaceBadge
            category={l.paceCategory}
            percentage={l.pacePercentage}
            showPercentage={true}
            size="sm"
          />
        ) : (
          <span className="text-lmu-muted text-xs">-</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-semibold text-xs">
        <span
          className={
            isLapAllTimePB ? 'text-lmu-gold font-extrabold' : isSessionBest ? 'text-lmu-blue font-bold' : 'text-white'
          }
        >
          {deltaStr}
        </span>
        {theoGapLap !== null && (
          <span
            className="block text-[10px] text-emerald-400/80 font-mono"
            title={`Gap to Theoretical Optimal (${formatTime(theoBest)})`}
          >
            +{theoGapLap.toFixed(3)}s vs opt
          </span>
        )}
      </td>
      <td
        className={`px-3 py-2.5 text-right font-semibold text-xs ${lapToLap.deltaClass}`}
        title={
          prevLap
            ? `Lap-to-lap delta vs Lap ${prevLap.lapNum} (${formatTime(prevLap.lapTime)}): ${lapToLap.formatted}`
            : 'Initial lap'
        }
      >
        {lapToLap.formatted}
      </td>
      <td className={`px-3 py-2.5 text-right ${isS1Best ? 'text-lmu-gold font-bold' : ''}`}>
        {formatTime(l.s1)}
      </td>
      <td className={`px-3 py-2.5 text-right ${isS2Best ? 'text-lmu-blue font-bold' : ''}`}>
        {formatTime(l.s2)}
      </td>
      <td className={`px-3 py-2.5 text-right ${isS3Best ? 'text-lmu-green font-bold' : ''}`}>
        {formatTime(l.s3)}
      </td>
      <td className="px-3 py-2.5 text-right text-white">
        {l.topSpeed ? `${l.topSpeed.toFixed(1)} km/h` : '-'}
      </td>
      <td className="px-3 py-2.5 text-center font-sans text-xs">
        {compoundStyle ? (
          <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full border-2 text-xs font-bold font-mono leading-none ${compoundStyle}`}
            title={compound}
          >
            {compoundLetter}
          </span>
        ) : (
          '-'
        )}
      </td>
      {hasTireWearData && (
        <td className="px-3 py-2.5 text-center font-sans text-xs whitespace-nowrap">
          {l.tireWear ? (
            <span
              className="px-2 py-0.5 rounded bg-lmu-bg border border-lmu-border/60 text-[11px] font-mono text-lmu-gold font-bold cursor-help inline-block"
              title={`4-Tire Average: ${l.tireWear.avg}%\nFL: ${l.tireWear.fl}% | FR: ${l.tireWear.fr}%\nRL: ${l.tireWear.rl}% | RR: ${l.tireWear.rr}%`}
            >
              {l.tireWear.avg}%
            </span>
          ) : (
            <span className="text-lmu-muted text-xs">-</span>
          )}
        </td>
      )}
      {hasFuelData && (
        <td className="px-3 py-2.5 text-center font-sans text-xs whitespace-nowrap">
          {(l.fuel !== null && l.fuel !== undefined) || (l.virtualEnergy !== null && l.virtualEnergy !== undefined) ? (
            <div
              className="inline-flex items-center gap-2 font-mono text-[11px] cursor-help"
              title={`Remaining Fuel: ${l.fuel ?? 'N/A'}% ${l.fuelUsed ? `(Consumed: ${l.fuelUsed}%)` : ''}${
                l.virtualEnergy !== null && l.virtualEnergy !== undefined
                  ? `\nRemaining Virtual Energy: ${l.virtualEnergy}% ${
                      l.virtualEnergyUsed ? `(Consumed: ${l.virtualEnergyUsed}%)` : ''
                    }`
                  : ''
              }`}
            >
              {l.fuel !== null && l.fuel !== undefined && (
                <span className="text-amber-300 font-bold">⛽ {l.fuel}%</span>
              )}
              {l.virtualEnergy !== null && l.virtualEnergy !== undefined && (
                <span className="text-indigo-300 font-bold">⚡ {l.virtualEnergy}%</span>
              )}
            </div>
          ) : (
            <span className="text-lmu-muted text-xs">-</span>
          )}
        </td>
      )}
      <td className="px-3 py-2.5 text-center font-sans">
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
          onOpenTelemetry={handleOpenTelemetry}
        />
      </td>
    </tr>
    {isExpanded && detailSections.length > 0 && (
      <SessionLapDetailsRow lapNum={l.lapNum} sections={detailSections} columnCount={columnCount} />
    )}
    </>
  );
};
