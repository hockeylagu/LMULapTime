import React from 'react';
import { DetailedSession, DriverData, LapData } from '../../../server/types.js';
import { formatTime } from '../../utils/formatters.js';
import { computeLapToLapDelta } from '../../utils/lapComparison.js';
import { updateHashParams } from '../../utils/urlParams.js';
import { PaceBadge } from '../common';
import { SessionLapStatusBadge } from './SessionLapStatusBadge.js';
import { SessionLapTableActions } from './SessionLapTableActions.js';

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
}) => {
  let displayLapTime = l.lapTime;
  let displayLapTimeString = l.lapTimeString;
  let isInferredLap = !!l.isInferred;
  const prevIsValidPitStop = Boolean(
    prevLap && prevLap.isPitStop && prevLap.lapTime !== null && prevLap.lapTime > 0
  );
  const isOutLap = Boolean(l.isOutLap || prevIsValidPitStop);

  if (
    (displayLapTime === null || displayLapTime <= 0) &&
    l.elapsedSeconds !== null &&
    l.elapsedSeconds !== undefined
  ) {
    if (prevLap?.elapsedSeconds !== null && prevLap?.elapsedSeconds !== undefined) {
      const deltaEt = parseFloat((l.elapsedSeconds - prevLap.elapsedSeconds).toFixed(3));
      const knownSectors = (l.s1 || 0) + (l.s2 || 0) + (l.s3 || 0);
      const maxAllowed = bestLap ? Math.max(bestLap * 3.5, 300) : 600;
      if (deltaEt > 0 && (knownSectors === 0 || deltaEt >= knownSectors) && deltaEt >= 10 && deltaEt <= maxAllowed) {
        displayLapTime = deltaEt;
        displayLapTimeString = formatTime(deltaEt);
        isInferredLap = true;
      }
    }
  }

  const isSessionBest =
    displayLapTime !== null &&
    bestLap !== null &&
    Math.abs(displayLapTime - bestLap) < 0.0005 &&
    l.isValid &&
    !l.isPitStop &&
    !isOutLap;
  const isLapAllTimePB = isSessionBest && isCurrentSessionAllTimePB;

  let deltaStr = '--';
  if (displayLapTime && bestLap) {
    const delta = displayLapTime - bestLap;
    if (Math.abs(delta) < 0.0005 && l.isValid && !l.isPitStop && !isOutLap) {
      deltaStr = isLapAllTimePB ? '⭐ PERSONAL BEST' : 'SESSION BEST';
    } else {
      deltaStr = `+${delta.toFixed(3)}s`;
    }
  }

  const lapToLap = computeLapToLapDelta(prevLap?.lapTime, displayLapTime);

  const theoGapLap =
    displayLapTime && theoBest && l.isValid && !isSessionBest && !l.isPitStop && !isOutLap
      ? parseFloat((displayLapTime - theoBest).toFixed(3))
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

  const hasLapIncidents = Boolean(l.incidentCount && l.incidentCount > 0);
  const hasLapTrackLimits = Boolean(l.trackLimitCount && l.trackLimitCount > 0);
  const hasLapPenalties = Boolean(l.penaltyCount && l.penaltyCount > 0);

  const lapEventLines: string[] = [];
  if (hasLapIncidents) {
    lapEventLines.push(`💥 Incidents (${l.incidentCount}):\n${l.incidents?.map((i) => `  • ${i.description}`).join('\n')}`);
  }
  if (hasLapTrackLimits) {
    lapEventLines.push(`⚠️ Track Limits (${l.trackLimitCount}):\n${l.trackLimits?.map((tl) => `  • ${tl.description}`).join('\n')}`);
  }
  if (hasLapPenalties) {
    lapEventLines.push(`🛑 Penalties (${l.penaltyCount}):\n${l.penalties?.map((p) => `  • ${p.description}`).join('\n')}`);
  }
  const eventsTooltip = lapEventLines.length > 0 ? lapEventLines.join('\n\n') : undefined;

  const incompleteTooltip = eventsTooltip
    ? `Incomplete Lap:\n${eventsTooltip}`
    : 'Incomplete Lap (lap not finished or missing sector timing)';

  const handleOpenTelemetry = () => {
    if (session.matchingReplayFile) {
      updateHashParams({ replay: '1', lap: String(l.lapNum) });
    } else {
      const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
      const carClass = selectedDriver?.carClass || 'LMGT3';
      window.location.hash = `#compare?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
        carClass
      )}&sessionId=${encodeURIComponent(session.id)}&lapNum=${l.lapNum}`;
    }
  };

  return (
    <tr
      onClick={handleOpenTelemetry}
      className={`hover:bg-lmu-card/70 transition-colors cursor-pointer group ${
        isLapAllTimePB ? 'bg-lmu-gold/15' : isSessionBest ? 'bg-lmu-gold/10' : ''
      }`}
      title={`Click to open telemetry for Lap ${l.lapNum}`}
    >
      <td
        className="px-3 py-2.5 font-bold text-white"
        title={l.elapsedTimeString ? `Session Time: ${l.elapsedTimeString}` : undefined}
      >
        {l.lapNum}
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
            ? 'text-lmu-gold font-bold'
            : isInferredLap
            ? 'text-amber-300/80 italic font-mono'
            : 'text-white'
        }`}
      >
        {isInferredLap ? `~${displayLapTimeString}` : displayLapTimeString}
      </td>
      <td className="px-3 py-2.5 text-center font-sans">
        {l.isValid && !l.isPitStop && !isOutLap && l.paceCategory ? (
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
            isLapAllTimePB ? 'text-lmu-gold font-extrabold' : isSessionBest ? 'text-lmu-gold font-bold' : 'text-white'
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
        {l.fCompound || l.rCompound ? (
          <span className="px-2 py-0.5 rounded bg-lmu-border text-white">{l.fCompound || l.rCompound}</span>
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
  );
};
