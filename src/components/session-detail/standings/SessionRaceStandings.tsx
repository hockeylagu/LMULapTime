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
    <div className="bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] p-5 rounded-2xl relative space-y-4">
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
            {displayDrivers.map((d) => (
              <SessionRaceStandingsRow
                key={d.name}
                driver={d}
                session={session}
                selectedDriverName={selectedDriverName}
                setSelectedDriverName={setSelectedDriverName}
                isMultiClass={isMultiClass}
                overallWinnerClass={overallWinnerClass || ''}
                sessionBestSectors={sessionBestSectors}
                leaderFinishTime={leaderFinishTime}
                leaderLaps={leaderLaps}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
