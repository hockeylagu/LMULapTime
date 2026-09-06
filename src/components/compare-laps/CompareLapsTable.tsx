import React from 'react';
import { Gauge, FilterX, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { ComparableLap } from '../../utils/lapComparison';
import { AvailableLapsSortOption } from './useCompareLapsData';
import { CompareLapsTableRow } from './CompareLapsTableRow';

export interface CompareLapsTableProps {
  selectedTrack: string;
  selectedCarClass: string;
  playerOnly: boolean;
  displayLaps: ComparableLap[];
  emptyCount: number;
  hideEmpty: boolean;
  setHideEmpty: (val: boolean) => void;
  availableLapsSort: AvailableLapsSortOption;
  setAvailableLapsSort: React.Dispatch<React.SetStateAction<AvailableLapsSortOption>>;
  loading: boolean;
  selectedLaps: ComparableLap[];
  baselineLap: ComparableLap | null;
  allTimeBestLapId?: string;
  bestAvailableS1: number | null;
  bestAvailableS2: number | null;
  bestAvailableS3: number | null;
  onToggleLap: (lap: ComparableLap) => void;
}

export const CompareLapsTable: React.FC<CompareLapsTableProps> = ({
  selectedTrack,
  selectedCarClass,
  playerOnly,
  displayLaps,
  emptyCount,
  hideEmpty,
  setHideEmpty,
  availableLapsSort,
  setAvailableLapsSort,
  loading,
  selectedLaps,
  baselineLap,
  allTimeBestLapId,
  bestAvailableS1,
  bestAvailableS2,
  bestAvailableS3,
  onToggleLap,
}) => {
  return (
    <div className="glass-panel p-5 rounded-2xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Gauge className="w-4 h-4 text-lmu-accent" />
            Available Laps on {selectedTrack} ({displayLaps.length} Laps)
          </h3>
          <p className="text-xs text-lmu-muted mt-0.5">
            Filtered by vehicle class <strong className="text-white">{selectedCarClass}</strong> to guarantee fair telemetry comparisons.
            {!playerOnly && <span className="text-lmu-accent"> Showing the fastest 100 all-driver laps.</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setHideEmpty(!hideEmpty)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              hideEmpty
                ? 'bg-lmu-accent/20 border-lmu-accent/60 text-lmu-accent shadow-sm'
                : 'bg-lmu-bg border-lmu-border text-lmu-muted hover:text-white'
            }`}
            title={
              hideEmpty
                ? 'Hiding invalid, pit stop, and empty laps. Click to show all.'
                : 'Showing all laps including invalid/pit stops. Click to filter out empty results.'
            }
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>Hide Empty Laps</span>
            {emptyCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  hideEmpty ? 'bg-lmu-accent text-white' : 'bg-lmu-border text-lmu-muted'
                }`}
              >
                {emptyCount}
              </span>
            )}
          </button>

          <div className="flex items-center gap-1.5 bg-lmu-bg border border-lmu-border rounded-xl px-2.5 py-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-lmu-accent" />
            <label htmlFor="sort-laps-select" className="text-[11px] font-semibold text-lmu-muted uppercase tracking-wider">
              Order:
            </label>
            <select
              id="sort-laps-select"
              value={availableLapsSort}
              onChange={(e) => setAvailableLapsSort(e.target.value as AvailableLapsSortOption)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer pr-1"
            >
              <option value="lap-asc" className="bg-lmu-card text-white">⚡ Best Lap Time (Fastest First)</option>
              <option value="lap-desc" className="bg-lmu-card text-white">🐢 Slowest Lap Time</option>
              <option value="date-desc" className="bg-lmu-card text-white">🕒 Most Recent Session (Last)</option>
              <option value="date-asc" className="bg-lmu-card text-white">📅 Oldest Session First</option>
              <option value="speed-desc" className="bg-lmu-card text-white">🚀 Highest Top Speed</option>
              <option value="s1-asc" className="bg-lmu-card text-white">⏱️ Best Sector 1 (S1)</option>
              <option value="s2-asc" className="bg-lmu-card text-white">⏱️ Best Sector 2 (S2)</option>
              <option value="s3-asc" className="bg-lmu-card text-white">⏱️ Best Sector 3 (S3)</option>
              <option value="pace-asc" className="bg-lmu-card text-white">🏆 Benchmark Pace %</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-lmu-muted">
          <div className="inline-block animate-spin w-6 h-6 border-2 border-lmu-accent border-t-transparent rounded-full mb-2" />
          <p className="text-xs font-medium">Scanning sessions on {selectedTrack}...</p>
        </div>
      ) : displayLaps.length === 0 ? (
        <div className="py-8 text-center text-lmu-muted text-xs">
          <p>No completed laps found for {selectedTrack} in {selectedCarClass}.</p>
          {hideEmpty && emptyCount > 0 && (
            <p className="mt-2 text-lmu-muted">
              Note: {emptyCount} invalid / pit / empty lap{emptyCount > 1 ? 's are' : ' is'} hidden.{' '}
              <button
                type="button"
                onClick={() => setHideEmpty(false)}
                className="text-lmu-accent underline hover:text-white font-semibold cursor-pointer"
              >
                Click here to show empty laps
              </button>
              .
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs text-lmu-muted">
            <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border select-none">
              <tr>
                <th className="px-3 py-3">Action</th>
                <th
                  onClick={() => setAvailableLapsSort((prev) => (prev === 'date-desc' ? 'date-asc' : 'date-desc'))}
                  className="px-3 py-3 cursor-pointer hover:text-lmu-accent transition-colors"
                  title="Sort by Session Date (Recent / Oldest)"
                >
                  <div className="flex items-center gap-1">
                    Session & Date
                    {availableLapsSort === 'date-desc' && <ChevronDown className="w-3 h-3 text-lmu-accent" />}
                    {availableLapsSort === 'date-asc' && <ChevronUp className="w-3 h-3 text-lmu-accent" />}
                  </div>
                </th>
                <th className="px-3 py-3">Driver & Car</th>
                <th className="px-3 py-3 text-center">Lap</th>
                <th
                  onClick={() => setAvailableLapsSort((prev) => (prev === 'lap-asc' ? 'lap-desc' : 'lap-asc'))}
                  className="px-3 py-3 text-right cursor-pointer hover:text-lmu-accent transition-colors"
                  title="Sort by Lap Time (Best / Slowest)"
                >
                  <div className="flex items-center justify-end gap-1">
                    Lap Time
                    {availableLapsSort === 'lap-asc' && <ChevronDown className="w-3 h-3 text-lmu-accent" />}
                    {availableLapsSort === 'lap-desc' && <ChevronUp className="w-3 h-3 text-lmu-accent" />}
                  </div>
                </th>
                <th
                  onClick={() => setAvailableLapsSort('pace-asc')}
                  className="px-3 py-3 text-center cursor-pointer hover:text-lmu-accent transition-colors"
                  title="Sort by Benchmark Pace Percentage"
                >
                  <div className="flex items-center justify-center gap-1">
                    Pace
                    {availableLapsSort === 'pace-asc' && <ChevronDown className="w-3 h-3 text-lmu-accent" />}
                  </div>
                </th>
                <th
                  onClick={() => setAvailableLapsSort('s1-asc')}
                  className="px-3 py-3 text-right cursor-pointer hover:text-lmu-gold transition-colors"
                  title="Sort by Sector 1 (S1)"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-lmu-gold/90">S1</span>
                    {availableLapsSort === 's1-asc' && <ChevronDown className="w-3 h-3 text-lmu-gold" />}
                  </div>
                </th>
                <th
                  onClick={() => setAvailableLapsSort('s2-asc')}
                  className="px-3 py-3 text-right cursor-pointer hover:text-lmu-blue transition-colors"
                  title="Sort by Sector 2 (S2)"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-lmu-blue/90">S2</span>
                    {availableLapsSort === 's2-asc' && <ChevronDown className="w-3 h-3 text-lmu-blue" />}
                  </div>
                </th>
                <th
                  onClick={() => setAvailableLapsSort('s3-asc')}
                  className="px-3 py-3 text-right cursor-pointer hover:text-lmu-green transition-colors"
                  title="Sort by Sector 3 (S3)"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-lmu-green/90">S3</span>
                    {availableLapsSort === 's3-asc' && <ChevronDown className="w-3 h-3 text-lmu-green" />}
                  </div>
                </th>
                <th
                  onClick={() => setAvailableLapsSort((prev) => (prev === 'speed-desc' ? 'speed-asc' : 'speed-desc'))}
                  className="px-3 py-3 text-right cursor-pointer hover:text-lmu-accent transition-colors"
                  title="Sort by Top Speed"
                >
                  <div className="flex items-center justify-end gap-1">
                    Top Speed
                    {availableLapsSort === 'speed-desc' && <ChevronDown className="w-3 h-3 text-lmu-accent" />}
                    {availableLapsSort === 'speed-asc' && <ChevronUp className="w-3 h-3 text-lmu-accent" />}
                  </div>
                </th>
                <th className="px-3 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lmu-border/50 font-mono">
              {displayLaps.map((lap) => (
                <CompareLapsTableRow
                  key={lap.id}
                  lap={lap}
                  isSelected={selectedLaps.some((l) => l.id === lap.id)}
                  isBaseline={baselineLap?.id === lap.id}
                  isAllTimePB={allTimeBestLapId === lap.id}
                  bestAvailableS1={bestAvailableS1}
                  bestAvailableS2={bestAvailableS2}
                  bestAvailableS3={bestAvailableS3}
                  onToggleLap={onToggleLap}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
