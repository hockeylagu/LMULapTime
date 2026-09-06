import React, { useMemo, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import { ComparableLap } from '../../utils/lapComparison.js';

export interface ReplayCompareLapPickerProps {
  laps: ComparableLap[];
  selectedReplayName: string | null;
  selectedLapNumber: number | null;
  selectedDriverName?: string | null;
  filter: 'player' | 'all';
  isLoading: boolean;
  onChangeFilter: (filter: 'player' | 'all') => void;
  onClose: () => void;
  onSelectLap: (lap: ComparableLap) => void;
}

export const ReplayCompareLapPicker: React.FC<ReplayCompareLapPickerProps> = ({
  laps,
  selectedReplayName,
  selectedLapNumber,
  selectedDriverName,
  filter,
  isLoading,
  onChangeFilter,
  onClose,
  onSelectLap,
}) => (
  <PickerBody
    laps={laps}
    selectedReplayName={selectedReplayName}
    selectedLapNumber={selectedLapNumber}
    selectedDriverName={selectedDriverName}
    filter={filter}
    isLoading={isLoading}
    onChangeFilter={onChangeFilter}
    onClose={onClose}
    onSelectLap={onSelectLap}
  />
);

const PickerBody: React.FC<ReplayCompareLapPickerProps> = ({
  laps,
  selectedReplayName,
  selectedLapNumber,
  selectedDriverName,
  filter,
  isLoading,
  onChangeFilter,
  onClose,
  onSelectLap,
}) => {
  const [order, setOrder] = useState<'lap-asc' | 'date-desc' | 'driver-asc'>('lap-asc');
  const orderedLaps = useMemo(() => {
    const sorted = [...laps].sort((a, b) => {
      if (order === 'date-desc') return (b.dateString || '').localeCompare(a.dateString || '');
      if (order === 'driver-asc') return a.driverName.localeCompare(b.driverName) || (a.lapTime || 999999) - (b.lapTime || 999999);
      return (a.lapTime || 999999) - (b.lapTime || 999999);
    });
    return sorted.slice(0, filter === 'all' ? 40 : 60);
  }, [laps, order, filter]);

  return (
  <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4 pt-16 sm:pt-24 animate-fadeIn">
  <div className="w-full max-w-[860px] border border-lmu-border bg-[#0a0e17] shadow-2xl rounded-xl overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-lmu-border/60">
      <div className="min-w-0">
        <p className="text-xs font-bold text-white">Available laps with replay telemetry</p>
        <p className="text-[10px] text-lmu-muted">Choose a baseline from the player laps or all matching drivers.</p>
      </div>
      <div className="flex items-center gap-1 rounded-lg bg-lmu-bg border border-lmu-border p-0.5">
        {(['player', 'all'] as const).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => {
              onChangeFilter(option);
            }}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
              filter === option ? 'bg-lmu-accent text-white' : 'text-lmu-muted hover:text-white'
            }`}
          >
            {option === 'player' ? 'Player' : 'All Drivers'}
          </button>
        ))}
      </div>
      <select
        aria-label="Order comparison laps"
        value={order}
        onChange={event => setOrder(event.target.value as typeof order)}
        className="bg-lmu-bg border border-lmu-border rounded-md px-2 py-1 text-[10px] font-bold text-white"
      >
        <option value="lap-asc">Best lap</option>
        <option value="date-desc">Most recent</option>
        <option value="driver-asc">Driver</option>
      </select>
      <button
        type="button"
        onClick={() => {
          onClose();
        }}
        className="p-1 rounded-md text-lmu-muted hover:text-white hover:bg-lmu-card"
        aria-label="Close comparison lap picker"
        title="Close lap picker"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>

    <div className="max-h-64 overflow-y-auto custom-scrollbar px-4 py-2">
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-lmu-muted">
          <LoaderCircle className="w-4 h-4 animate-spin" /> Loading available laps...
        </div>
      ) : laps.length === 0 ? (
        <p className="py-6 text-center text-xs text-lmu-muted">No replay-backed laps found for this track and class.</p>
      ) : (
        <div className="space-y-1">
          {orderedLaps.map(lap => {
            const isSelected = lap.matchingReplayFile === selectedReplayName &&
              lap.lapNum === selectedLapNumber &&
              (!selectedDriverName || lap.driverName === selectedDriverName);
            return (
              <button
                key={lap.id}
                type="button"
                onClick={() => {
                  onSelectLap(lap);
                  onClose();
                }}
                className={`w-full grid grid-cols-[minmax(150px,1.4fr)_minmax(120px,1fr)_50px_90px] items-center gap-3 rounded-lg px-3 py-2 text-left text-[11px] transition-colors ${
                  isSelected ? 'bg-lmu-accent/10 border border-lmu-accent/40' : 'border border-transparent hover:bg-lmu-card'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-white">{lap.sessionName || 'Session'} ({lap.sessionType || 'Session'})</span>
                  <span className="block truncate text-[10px] text-lmu-muted">{lap.dateString} | {lap.matchingReplayFile}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-white">{lap.driverName}</span>
                  <span className="block truncate text-[10px] text-lmu-muted">{lap.carType}</span>
                </span>
                <span className="text-center font-mono text-lmu-muted">L{lap.lapNum}</span>
                <span className={`flex items-center justify-end gap-1 font-mono font-bold ${lap.isAllTimePB ? 'text-lmu-gold' : lap.isSessionBest ? 'text-lmu-blue' : 'text-white'}`}>
                  {isSelected && <Check className="w-3 h-3 text-lmu-accent" />}
                  {lap.lapTimeString}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  </div>
  </div>
  );
};
