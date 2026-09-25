import React from 'react';
import { Ban, ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import { DetailedSession, DriverData } from '../../../../server/core/types';
import { CarClassBadge } from '../../common/CarClassBadge.js';
import { formatElapsedSeconds, formatTime } from '../../../utils/formatters.js';
import {
  getWorstTrackLimitSeverity,
  getTrackLimitStandingsPillClasses,
} from '../../../utils/trackLimits.js';

export interface SessionRaceStandingsRowProps {
  driver: DriverData;
  session: DetailedSession;
  selectedDriverName: string;
  setSelectedDriverName: (name: string) => void;
  isMultiClass: boolean;
  overallWinnerClass: string;
  sessionBestSectors: { s1: number | null; s2: number | null; s3: number | null };
  leaderFinishTime?: number | null;
  leaderLaps: number;
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
  overallWinnerClass,
  sessionBestSectors,
  leaderFinishTime,
  leaderLaps,
}) => {
  const isPlayer = Boolean(d.isPlayer || (session.playerDriver && d.name === session.playerDriver.name));
  const isSelected = d.name === selectedDriverName;
  const bestLap = getBestLap(d);
  const isBestS1 = bestLap?.s1 === sessionBestSectors.s1;
  const isBestS2 = bestLap?.s2 === sessionBestSectors.s2;
  const isBestS3 = bestLap?.s3 === sessionBestSectors.s3;
  const overallPosition = d.position > 0 ? `P${d.position}` : '-';
  const hasDifferentClass = d.carClass.trim().toLowerCase() !== overallWinnerClass;
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
  const timeOrGap = d.position === 1 && !isNonFinisher ? raceTime : isNonFinisher ? finishStatus : finishGap;

  return (
    <tr
      onClick={() => setSelectedDriverName(d.name)}
      className={`hover:bg-lmu-card/60 transition-colors cursor-pointer ${
        isSelected ? 'bg-lmu-accent/15 border-l-lmu-accent' : isPlayer ? 'bg-lmu-gold/10' : ''
      }`}
    >
      <td className="px-3.5 py-2.5 text-center font-bold text-white font-mono">
        <div>{overallPosition}{isMultiClass && hasDifferentClass && d.classPosition > 0 ? ` (P${d.classPosition})` : ''}</div>
      </td>
      <td className="px-3.5 py-2.5 text-center font-mono font-bold">
        <span className={d.positionGain && d.positionGain > 0 ? 'text-lmu-green' : d.positionGain && d.positionGain < 0 ? 'text-rose-400' : 'text-slate-300'}>
          {d.positionGain === null || d.positionGain === undefined ? '-' : d.positionGain > 0 ? `+${d.positionGain}` : d.positionGain}
        </span>
      </td>
      <td className="px-3.5 py-2.5 text-center font-mono text-white">
        {d.carNumber || '-'}
      </td>
      <td className="px-3.5 py-2.5 font-medium text-white">
        <div className="flex items-center gap-1.5">
          {isPlayer && <span className="text-lmu-gold">⭐</span>}
          <span
            className={
              isPlayer ? 'font-bold text-lmu-gold' : isSelected ? 'font-bold text-white' : 'text-white'
            }
          >
            {d.name} {isPlayer ? '(You)' : ''}
          </span>
        </div>
      </td>
      <td className="px-3.5 py-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-slate-300 font-medium truncate" title={d.carType}>{d.carType}</span>
          <CarClassBadge carClass={d.carClass} carType={d.carType} size="xs" />
        </div>
      </td>
      <td className="px-3.5 py-2.5 text-center font-mono text-white">{d.lapsCount}</td>
      <td className="px-3.5 py-2.5 font-mono">
        <div className="font-bold text-white">{d.bestLapTimeString}</div>
      </td>
      <td className={`px-3.5 py-2.5 text-right font-mono ${isBestS1 ? 'text-lmu-gold font-bold' : 'text-lmu-muted'}`} title={isBestS1 ? 'Session best S1' : undefined}>
        {bestLap?.s1 !== null && bestLap?.s1 !== undefined ? formatTime(bestLap.s1) : '-'}
      </td>
      <td className={`px-3.5 py-2.5 text-right font-mono ${isBestS2 ? 'text-lmu-blue font-bold' : 'text-lmu-muted'}`} title={isBestS2 ? 'Session best S2' : undefined}>
        {bestLap?.s2 !== null && bestLap?.s2 !== undefined ? formatTime(bestLap.s2) : '-'}
      </td>
      <td className={`px-3.5 py-2.5 text-right font-mono ${isBestS3 ? 'text-lmu-green font-bold' : 'text-lmu-muted'}`} title={isBestS3 ? 'Session best S3' : undefined}>
        {bestLap?.s3 !== null && bestLap?.s3 !== undefined ? formatTime(bestLap.s3) : '-'}
      </td>
      <td className={`px-3.5 py-2.5 text-right font-mono font-semibold ${isNonFinisher ? 'text-rose-300' : 'text-white'}`}>
        {timeOrGap}
      </td>
      <td className="px-3.5 py-2.5 text-center">
        {(() => {
          const incCount = d.totalIncidents ?? d.incidents?.length ?? 0;
          const tlCount = d.totalTrackLimits ?? d.trackLimits?.length ?? 0;
          const penCount = d.totalPenalties ?? d.penalties?.length ?? 0;
          const tooltip = [
            `Driver: ${d.name}`,
            `- Contacts / Incidents: ${incCount}x`,
            `- Track Limits Warnings: ${tlCount}`,
            `- Penalties: ${penCount}`,
            ...(d.penalties && d.penalties.length > 0
              ? [
                  '',
                  'Penalties:',
                  ...d.penalties.map((p) => {
                    const lapLabel = p.lapNum
                      ? `Lap ${p.lapNum}`
                      : p.elapsedSeconds
                      ? formatElapsedSeconds(p.elapsedSeconds)
                      : '';
                    return `  - ${lapLabel ? `${lapLabel}: ` : ''}${p.penalty} (${p.reason})`;
                  }),
                ]
              : []),
            ...(d.incidents && d.incidents.length > 0
              ? [
                  '',
                  'Incidents:',
                  ...d.incidents.slice(0, 8).map((inc) => {
                    const lapLabel = inc.lapNum
                      ? `Lap ${inc.lapNum}`
                      : inc.elapsedSeconds
                      ? formatElapsedSeconds(inc.elapsedSeconds)
                      : 'Lap ?';
                    const desc = inc.description || (inc.otherVehicle
                      ? `Contact with ${inc.otherVehicle}`
                      : inc.type === 'contact'
                      ? 'Contact with barrier'
                      : inc.type || 'Incident');
                    return `  - ${lapLabel}: ${desc}`;
                  }),
                  ...(d.incidents.length > 8 ? [`  ...and ${d.incidents.length - 8} more`] : []),
                ]
              : []),
            ...(d.trackLimits && d.trackLimits.length > 0
              ? [
                  '',
                  'Track Limits:',
                  ...d.trackLimits.slice(0, 6).map((tl) => {
                    const lapLabel = tl.lapNum
                      ? `Lap ${tl.lapNum}`
                      : tl.elapsedSeconds
                      ? formatElapsedSeconds(tl.elapsedSeconds)
                      : 'Warning';
                    return `  - ${lapLabel}: ${tl.description}`;
                  }),
                  ...(d.trackLimits.length > 6 ? [`  ...and ${d.trackLimits.length - 6} more`] : []),
                ]
              : []),
          ].join('\n');

          if (incCount === 0 && penCount === 0 && tlCount === 0) {
            return (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 cursor-help"
                title={tooltip}
              >
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Clean</span>
              </span>
            );
          }

          if (penCount > 0) {
            return (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950/70 text-rose-300 border border-rose-500/40 cursor-help"
                title={tooltip}
              >
                <span className="inline-flex items-center gap-1"><Ban className="w-3 h-3" /> {penCount} Pen</span>
                {incCount > 0 && <span className="text-[10px] text-rose-200/70 font-mono">({incCount}x)</span>}
              </span>
            );
          }

          const allTls = d.trackLimits && d.trackLimits.length > 0
            ? d.trackLimits
            : d.laps?.flatMap((l) => l.trackLimits || []) || [];
          const tlSeverity = getWorstTrackLimitSeverity(allTls);
          const tlPillClass = getTrackLimitStandingsPillClasses(tlSeverity);

          if (incCount > 0) {
            return (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-950/60 text-orange-300 border border-orange-500/30 cursor-help"
                title={tooltip}
              >
                <span className="inline-flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> {incCount}x</span>
                {tlCount > 0 && (
                  <span className={`text-[10px] font-mono ${tlSeverity === 'green' ? 'text-emerald-300/80' : tlSeverity === 'orange' ? 'text-orange-300/80' : 'text-yellow-300/70'}`}>
                    ({tlCount} TL)
                  </span>
                )}
              </span>
            );
          }

          return (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border cursor-help ${tlPillClass}`}
              title={tooltip}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>{tlCount} TL</span>
            </span>
          );
        })()}
      </td>
    </tr>
  );
};
