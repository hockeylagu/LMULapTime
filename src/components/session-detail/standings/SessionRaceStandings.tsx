import React from 'react';
import { ArrowDown, ArrowUp, Trophy } from 'lucide-react';
import { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { SessionRaceStandingsRow } from './SessionRaceStandingsRow.js';

export interface SessionRaceStandingsProps {
  session: DetailedSession;
  selectedDriverName: string;
  setSelectedDriverName: (name: string) => void;
  isMultiClass: boolean;
}

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent';

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
    <th
      scope="col"
      className={`px-3.5 py-3 ${alignment}`}
      aria-sort={sortColumn === column ? (sortDescending ? 'descending' : 'ascending') : undefined}
    >
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
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-white rounded ${FOCUS_RING}`}
        title={`Sort by ${label}`}
      >
        {label}
        {sortColumn === column && (sortDescending
          ? <ArrowDown className="h-3 w-3" aria-hidden="true" />
          : <ArrowUp className="h-3 w-3" aria-hidden="true" />)}
      </button>
    </th>
  );
  // A race is classified by the finish; practice and qualifying by the best lap, so no grid gain or race time.
  const isRace = session.sessionType === 'Race';
  const fastestByClass = session.drivers.reduce<Record<string, number>>((fastest, driver) => {
    const key = isMultiClass ? driver.carClass.trim().toLowerCase() : '';
    if (driver.bestLapTime !== null && driver.bestLapTime > 0) {
      fastest[key] = Math.min(fastest[key] ?? Number.POSITIVE_INFINITY, driver.bestLapTime);
    }
    return fastest;
  }, {});
  const overallWinner = session.drivers.find((driver) => driver.position === 1) ?? sortedDrivers[0];
  const leaderFinishLap = overallWinner?.laps
    ? [...overallWinner.laps].reverse().find((lap) => typeof lap.elapsedSeconds === 'number')
    : undefined;
  const leaderFinishTime = leaderFinishLap?.elapsedSeconds;
  const leaderLaps = overallWinner?.lapsCount ?? 0;
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
    <div className="bg-lmu-card border border-lmu-border p-5 rounded-2xl relative space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4 text-lmu-muted" aria-hidden="true" />
            <span>Classification</span>
            <span className="font-mono font-semibold text-lmu-muted">{session.drivers.length}</span>
          </h3>
          <p className="text-xs text-lmu-muted mt-0.5">
            Select a driver to view their laps.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-xs text-lmu-muted">
          <thead className="bg-lmu-bg/80 uppercase tracking-wider font-semibold text-[11px] text-lmu-muted border-b border-lmu-border">
            <tr>
              {sortHeader('position', 'Pos', 'text-center')}
              {isRace && sortHeader('gain', '+/-', 'text-center')}
              {sortHeader('number', '#', 'text-center')}
              <th scope="col" className="px-3.5 py-3">Driver</th>
              <th scope="col" className="px-3.5 py-3">Car & Class</th>
              <th scope="col" className="px-3.5 py-3 text-center">Laps</th>
              {sortHeader('bestLap', 'Best Lap')}
              {sortHeader('s1', 'S1', 'text-right')}
              {sortHeader('s2', 'S2', 'text-right')}
              {sortHeader('s3', 'S3', 'text-right')}
              <th scope="col" className="px-3.5 py-3 text-right">{isRace ? 'Time' : 'Gap'}</th>
              <th scope="col" className="px-3.5 py-3 text-left">Safety</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-lmu-border/50">
            {displayDrivers.map((d) => (
              <SessionRaceStandingsRow
                key={d.name}
                driver={d}
                session={session}
                selectedDriverName={selectedDriverName}
                setSelectedDriverName={setSelectedDriverName}
                isMultiClass={isMultiClass}
                sessionBestSectors={sessionBestSectors}
                leaderFinishTime={leaderFinishTime}
                leaderLaps={leaderLaps}
                isRace={isRace}
                fastestInClass={fastestByClass[isMultiClass ? d.carClass.trim().toLowerCase() : ''] ?? null}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
