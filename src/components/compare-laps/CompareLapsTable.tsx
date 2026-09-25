import React from 'react';
import { Gauge, ChevronDown, ChevronUp } from 'lucide-react';
import { ComparableLap } from '../../utils/lapComparison';
import { AvailableLapsSortOption } from './useCompareLapsData';
import { CompareLapsTableRow } from './CompareLapsTableRow';
import { HideEmptyToggle, SortDropdown } from '../common/index.js';

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
    <div className="bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] p-5 rounded-2xl space-y-4">
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
          <HideEmptyToggle
            hideEmpty={hideEmpty}
            onToggle={setHideEmpty}
            emptyCount={emptyCount}
            label="Hide Empty Laps"
            titleHiding="Hiding invalid, pit stop, and empty laps. Click to show all."
            titleShowing="Showing all laps including invalid/pit stops. Click to filter out empty laps."
          />

          <SortDropdown<AvailableLapsSortOption>
            value={availableLapsSort}
            onChange={setAvailableLapsSort}
            options={[
              { value: 'lap-asc', label: 'Best Lap Time (Fastest First)' },
              { value: 'lap-desc', label: 'Slowest Lap Time' },
              { value: 'date-desc', label: 'Most Recent Session (Last)' },
              { value: 'date-asc', label: 'Oldest Session First' },
              { value: 'speed-desc', label: 'Highest Top Speed' },
              { value: 's1-asc', label: 'Best Sector 1 (S1)' },
              { value: 's2-asc', label: 'Best Sector 2 (S2)' },
              { value: 's3-asc', label: 'Best Sector 3 (S3)' },
              { value: 'pace-asc', label: 'Benchmark Pace %' },
            ]}
          />
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
