import React from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, X } from 'lucide-react';
import type { ComparableLap, WeatherCondition } from '../../../../../shared/types/index.js';
import { recordedCondition, sessionKindOf, type SessionKind } from '../../../../../shared/domain/compareLapScope.js';
import type { CompareLapControls } from './compareLapControls.js';
import { ReplayCompareLapRow, REPLAY_COMPARE_COLUMNS } from './ReplayCompareLapRow.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { CompareLapPaginationControls, type CompareLapPagination } from './CompareLapPagination.js';
import { useModalFocus } from '../../../common/useModalFocus.js';

export type CompareLapFilter = 'same-session-lap' | 'player' | 'same-sessions' | 'all';

export interface ReplayCompareLapPickerProps {
  pagination?: CompareLapPagination;
  laps: ComparableLap[];
  selectedSessionId: string | null;
  selectedLapNumber: number | null;
  selectedDriverName?: string | null;
  currentLapNumber?: number | null;
  currentDriverName?: string | null;
  currentSessionId?: string | null;
  currentCarType?: string | null;
  currentRaceType?: string | null;
  currentWeatherCondition?: WeatherCondition | null;
  filter: CompareLapFilter;
  controls: CompareLapControls;
  /** Car types of the whole scope, not just this page. */
  carTypes: string[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onChangeFilter: (filter: CompareLapFilter) => void;
  onChangeControls: (controls: CompareLapControls) => void;
  onClose: () => void;
  onSelectLap: (lap: ComparableLap) => void;
}

const FILTER_OPTIONS: Array<{ key: CompareLapFilter; label: string; title: string }> = [
  { key: 'same-session-lap', label: 'Same Session Lap', title: 'Laps from the current session for the player' },
  { key: 'player', label: 'Player', title: 'Player laps across all sessions' },
  { key: 'same-sessions', label: 'Same Sessions', title: 'All drivers from the current session' },
  { key: 'all', label: 'All Drivers', title: 'All drivers across all sessions' },
];

export const ReplayCompareLapPicker: React.FC<ReplayCompareLapPickerProps> = ({
  laps,
  pagination,
  selectedSessionId,
  selectedLapNumber,
  selectedDriverName,
  currentLapNumber,
  currentDriverName,
  currentSessionId,
  currentCarType,
  currentRaceType,
  currentWeatherCondition,
  filter,
  controls,
  carTypes,
  isLoading,
  error,
  onRetry,
  onChangeFilter,
  onChangeControls,
  onClose,
  onSelectLap,
}) => {
  const dialogRef = useModalFocus(true, onClose);
  const normalize = (val?: string | null) => (val || '').toLowerCase().trim();
  const effectiveSessionId = currentSessionId || selectedSessionId || null;
  const matchesIdentity = (lap: ComparableLap, identity: string | null | undefined) => Boolean(identity &&
    lap.sessionId === identity);
  const isCurrent = (lap: ComparableLap) => matchesIdentity(lap, effectiveSessionId) &&
    (currentLapNumber == null || lap.lapNumber === currentLapNumber) &&
    (!currentDriverName || normalize(lap.driverName) === normalize(currentDriverName));
  // Badges only: the filters themselves are applied by the server.
  const exactCurrentLap = laps.find(isCurrent);
  const currentLap = exactCurrentLap ?? laps.find(lap => matchesIdentity(lap, effectiveSessionId));
  const currentCondition = currentWeatherCondition ?? (exactCurrentLap ? recordedCondition(exactCurrentLap.weatherCondition, exactCurrentLap.hasRain) : null);
  const currentCar = currentCarType || currentLap?.carType || null;
  const currentRace: SessionKind | null = currentRaceType
    ? (sessionKindOf(currentRaceType) ?? (currentRaceType as SessionKind))
    : sessionKindOf(currentLap?.sessionType);
  const carOptions = controls.carType === 'all' || carTypes.includes(controls.carType) ? carTypes : [...carTypes, controls.carType];
  const change = (patch: Partial<CompareLapControls>) => onChangeControls({ ...controls, ...patch });

  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Choose comparison lap"
      className="fixed inset-0 z-[1100] flex items-start justify-center bg-black/60 p-4 animate-fade-in">
      <div className="flex h-full min-h-0 w-full max-w-[1200px] flex-col border border-lmu-border bg-lmu-strip shadow-2xl rounded-xl overflow-hidden">
        <div className="shrink-0 px-4 py-3 border-b border-lmu-border/60 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">Available laps with replay telemetry</p>
              <p className="text-xs text-lmu-muted">Choose a baseline from this session, player history, or all drivers.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg text-lmu-muted hover:text-white hover:bg-lmu-card transition-colors shrink-0 ${FOCUS_RING}`}
              aria-label="Close comparison lap picker"
              title="Close lap picker"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 overflow-x-auto">
            <div className="flex items-center gap-2 shrink-0">
              {/* Session Scope Tabs */}
              <div className="flex items-center gap-1 rounded-lg bg-lmu-bg border border-lmu-border p-0.5 shrink-0">
                {FILTER_OPTIONS.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onChangeFilter(option.key)}
                    title={option.title}
                    aria-label={option.label}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                      filter === option.key ? 'bg-lmu-accent text-white' : 'text-lmu-muted hover:text-white'
                    } ${FOCUS_RING}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {/* Car Filter with Current Car Badge in Dropdown */}
              <select
                aria-label="Filter by car"
                value={controls.carType}
                onChange={event => change({ carType: event.target.value })}
                className="bg-lmu-bg border border-lmu-border rounded-md px-2.5 py-1 text-xs font-bold text-white max-w-[190px] truncate"
                title="Filter by car"
              >
                <option value="all">All Cars</option>
                {carOptions.map(car => (
                  <option key={car} value={car}>
                    {car === currentCar ? `🏎️ ${car} (Current)` : car}
                  </option>
                ))}
              </select>

              {/* Race Type Filter with Current Race Type Badge in Dropdown */}
              <select
                aria-label="Filter by race type"
                value={controls.sessionKind}
                onChange={event => change({ sessionKind: event.target.value as SessionKind | 'all' })}
                className="bg-lmu-bg border border-lmu-border rounded-md px-2.5 py-1 text-xs font-bold text-white"
                title="Filter by race type"
              >
                <option value="all">All Types</option>
                <option value="practice">{currentRace === 'practice' ? '🏁 Practice (Current)' : 'Practice'}</option>
                <option value="quali">{currentRace === 'quali' ? '🏁 Quali (Current)' : 'Quali'}</option>
                <option value="race">{currentRace === 'race' ? '🏁 Race (Current)' : 'Race'}</option>
              </select>
              <select
                aria-label="Filter by condition"
                value={controls.condition}
                onChange={event => change({ condition: event.target.value as CompareLapControls['condition'] })}
                className="bg-lmu-bg border border-lmu-border rounded-md px-2.5 py-1 text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
              >
                <option value="same">Same condition{currentCondition ? ` (${currentCondition})` : ''}</option>
                <option value="all">All conditions</option>
                <option value="Dry">Dry</option>
                <option value="Wet">Wet</option>
                <option value="Dynamic Weather">Dynamic weather</option>
              </select>
            </div>

            {/* Sort Order */}
            <select
              aria-label="Order comparison laps"
              value={controls.sort}
              onChange={event => change({ sort: event.target.value as CompareLapControls['sort'] })}
              className="bg-lmu-bg border border-lmu-border rounded-md px-2.5 py-1 text-xs font-bold text-white shrink-0"
            >
              <option value="lap">Best Lap</option>
              <option value="recent">Most recent</option>
              <option value="driver">Driver</option>
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar px-4">
          {isLoading ? (
            <div role="status" className="flex items-center justify-center gap-2 py-8 text-xs text-lmu-muted">
              <LoaderCircle className="w-4 h-4 animate-spin" /> Loading available laps...
            </div>
          ) : error ? (
            <div role="alert" className="py-8 text-center text-xs space-y-2">
              <p className="text-lmu-loss-soft">{error}</p>
              {onRetry && <button type="button" onClick={onRetry} className={`text-lmu-text-soft underline underline-offset-4 ${FOCUS_RING}`}>Try again</button>}
            </div>
          ) : laps.length === 0 ? (
            <p className="py-8 text-center text-xs text-lmu-muted">
              {filter === 'same-session-lap' && 'No other valid laps found for this driver in the current session.'}
              {filter === 'same-sessions' && 'No other replay-backed laps found in this session.'}
              {filter === 'player' && 'No player replay-backed laps found matching your filters.'}
              {filter === 'all' && 'No replay-backed laps found matching your filters.'}
              <span className="block mt-1">{controls.condition === 'all' ? 'Try changing your filters.' : 'Try All conditions or change your filters.'}</span>
            </p>
          ) : (
            <div className="min-w-[1040px]">
              <div aria-hidden="true" className={`${REPLAY_COMPARE_COLUMNS} sticky top-0 z-10 border-b border-lmu-border bg-lmu-strip px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-lmu-muted`}>
                <span>Session</span>
                <span>Date</span>
                <span>Driver</span>
                <span>Car</span>
                <span className="text-right">Lap</span>
                <span className="text-right">Lap time</span>
                <span>Status</span>
              </div>
              <ul aria-label="Available comparison laps" className="divide-y divide-lmu-border/50">
                {laps.map(lap => {
                  const isSelected = matchesIdentity(lap, selectedSessionId) &&
                    lap.lapNumber === selectedLapNumber &&
                    (!selectedDriverName || lap.driverName === selectedDriverName);
                  return (
                    <li key={lap.id}>
                      <ReplayCompareLapRow
                        lap={lap}
                        isSelected={isSelected}
                        isCurrentLap={isCurrent(lap)}
                        showPlayerBadge={filter === 'same-sessions' || filter === 'all'}
                        onSelect={selected => {
                          onSelectLap(selected);
                          onClose();
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        {pagination && <CompareLapPaginationControls pagination={pagination} loading={isLoading} />}
      </div>
    </div>, document.body
  );
};
