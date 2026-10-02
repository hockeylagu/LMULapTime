import React from 'react';
import { useNavigate } from 'react-router';
import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronsDownUp, ChevronsUpDown, Clock } from 'lucide-react';
import { DetailedSession, DriverData, LapData } from '../../../../shared/types/index.js';
import { computeTheoreticalGap, formatTime, getDisplayTrackName } from '../../../../shared/domain/formatters.js';
import { isRacingLap } from '../../../../shared/domain/lapComparison.js';
import { lapClassPositions } from '../../../../shared/domain/lapPlaces.js';
import { SessionLapTableRow } from './SessionLapTableRow.js';
import { lapDetailSections, type LapDetailSection } from './lapDetailSections.js';
import { lapDetailContext } from './lapPlaces.js';
import { SessionLapStewardsLine } from './SessionLapStewardsLine.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';

/** A neutral 32px header button: the icon carries no color either. */
const HEADER_BUTTON = `h-8 px-3 rounded-lg bg-lmu-card hover:bg-lmu-raised border border-lmu-border hover:border-lmu-rule text-lmu-text-soft hover:text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${FOCUS_RING}`;

type SortableLapColumn = 'lap' | 'position' | 'lapTime' | 'delta' | 'optimalDelta' | 's1' | 's2' | 's3';

interface LapTableEntry {
  lap: LapData;
  position: number;
  detailSections: LapDetailSection[];
  originalIndex: number;
}

function getLapSortValue(entry: LapTableEntry, column: SortableLapColumn, bestLap: number | null, theoBest: number | null, position: number): number | null {
  const displayLapTime = entry.lap.lapTime !== null && entry.lap.lapTime > 0 ? entry.lap.lapTime : null;
  if (column === 'lap') return entry.lap.lapNum;
  if (column === 'position') return position > 0 ? position : null;
  if (column === 'lapTime') return displayLapTime;
  if (column === 'delta') return displayLapTime !== null && bestLap !== null ? displayLapTime - bestLap : null;
  if (column === 'optimalDelta') return isRacingLap(entry.lap) ? computeTheoreticalGap(displayLapTime, theoBest) : null;
  if (column === 's1') return entry.lap.s1;
  if (column === 's2') return entry.lap.s2;
  return entry.lap.s3;
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
  const lapEntries = React.useMemo(() => {
    const positions = lapClassPositions(session, selectedDriver, isMultiClass);
    return (selectedDriver?.laps || []).map((lap, index, laps): LapTableEntry => ({
      lap,
      position: positions.get(lap) ?? lap.position,
      detailSections: lapDetailSections(lap, lapDetailContext(session, selectedDriver, lap, index > 0 ? laps[index - 1] : null, isMultiClass, positions)),
      originalIndex: index,
    }));
  }, [session, selectedDriver, isMultiClass]);
  const displayLapEntries = React.useMemo(() => [...lapEntries].sort((firstEntry, secondEntry) => {
    const firstValue = getLapSortValue(firstEntry, sortColumn, bestLap, theoBest, firstEntry.position);
    const secondValue = getLapSortValue(secondEntry, sortColumn, bestLap, theoBest, secondEntry.position);
    if (firstValue === null && secondValue === null) return firstEntry.originalIndex - secondEntry.originalIndex;
    if (firstValue === null) return 1;
    if (secondValue === null) return -1;
    const result = firstValue - secondValue;
    return result === 0
      ? firstEntry.originalIndex - secondEntry.originalIndex
      : sortDescending
      ? -result
      : result;
  }), [lapEntries, sortColumn, sortDescending, bestLap, theoBest]);
  const [expandedLaps, setExpandedLaps] = React.useState<ReadonlySet<number>>(() => new Set());
  const lapsWithDetails = React.useMemo(() => lapEntries.filter(({ detailSections }) => detailSections.length > 0).map(({ lap }) => lap.lapNum), [lapEntries]);
  const allExpanded = lapsWithDetails.length > 0 && lapsWithDetails.every((lapNum) => expandedLaps.has(lapNum));
  const toggleLap = (lapNum: number) => setExpandedLaps((current) => {
    const next = new Set(current);
    if (next.has(lapNum)) next.delete(lapNum);
    else next.add(lapNum);
    return next;
  });
  const columnCount = 12 + (hasTireWearData ? 1 : 0) + (hasFuelData ? 1 : 0);
  const sortHeader = (column: SortableLapColumn, label: string, cellClass: string, title?: string) => (
    <th
      scope="col"
      className={`py-2.5 ${cellClass}`}
      title={title}
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
        className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wider hover:text-white rounded ${
          sortColumn === column ? 'text-lmu-text-soft' : ''
        } ${FOCUS_RING}`}
        title={`Sort by ${label}`}
      >
        {label}
        {sortColumn === column && (sortDescending
          ? <ArrowDown className="h-3 w-3" aria-hidden="true" />
          : <ArrowUp className="h-3 w-3" aria-hidden="true" />)}
      </button>
    </th>
  );

  return (
    <div className="bg-lmu-card border border-lmu-border p-5 rounded-2xl relative space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-b border-lmu-border/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-lmu-accent-text" aria-hidden="true" />
            <span>Laps</span>
            <span className="font-mono font-semibold text-lmu-muted">{selectedDriver?.laps?.length || 0}</span>
          </h3>
        </div>

        {/* Open the lap comparison view */}
        <div className="flex flex-wrap items-center gap-2">
          {lapsWithDetails.length > 0 && (
            <button
              type="button"
              onClick={() => setExpandedLaps(allExpanded ? new Set() : new Set(lapsWithDetails))}
              className={`${HEADER_BUTTON}`}
              aria-expanded={allExpanded}
              title="Show or hide traffic, incidents, track limits and penalties under every lap"
            >
              {allExpanded
                ? <ChevronsDownUp className="w-3.5 h-3.5 text-lmu-muted" aria-hidden="true" />
                : <ChevronsUpDown className="w-3.5 h-3.5 text-lmu-muted" aria-hidden="true" />}
              <span>{allExpanded ? 'Hide lap details' : 'Show lap details'}</span>
            </button>
          )}
          <button
            onClick={() => {
              const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
              const carClass = selectedDriver?.carClass || 'LMGT3';
              const lapNum = selectedDriver?.bestLapNum;
              navigate(`/leaderboard?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
                carClass
              )}&sessionId=${encodeURIComponent(session.id)}${lapNum ? `&lapNum=${lapNum}` : ''}`);
            }}
            type="button"
            className={`${HEADER_BUTTON}`}
            title="Compare your best lap from this session"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-lmu-muted" aria-hidden="true" />
            <span>Compare Laps</span>
          </button>
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-xs text-lmu-muted">Select a lap for telemetry; expand it for events.</p>
          {selectedDriver && <SessionLapStewardsLine driver={selectedDriver} />}
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        {/* Timing columns keep fixed widths; status takes the remaining room. Resource columns
            extend the scrollable table rather than squeezing the timing readouts. */}
        <table className="w-full table-fixed text-left text-xs text-lmu-muted" style={{ minWidth: 1376 + (hasTireWearData ? 96 : 0) + (hasFuelData ? 144 : 0) }}>
          <thead className="bg-lmu-bg/80 uppercase tracking-wider font-semibold text-[11px] text-lmu-muted border-b border-lmu-border">
            <tr>
              {sortHeader('lap', 'Lap', 'w-16 px-3')}
              {sortHeader('position', 'Pos', 'w-16 px-3 text-right', isMultiClass ? `Class position (in ${selectedDriver?.carClass || 'class'})` : 'Position')}
              {sortHeader('lapTime', 'Lap Time', 'w-28 px-3 text-right')}
              {sortHeader('delta', 'Δ vs best', 'w-32 px-3 text-right', `Gap to the selected driver's session best (${formatTime(bestLap)})`)}
              {sortHeader('optimalDelta', 'Δ vs optimal', 'w-32 px-3 text-right', `Gap to the best three sectors combined (${formatTime(theoBest)})`)}
              <th scope="col" className="w-44 px-3 py-2.5">Benchmark Pace</th>
              {sortHeader('s1', 'Sector 1', 'w-32 px-3 text-right')}
              {sortHeader('s2', 'Sector 2', 'w-32 px-3 text-right')}
              {sortHeader('s3', 'Sector 3', 'w-32 px-3 text-right')}
              <th scope="col" className="w-16 px-3 py-2.5 text-center">Tire</th>
              {hasTireWearData && <th scope="col" className="w-24 px-3 py-2.5 text-center">Tire Wear</th>}
              {hasFuelData && (
                <th scope="col" className="w-36 px-3 py-2.5 text-center">{hasVirtualEnergyData ? 'Fuel & VE' : 'Fuel'}</th>
              )}
              <th scope="col" className="px-3 py-2.5 text-left">Status</th>
              <th scope="col" className="w-20 px-2 py-2.5 text-center" title="Telemetry & Compare">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-lmu-border/50 font-mono">
            {displayLapEntries.map(({ lap: l, position, detailSections }) => (
              <SessionLapTableRow
                key={l.lapNum}
                session={session}
                selectedDriver={selectedDriver}
                lap={l}
                lapClassPos={position}
                detailSections={detailSections}
                bestLap={bestLap}
                bestS1={bestS1}
                bestS2={bestS2}
                bestS3={bestS3}
                theoBest={theoBest}
                isCurrentSessionAllTimePB={isCurrentSessionAllTimePB}
                isMultiClass={isMultiClass}
                hasTireWearData={hasTireWearData}
                hasFuelData={hasFuelData}
                isExpanded={expandedLaps.has(l.lapNum)}
                onToggleExpanded={toggleLap}
                columnCount={columnCount}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
