import React from 'react';
import { useNavigate } from 'react-router';
import { ArrowDown, ArrowLeftRight, ArrowUp, Clock } from 'lucide-react';
import { DetailedSession, DriverData, LapData } from '../../../../server/core/types';
import { getDisplayTrackName } from '../../../utils/formatters.js';
import { computeLapToLapDelta } from '../../../utils/lapComparison.js';
import { SessionLapTableRow } from './SessionLapTableRow.js';

type SortableLapColumn = 'lap' | 'position' | 'lapTime' | 'delta' | 'prevDelta' | 's1' | 's2' | 's3' | 'topSpeed';

interface LapTableEntry {
  lap: LapData;
  prevLap: LapData | null;
  originalIndex: number;
}

function getDisplayLapTime(lap: LapData, prevLap: LapData | null, bestLap: number | null): number | null {
  if (lap.lapTime !== null && lap.lapTime > 0) return lap.lapTime;
  if (lap.elapsedSeconds === null || lap.elapsedSeconds === undefined || prevLap?.elapsedSeconds === null || prevLap?.elapsedSeconds === undefined) {
    return null;
  }

  const deltaEt = parseFloat((lap.elapsedSeconds - prevLap.elapsedSeconds).toFixed(3));
  const knownSectors = (lap.s1 || 0) + (lap.s2 || 0) + (lap.s3 || 0);
  const maxAllowed = bestLap ? Math.max(bestLap * 3.5, 300) : 600;
  return deltaEt > 0 && (knownSectors === 0 || deltaEt >= knownSectors) && deltaEt >= 10 && deltaEt <= maxAllowed
    ? deltaEt
    : null;
}

function getLapSortValue(entry: LapTableEntry, column: SortableLapColumn, bestLap: number | null): number | null {
  const displayLapTime = getDisplayLapTime(entry.lap, entry.prevLap, bestLap);
  if (column === 'lap') return entry.lap.lapNum;
  if (column === 'position') return entry.lap.position > 0 ? entry.lap.position : null;
  if (column === 'lapTime') return displayLapTime;
  if (column === 'delta') return displayLapTime !== null && bestLap !== null ? displayLapTime - bestLap : null;
  if (column === 'prevDelta') return computeLapToLapDelta(entry.prevLap?.lapTime, displayLapTime).delta;
  if (column === 's1') return entry.lap.s1;
  if (column === 's2') return entry.lap.s2;
  if (column === 's3') return entry.lap.s3;
  return entry.lap.topSpeed;
}

export interface SessionLapTableProps {
  session: DetailedSession;
  selectedDriver?: DriverData;
  isMultiClass: boolean;
  hasTireWearData: boolean;
  hasFuelData: boolean;
  hasVirtualEnergyData: boolean;
  isCurrentSessionAllTimePB: boolean;
}

export const SessionLapTable: React.FC<SessionLapTableProps> = ({
  session,
  selectedDriver,
  isMultiClass,
  hasTireWearData,
  hasFuelData,
  hasVirtualEnergyData,
  isCurrentSessionAllTimePB,
}) => {
  const navigate = useNavigate();
  const [sortColumn, setSortColumn] = React.useState<SortableLapColumn>('lap');
  const [sortDescending, setSortDescending] = React.useState(false);
  const bestLap = selectedDriver?.bestLapTime ?? null;
  const bestS1 = selectedDriver?.bestS1 ?? null;
  const bestS2 = selectedDriver?.bestS2 ?? null;
  const bestS3 = selectedDriver?.bestS3 ?? null;
  const theoBest = selectedDriver?.theoreticalBest ?? null;
  const lapEntries = (selectedDriver?.laps || []).map((lap, index, laps): LapTableEntry => ({
    lap,
    prevLap: index > 0 ? laps[index - 1] : null,
    originalIndex: index,
  }));
  const displayLapEntries = [...lapEntries].sort((firstEntry, secondEntry) => {
    const firstValue = getLapSortValue(firstEntry, sortColumn, bestLap);
    const secondValue = getLapSortValue(secondEntry, sortColumn, bestLap);
    if (firstValue === null && secondValue === null) return firstEntry.originalIndex - secondEntry.originalIndex;
    if (firstValue === null) return 1;
    if (secondValue === null) return -1;
    const result = firstValue - secondValue;
    return result === 0
      ? firstEntry.originalIndex - secondEntry.originalIndex
      : sortDescending
      ? -result
      : result;
  });
  const sortHeader = (column: SortableLapColumn, label: string, alignment = 'text-left', title?: string) => (
    <th className={`px-3 py-3 ${alignment}`} title={title}>
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

  return (
    <div className="glass-panel p-5 rounded-2xl relative space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-lmu-accent" />
            <span>Lap Timing & Telemetry ({selectedDriver?.laps?.length || 0} Laps)</span>
          </h3>
          <p className="text-xs text-lmu-muted mt-0.5">
            Click any lap row or Telemetry button to inspect rich telemetry, or compare side-by-side.
          </p>
        </div>

        {/* Open the lap comparison view */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
              const carClass = selectedDriver?.carClass || 'LMGT3';
              navigate(`/compare?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
                carClass
              )}&sessionId=${encodeURIComponent(session.id)}`);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-lmu-accent/20 hover:bg-lmu-accent/30 border border-lmu-accent/40 text-lmu-accent text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            title="Compare laps from this session"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Compare Laps</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-xs text-lmu-muted">
          <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border">
            <tr>
              {sortHeader('lap', 'Lap')}
              {sortHeader('position', isMultiClass ? 'Class Pos' : 'Pos', 'text-left', isMultiClass ? `Class Position (in ${selectedDriver?.carClass || 'Class'})` : 'Position')}
              {sortHeader('lapTime', 'Lap Time', 'text-right')}
              <th className="px-3 py-3 text-center">Pace Category</th>
              {sortHeader('delta', 'Delta', 'text-right')}
              {sortHeader('prevDelta', 'Δ Prev', 'text-right', 'Consecutive lap-to-lap delta (Lap N - Lap N-1)')}
              {sortHeader('s1', 'Sector 1', 'text-right')}
              {sortHeader('s2', 'Sector 2', 'text-right')}
              {sortHeader('s3', 'Sector 3', 'text-right')}
              {sortHeader('topSpeed', 'Top Speed', 'text-right')}
              <th className="px-3 py-3 text-center">Tire Compound</th>
              {hasTireWearData && <th className="px-3 py-3 text-center">Tire Wear</th>}
              {hasFuelData && (
                <th className="px-3 py-3 text-center">{hasVirtualEnergyData ? 'Fuel & VE' : 'Fuel'}</th>
              )}
              <th className="px-3 py-3 text-center">Status</th>
              <th className="px-2 py-3 text-center w-16" title="Telemetry & Compare">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-lmu-border/50 font-mono">
            {displayLapEntries.map(({ lap: l, prevLap }) => (
              <SessionLapTableRow
                key={l.lapNum}
                session={session}
                selectedDriver={selectedDriver}
                lap={l}
                prevLap={prevLap}
                bestLap={bestLap}
                bestS1={bestS1}
                bestS2={bestS2}
                bestS3={bestS3}
                theoBest={theoBest}
                isCurrentSessionAllTimePB={isCurrentSessionAllTimePB}
                isMultiClass={isMultiClass}
                hasTireWearData={hasTireWearData}
                hasFuelData={hasFuelData}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
