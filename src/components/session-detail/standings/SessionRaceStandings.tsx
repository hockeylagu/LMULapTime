import React from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Ban, ShieldAlert, ShieldCheck, Trophy } from 'lucide-react';
import { DetailedSession, DriverData } from '../../../../server/core/types';
import { formatElapsedSeconds, formatTime } from '../../../utils/formatters.js';
import {
  getWorstTrackLimitSeverity,
  getTrackLimitStandingsPillClasses,
} from '../../../utils/trackLimits.js';

export interface SessionRaceStandingsProps {
  session: DetailedSession;
  selectedDriverName: string;
  setSelectedDriverName: (name: string) => void;
  isMultiClass: boolean;
}

type SortableColumn = 'position' | 'gain' | 'number' | 'bestLap' | 's1' | 's2' | 's3';

function getBestLap(driver: DriverData) {
  return driver.laps.find((lap) => lap.lapNum === driver.bestLapNum) || driver.laps.find((lap) => lap.lapTime === driver.bestLapTime);
}

function getSortValue(driver: DriverData, column: SortableColumn): number | null {
  if (column === 'position') return driver.position > 0 ? driver.position : null;
  if (column === 'gain') return driver.positionGain ?? null;
  if (column === 'number') {
    const carNumber = Number.parseInt(driver.carNumber, 10);
    return Number.isNaN(carNumber) ? null : carNumber;
  }
  if (column === 'bestLap') return driver.bestLapTime;

  const bestLap = getBestLap(driver);
  return column === 's1' ? bestLap?.s1 ?? null : column === 's2' ? bestLap?.s2 ?? null : bestLap?.s3 ?? null;
}

export const SessionRaceStandings: React.FC<SessionRaceStandingsProps> = ({
  session,
  selectedDriverName,
  setSelectedDriverName,
  isMultiClass,
}) => {
  const [sortColumn, setSortColumn] = React.useState<SortableColumn>('position');
  const [sortDescending, setSortDescending] = React.useState(false);

  if (!session.drivers || session.drivers.length <= 1) {
    return null;
  }

  const sortedDrivers = [...session.drivers].sort((firstDriver, secondDriver) => {
    const firstPosition = firstDriver.position > 0 ? firstDriver.position : Number.MAX_SAFE_INTEGER;
    const secondPosition = secondDriver.position > 0 ? secondDriver.position : Number.MAX_SAFE_INTEGER;
    if (firstPosition !== secondPosition) {
      return firstPosition - secondPosition;
    }
    const firstFinishTime = [...firstDriver.laps].reverse().find((lap) => typeof lap.elapsedSeconds === 'number')?.elapsedSeconds ?? undefined;
    const secondFinishTime = [...secondDriver.laps].reverse().find((lap) => typeof lap.elapsedSeconds === 'number')?.elapsedSeconds ?? undefined;
    const firstStatus = (firstDriver.finishStatus || '').toLowerCase();
    const secondStatus = (secondDriver.finishStatus || '').toLowerCase();
    const firstIsNonFinisher = /dnf|dns|dq|retired|disqual/.test(firstStatus);
    const secondIsNonFinisher = /dnf|dns|dq|retired|disqual/.test(secondStatus);

    if (firstIsNonFinisher !== secondIsNonFinisher) {
      return firstIsNonFinisher ? 1 : -1;
    }
    if (firstFinishTime !== undefined && secondFinishTime !== undefined && firstFinishTime !== secondFinishTime) {
      return firstFinishTime - secondFinishTime;
    }
    if (firstFinishTime !== undefined || secondFinishTime !== undefined) {
      return firstFinishTime === undefined ? 1 : -1;
    }
    return (firstDriver.position || Number.MAX_SAFE_INTEGER) - (secondDriver.position || Number.MAX_SAFE_INTEGER);
  });
  const displayDrivers = [...sortedDrivers].sort((firstDriver, secondDriver) => {
    const firstValue = getSortValue(firstDriver, sortColumn);
    const secondValue = getSortValue(secondDriver, sortColumn);
    if (firstValue === null && secondValue === null) return 0;
    if (firstValue === null) return 1;
    if (secondValue === null) return -1;
    const result = firstValue - secondValue;
    return sortDescending ? -result : result;
  });
  const sortHeader = (column: SortableColumn, label: string, alignment = 'text-left') => (
    <th className={`px-3.5 py-3 ${alignment}`}>
      <button
        type="button"
        onClick={() => {
          if (sortColumn === column) {
            setSortDescending((descending) => !descending);
          } else {
            setSortColumn(column);
            setSortDescending(false);
          }
        }}
        className="inline-flex items-center gap-1 uppercase hover:text-white"
        title={`Sort by ${label}`}
      >
        {label}
        {sortColumn === column && (sortDescending ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  );
  const overallWinner = session.drivers.find((driver) => driver.position === 1) ?? sortedDrivers[0];
  const leaderFinishLap = overallWinner?.laps
    ? [...overallWinner.laps].reverse().find((lap) => typeof lap.elapsedSeconds === 'number')
    : undefined;
  const leaderFinishTime = leaderFinishLap?.elapsedSeconds;
  const leaderLaps = overallWinner?.lapsCount ?? 0;
  const overallWinnerClass = overallWinner?.carClass.trim().toLowerCase();
  const sessionBestSectors = session.drivers.reduce(
    (best, driver) => {
      const bestLap = getBestLap(driver);
      if (typeof bestLap?.s1 === 'number') best.s1 = Math.min(best.s1, bestLap.s1);
      if (typeof bestLap?.s2 === 'number') best.s2 = Math.min(best.s2, bestLap.s2);
      if (typeof bestLap?.s3 === 'number') best.s3 = Math.min(best.s3, bestLap.s3);
      return best;
    },
    { s1: Number.POSITIVE_INFINITY, s2: Number.POSITIVE_INFINITY, s3: Number.POSITIVE_INFINITY },
  );

  return (
    <div className="glass-panel p-5 rounded-2xl relative space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4 text-lmu-gold" />
            <span>Session Classification & Driver Standings ({session.drivers.length} Drivers)</span>
          </h3>
          <p className="text-xs text-lmu-muted mt-0.5">
            Race classification with finish times and best-lap sectors. Click a driver to inspect their lap telemetry.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-xs text-lmu-muted">
          <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border">
            <tr>
              {sortHeader('position', 'Pos', 'text-center')}
              {sortHeader('gain', '+/-', 'text-center')}
              {sortHeader('number', '#', 'text-center')}
              <th className="px-3.5 py-3">Driver</th>
              <th className="px-3.5 py-3">Car & Class</th>
              <th className="px-3.5 py-3 text-center">Laps</th>
              {sortHeader('bestLap', 'Best Lap')}
              {sortHeader('s1', 'S1', 'text-right')}
              {sortHeader('s2', 'S2', 'text-right')}
              {sortHeader('s3', 'S3', 'text-right')}
              <th className="px-3.5 py-3 text-right">Time</th>
              <th className="px-3.5 py-3 text-center">Safety</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-lmu-border/50">
            {displayDrivers.map((d) => {
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
                  key={d.name}
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
                    <div className="text-slate-400 font-medium">{d.carType}</div>
                    <div className="text-lmu-muted text-[11px]">{d.carClass || 'General'}</div>
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
                          <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {tlCount} TL</span>
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
