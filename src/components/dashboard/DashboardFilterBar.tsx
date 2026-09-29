import React, { useRef } from 'react';
import { MapPin, X, ChevronDown } from 'lucide-react';
import { VehicleClassPills, SessionTypePills, HideEmptyToggle, HasReplayToggle, SortDropdown } from '../common';
import { SessionFilterRows, SessionSearchField } from '../session-list/SessionFilterParts.js';
import { DASHBOARD_SORT_OPTIONS } from './dashboardSortOptions.js';
import type { DashboardSortOption } from './dashboardSortOptions.js';

export type { DashboardSortOption };

export interface DashboardFilterBarProps {
  tracks: string[];
  selectedTrack: string;
  setSelectedTrack: (track: string) => void;
  selectedCarClass: string;
  setSelectedCarClass: (carClass: string) => void;
  filterType: string;
  setFilterType: (type: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  hideEmpty: boolean;
  setHideEmpty: (hide: boolean) => void;
  emptyCount: number;
  hasReplay?: boolean;
  setHasReplay?: (hasReplay: boolean) => void;
  replayCount?: number;
  sortBy: DashboardSortOption;
  setSortBy: (sort: DashboardSortOption) => void;
  embedded?: boolean;
  viewToggle?: React.ReactNode;
  /** Present while a filter narrows the list; shows the Clear filters action. */
  onClearFilters?: () => void;
}

export const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({
  tracks,
  selectedTrack,
  setSelectedTrack,
  selectedCarClass,
  setSelectedCarClass,
  filterType,
  setFilterType,
  searchQuery,
  setSearchQuery,
  hideEmpty,
  setHideEmpty,
  emptyCount,
  hasReplay,
  setHasReplay,
  replayCount,
  sortBy,
  setSortBy,
  embedded = false,
  viewToggle,
  onClearFilters,
}) => {
  const trackSelectRef = useRef<HTMLSelectElement>(null);

  const handleOpenTrackSelect = () => {
    try {
      trackSelectRef.current?.showPicker();
    } catch {
      trackSelectRef.current?.focus();
    }
  };

  return (
    <SessionFilterRows
      className={embedded ? 'p-4 border-b border-lmu-border/50' : 'bg-lmu-card border border-lmu-border p-4 rounded-2xl'}
      onClear={onClearFilters}
      find={
        <>
          <SessionSearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search track, car, file..." />
          <div className="h-9 w-[300px] inline-flex items-center gap-2 bg-lmu-bg border border-lmu-border rounded-xl px-3 text-xs text-white">
            <MapPin className="w-3.5 h-3.5 text-lmu-muted shrink-0 pointer-events-none" />
            <select
              ref={trackSelectRef}
              value={selectedTrack}
              onChange={(e) => setSelectedTrack(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer truncate appearance-none"
              aria-label="Filter by track"
            >
              <option value="All" className="bg-lmu-card text-white">
                All Tracks ({tracks.length})
              </option>
              {tracks.map((t) => (
                <option key={t} value={t} className="bg-lmu-card text-white">
                  {t}
                </option>
              ))}
            </select>
            {selectedTrack && selectedTrack !== 'All' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTrack('All');
                }}
                className="text-lmu-muted hover:text-white p-0.5 rounded cursor-pointer shrink-0 transition-colors"
                title="Reset to All Tracks"
                aria-label="Reset track filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <ChevronDown
                className="w-3.5 h-3.5 text-lmu-muted cursor-pointer shrink-0"
                aria-hidden="true"
                onClick={handleOpenTrackSelect}
              />
            )}
          </div>
        </>
      }
      order={
        <>
          <SortDropdown value={sortBy} onChange={setSortBy} options={DASHBOARD_SORT_OPTIONS} />
          {viewToggle}
        </>
      }
      narrow={
        <>
          <VehicleClassPills selectedClass={selectedCarClass} onSelectClass={setSelectedCarClass} />
          <SessionTypePills selectedType={filterType} onSelectType={setFilterType} />
          <HideEmptyToggle hideEmpty={hideEmpty} onToggle={setHideEmpty} emptyCount={emptyCount} />
          {setHasReplay && (
            <HasReplayToggle
              hasReplayOnly={Boolean(hasReplay)}
              onToggle={setHasReplay}
              replayCount={replayCount}
              label="Has Replay"
              ariaLabel="Filter sessions with replay"
              titleActive="Showing only sessions with recorded replay (.Vcr). Click to show all."
              titleInactive="Filter to sessions with recorded replay (.Vcr) telemetry."
            />
          )}
        </>
      }
    />
  );
};
