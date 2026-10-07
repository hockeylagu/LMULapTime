import React from 'react';
import { DriverSafetySummary } from './DriverSafetySummary.js';
import { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { CarIdentity } from '../../vehicle/index.js';
import { formatElapsedSeconds, formatTime } from '../../../../shared/domain/formatters.js';

export interface SessionRaceStandingsRowProps {
  driver: DriverData;
  session: DetailedSession;
  selectedDriverName: string;
  setSelectedDriverName: (name: string) => void;
  isMultiClass: boolean;
  sessionBestSectors: { s1: number | null; s2: number | null; s3: number | null };
  leaderFinishTime?: number | null;
  leaderLaps: number;
  /** A race shows the grid gain and the finish; practice and qualifying the gap of the best lap. */
  isRace: boolean;
  /** The fastest best lap of the driver's class (of the session when single-class), for the gap. */
  fastestInClass: number | null;
}

function getBestLap(driver: DriverData) {
  return driver.laps.find((lap) => lap.lapNum === driver.bestLapNum) || driver.laps.find((lap) => lap.lapTime === driver.bestLapTime);
}

export const SessionRaceStandingsRow: React.FC<SessionRaceStandingsRowProps> = ({
  driver: d,
  session,
  selectedDriverName,
  setSelectedDriverName,
  isMultiClass,
  sessionBestSectors,
  leaderFinishTime,
  leaderLaps,
  isRace,
  fastestInClass,
}) => {
  const isPlayer = Boolean(d.isPlayer || (session.playerDriver && d.name === session.playerDriver.name));
  const isSelected = d.name === selectedDriverName;
  const bestLap = getBestLap(d);
  const isBestS1 = bestLap?.s1 === sessionBestSectors.s1;
  const isBestS2 = bestLap?.s2 === sessionBestSectors.s2;
  const isBestS3 = bestLap?.s3 === sessionBestSectors.s3;
  const overallPosition = d.position > 0 ? `P${d.position}` : '-';
  const hasClassPosition = isMultiClass && d.classPosition > 0;
  const primaryPosition = hasClassPosition ? `P${d.classPosition}` : overallPosition;
  const finishLap = [...d.laps].reverse().find((lap) => typeof lap.elapsedSeconds === 'number');
  const raceTime = finishLap?.elapsedTimeString || (finishLap?.elapsedSeconds !== undefined && finishLap?.elapsedSeconds !== null
    ? formatElapsedSeconds(finishLap.elapsedSeconds)
    : '-');
  const finishStatus = d.finishStatus || (d.position > 0 ? 'Finished' : 'Unknown');
  const isNonFinisher = /dnf|dns|dq|retired|disqual/i.test(finishStatus);
  const finishGap = !isNonFinisher && d.position !== 1 && typeof leaderFinishTime === 'number' && typeof finishLap?.elapsedSeconds === 'number'
    ? d.lapsCount < leaderLaps
      ? `+${leaderLaps - d.lapsCount} Lap${leaderLaps - d.lapsCount === 1 ? '' : 's'}`
      : `+${Math.max(0, finishLap.elapsedSeconds - leaderFinishTime).toFixed(3)}s`
    : d.finishGapToLeaderString || '-';
  const raceTimeOrGap = d.position === 1 && !isNonFinisher ? raceTime : isNonFinisher ? finishStatus : finishGap;
  const lapGap = d.bestLapTime !== null && d.bestLapTime > 0 && fastestInClass !== null
    ? d.bestLapTime - fastestInClass < 0.0005 ? 'Fastest' : `+${(d.bestLapTime - fastestInClass).toFixed(3)}s`
    : 'No time';
  const timeOrGap = isRace ? raceTimeOrGap : lapGap;
  const select = () => setSelectedDriverName(d.name);

  return (
    <tr
      onClick={select}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        select();
      }}
      tabIndex={0}
      aria-current={isSelected ? 'true' : undefined}
      aria-label={`${primaryPosition}${hasClassPosition ? ` in ${d.carClass}, ${overallPosition} overall` : ''} ${d.name}${isPlayer ? ' (you)' : ''}: show their laps`}
      className={`hover:bg-lmu-card/60 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lmu-accent ${
        isSelected ? 'bg-lmu-accent/15 border-l-lmu-accent' : ''
      }`}
    >
      <td className="px-3.5 py-2.5 text-center font-mono whitespace-nowrap"
        title={hasClassPosition ? `${d.carClass}: ${primaryPosition} · Overall: ${overallPosition}` : undefined}>
        <div className="inline-flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-white">{primaryPosition}</span>
          {hasClassPosition && d.classPosition !== d.position && <span className="text-[11px] font-normal text-lmu-muted" aria-label={`${overallPosition} overall`}>({overallPosition})</span>}
        </div>
      </td>
      {isRace && (
        <td className="px-3.5 py-2.5 text-center font-mono font-bold">
          <span className={d.positionGain && d.positionGain > 0 ? 'text-lmu-gain' : d.positionGain && d.positionGain < 0 ? 'text-lmu-loss' : 'text-lmu-text-soft'}>
            {d.positionGain === null || d.positionGain === undefined ? '-' : d.positionGain > 0 ? `+${d.positionGain}` : d.positionGain}
          </span>
        </td>
      )}
      <td className="px-3.5 py-2.5 text-center font-mono text-white">
        {d.carNumber || '-'}
      </td>
      <td className="px-3.5 py-2.5 font-medium text-white">
        <div className="flex items-center gap-1.5">
          <span className={isPlayer || isSelected ? 'font-bold text-white' : 'text-white'}>{d.name}</span>
          {isPlayer && <span className="text-lmu-muted font-normal">(You)</span>}
        </div>
      </td>
      <td className="px-3.5 py-2.5">
        <CarIdentity carType={d.carType} carClass={d.carClass} nameClassName="text-lmu-muted font-medium" />
      </td>
      <td className="px-3.5 py-2.5 text-center font-mono text-white">{d.lapsCount}</td>
      <td className="px-3.5 py-2.5 font-mono">
        <div className="font-bold text-white">{d.bestLapTimeString}</div>
      </td>
      <td className={`px-3.5 py-2.5 text-right font-mono ${isBestS1 ? 'text-lmu-gold font-bold' : 'text-lmu-muted'}`} title={isBestS1 ? 'Session best S1' : undefined}>
        {bestLap?.s1 !== null && bestLap?.s1 !== undefined ? formatTime(bestLap.s1) : '-'}
        {isBestS1 && <span className="sr-only"> (session best)</span>}
      </td>
      <td className={`px-3.5 py-2.5 text-right font-mono ${isBestS2 ? 'text-lmu-blue font-bold' : 'text-lmu-muted'}`} title={isBestS2 ? 'Session best S2' : undefined}>
        {bestLap?.s2 !== null && bestLap?.s2 !== undefined ? formatTime(bestLap.s2) : '-'}
        {isBestS2 && <span className="sr-only"> (session best)</span>}
      </td>
      <td className={`px-3.5 py-2.5 text-right font-mono ${isBestS3 ? 'text-lmu-green font-bold' : 'text-lmu-muted'}`} title={isBestS3 ? 'Session best S3' : undefined}>
        {bestLap?.s3 !== null && bestLap?.s3 !== undefined ? formatTime(bestLap.s3) : '-'}
        {isBestS3 && <span className="sr-only"> (session best)</span>}
      </td>
      <td className={`px-3.5 py-2.5 text-right font-mono font-semibold ${
        isRace && isNonFinisher ? 'text-lmu-loss-soft' : !isRace && lapGap === 'Fastest' ? 'text-lmu-text-soft' : 'text-white'
      }`}>
        {timeOrGap}
      </td>
      <td className="px-3.5 py-2.5 text-left">
        <DriverSafetySummary driver={d} />
      </td>
    </tr>
  );
};
