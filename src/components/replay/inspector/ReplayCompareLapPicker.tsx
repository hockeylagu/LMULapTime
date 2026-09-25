import React, { useMemo, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { ComparableLap } from '../../../utils/lapComparison.js';
import { ReplayCompareLapRow } from './ReplayCompareLapRow.js';

export type CompareLapFilter = 'same-session-lap' | 'player' | 'same-sessions' | 'all';
export type RaceTypeFilter = 'all' | 'practice' | 'quali' | 'race';

export interface ReplayCompareLapPickerProps {
  laps: ComparableLap[];
  selectedReplayName: string | null;
  selectedLapNumber: number | null;
  selectedDriverName?: string | null;
  currentReplayName?: string | null;
  currentLapNumber?: number | null;
  currentDriverName?: string | null;
  currentSessionId?: string | null;
  currentCarType?: string | null;
  currentRaceType?: string | null;
  filter: CompareLapFilter;
  isLoading: boolean;
  onChangeFilter: (filter: CompareLapFilter) => void;
  onClose: () => void;
  onSelectLap: (lap: ComparableLap) => void;
}

const FILTER_OPTIONS: Array<{ key: CompareLapFilter; label: string; title: string }> = [
  { key: 'same-session-lap', label: 'Same Session Lap', title: 'Laps from the current session for the player' },
  { key: 'player', label: 'Player', title: 'Player laps across all sessions' },
  { key: 'same-sessions', label: 'Same Sessions', title: 'All drivers from the current session' },
  { key: 'all', label: 'All Drivers', title: 'All drivers across all sessions' },
];

function detectRaceType(lap: { sessionType?: string | null; sessionName?: string | null; matchingReplayFile?: string | null }): RaceTypeFilter | null {
  const combined = `${lap.sessionType || ''} ${lap.sessionName || ''} ${lap.matchingReplayFile || ''}`.toLowerCase();
  if (/quali|qualification|\bq\d\b/i.test(combined)) return 'quali';
  if (/race|\br\d\b/i.test(combined)) return 'race';
  if (/practice|test|warmup|fp\d|\bp\d\b/i.test(combined)) return 'practice';
  return null;
}

function matchesRaceType(lap: ComparableLap, type: RaceTypeFilter): boolean {
  if (type === 'all') return true;
  return detectRaceType(lap) === type;
}

export const ReplayCompareLapPicker: React.FC<ReplayCompareLapPickerProps> = ({
  laps,
  selectedReplayName,
  selectedLapNumber,
  selectedDriverName,
  currentReplayName,
  currentLapNumber,
  currentDriverName,
  currentSessionId,
  currentCarType,
  currentRaceType,
  filter,
  isLoading,
  onChangeFilter,
  onClose,
  onSelectLap,
}) => {
  const [order, setOrder] = useState<'lap-asc' | 'date-desc' | 'driver-asc'>('lap-asc');
  const [selectedCar, setSelectedCar] = useState<string>('all');
  const [selectedRaceType, setSelectedRaceType] = useState<RaceTypeFilter>('all');

  const normalize = (val?: string | null) => (val || '').toLowerCase().trim().replace(/\\/g, '/').split('/').pop() || '';
  const effectiveReplayName = currentReplayName || selectedReplayName || null;

  const currentLap = useMemo(() => {
    if (!effectiveReplayName) return null;
    return (
      laps.find(lap => {
        const matchesReplay = lap.matchingReplayFile && normalize(lap.matchingReplayFile) === normalize(effectiveReplayName);
        if (!matchesReplay) return false;
        const matchesDriver = !currentDriverName || normalize(lap.driverName) === normalize(currentDriverName);
        if (!matchesDriver) return false;
        return currentLapNumber != null ? lap.lapNum === currentLapNumber : true;
      }) ||
      laps.find(lap => Boolean(lap.matchingReplayFile && normalize(lap.matchingReplayFile) === normalize(effectiveReplayName))) ||
      null
    );
  }, [laps, effectiveReplayName, currentDriverName, currentLapNumber]);

  const currentCar = useMemo(() => currentCarType || currentLap?.carType || null, [currentCarType, currentLap]);

  const currentRace = useMemo(() => {
    if (currentRaceType) {
      return (currentRaceType === 'practice' || currentRaceType === 'quali' || currentRaceType === 'race')
        ? (currentRaceType as RaceTypeFilter)
        : detectRaceType({ sessionType: currentRaceType });
    }
    return currentLap ? detectRaceType(currentLap) : null;
  }, [currentRaceType, currentLap]);

  const availableCars = useMemo(() => (
    Array.from(new Set(laps.map(l => l.carType).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b))
  ), [laps]);

  const filteredLaps = useMemo(() => {
    return laps.filter(lap => {
      const normReplay = normalize(lap.matchingReplayFile);
      const isSameSession = Boolean(
        (effectiveReplayName && normReplay && normReplay === normalize(effectiveReplayName)) ||
        (currentSessionId && lap.sessionId && lap.sessionId === currentSessionId)
      );
      const normDriver = normalize(lap.driverName);
      const isPlayer = lap.isPlayer !== false || Boolean(currentDriverName && normDriver && normDriver === normalize(currentDriverName));

      if (filter === 'same-session-lap' && (!isSameSession || !isPlayer)) return false;
      if (filter === 'player' && !isPlayer) return false;
      if (filter === 'same-sessions' && !isSameSession) return false;
      if (selectedCar !== 'all' && lap.carType !== selectedCar) return false;
      return matchesRaceType(lap, selectedRaceType);
    });
  }, [laps, filter, effectiveReplayName, currentSessionId, currentDriverName, selectedCar, selectedRaceType]);

  const orderedLaps = useMemo(() => {
    const sorted = [...filteredLaps].sort((a, b) => {
      if (order === 'date-desc') return (b.dateString || '').localeCompare(a.dateString || '');
      if (order === 'driver-asc') return a.driverName.localeCompare(b.driverName) || (a.lapTime || 999999) - (b.lapTime || 999999);
      return (a.lapTime || 999999) - (b.lapTime || 999999);
    });
    return sorted.slice(0, filter === 'all' ? 80 : 120);
  }, [filteredLaps, order, filter]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4 pt-12 sm:pt-16 animate-fadeIn">
      <div className="w-full max-w-[1040px] border border-lmu-border bg-lmu-strip shadow-2xl rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-lmu-border/60 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">Available laps with replay telemetry</p>
              <p className="text-xs text-lmu-muted">Choose a baseline from this session, player history, or all drivers.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-lmu-muted hover:text-white hover:bg-lmu-card transition-colors shrink-0"
              aria-label="Close comparison lap picker"
              title="Close lap picker"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Session Scope Tabs */}
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-lmu-bg border border-lmu-border p-0.5">
                {FILTER_OPTIONS.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onChangeFilter(option.key)}
                    title={option.title}
                    aria-label={option.label}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                      filter === option.key ? 'bg-lmu-accent text-white' : 'text-lmu-muted hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {/* Car Filter with Current Car Badge in Dropdown */}
              <select
                aria-label="Filter by car"
                value={selectedCar}
                onChange={event => setSelectedCar(event.target.value)}
                className="bg-lmu-bg border border-lmu-border rounded-md px-2.5 py-1 text-xs font-bold text-white max-w-[190px] truncate"
                title="Filter by car"
              >
                <option value="all">All Cars</option>
                {availableCars.map(car => (
                  <option key={car} value={car}>
                    {car === currentCar ? `🏎️ ${car} (Current)` : car}
                  </option>
                ))}
              </select>

              {/* Race Type Filter with Current Race Type Badge in Dropdown */}
              <select
                aria-label="Filter by race type"
                value={selectedRaceType}
                onChange={event => setSelectedRaceType(event.target.value as RaceTypeFilter)}
                className="bg-lmu-bg border border-lmu-border rounded-md px-2.5 py-1 text-xs font-bold text-white"
                title="Filter by race type"
              >
                <option value="all">All Types</option>
                <option value="practice">{currentRace === 'practice' ? '🏁 Practice (Current)' : 'Practice'}</option>
                <option value="quali">{currentRace === 'quali' ? '🏁 Quali (Current)' : 'Quali'}</option>
                <option value="race">{currentRace === 'race' ? '🏁 Race (Current)' : 'Race'}</option>
              </select>
            </div>

            {/* Sort Order */}
            <select
              aria-label="Order comparison laps"
              value={order}
              onChange={event => setOrder(event.target.value as typeof order)}
              className="bg-lmu-bg border border-lmu-border rounded-md px-2.5 py-1 text-xs font-bold text-white"
            >
              <option value="lap-asc">Best Lap</option>
              <option value="date-desc">Most recent</option>
              <option value="driver-asc">Driver</option>
            </select>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto custom-scrollbar px-4 py-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-lmu-muted">
              <LoaderCircle className="w-4 h-4 animate-spin" /> Loading available laps...
            </div>
          ) : orderedLaps.length === 0 ? (
            <p className="py-8 text-center text-xs text-lmu-muted">
              {filter === 'same-session-lap' && 'No other valid laps found for this driver in the current session.'}
              {filter === 'same-sessions' && 'No other replay-backed laps found in this session.'}
              {filter === 'player' && 'No player replay-backed laps found matching your filters.'}
              {filter === 'all' && 'No replay-backed laps found matching your filters.'}
            </p>
          ) : (
            <div className="space-y-1">
              {orderedLaps.map(lap => {
                const isSelected = lap.matchingReplayFile === selectedReplayName &&
                  lap.lapNum === selectedLapNumber &&
                  (!selectedDriverName || lap.driverName === selectedDriverName);
                const isCurrentLap = Boolean(
                  effectiveReplayName && lap.matchingReplayFile &&
                  normalize(lap.matchingReplayFile) === normalize(effectiveReplayName) &&
                  (currentLapNumber == null || lap.lapNum === currentLapNumber) &&
                  (!currentDriverName || normalize(lap.driverName) === normalize(currentDriverName))
                );
                return (
                  <ReplayCompareLapRow
                    key={lap.id}
                    lap={lap}
                    isSelected={isSelected}
                    isCurrentLap={isCurrentLap}
                    onSelect={selected => {
                      onSelectLap(selected);
                      onClose();
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
