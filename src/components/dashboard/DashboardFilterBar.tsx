import React, { useRef } from 'react';
import { MapPin, Search, X, ChevronDown } from 'lucide-react';
import { VehicleClassPills, SessionTypePills, HideEmptyToggle, HasReplayToggle, SortDropdown } from '../common';
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
    <div className={embedded ? 'p-4 space-y-2 border-b border-lmu-border/50' : 'bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] p-4 rounded-2xl space-y-2'}>
      {/* Row 1: Content Scope (Track, Car Class, Session Type) */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Track Filter */}
        <div className="h-9 flex-1 min-w-[200px] inline-flex items-center gap-2 bg-lmu-bg border border-lmu-border rounded-xl px-3 text-xs text-white">
          <MapPin className="w-3.5 h-3.5 text-lmu-accent shrink-0 pointer-events-none" />
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

        {/* Vehicle Class Filter Buttons */}
        <VehicleClassPills
          selectedClass={selectedCarClass}
          onSelectClass={setSelectedCarClass}
        />

        {/* Session Type Filter */}
        <SessionTypePills
          selectedType={filterType}
          onSelectType={setFilterType}
        />
      </div>

      {/* Row 2: Search, Refinements & Sorting */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-lmu-border/40">
        {/* Expanded Search Bar */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-lmu-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search track, car, file..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-lmu-bg border border-lmu-border rounded-xl pl-9 pr-8 h-9 text-xs text-white placeholder-lmu-muted focus:outline-none focus:border-lmu-accent transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lmu-muted hover:text-white p-0.5 rounded cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Hide Empty Results Filter Toggle */}
        <HideEmptyToggle
          hideEmpty={hideEmpty}
          onToggle={setHideEmpty}
          emptyCount={emptyCount}
        />

        {/* Has Replay Results Filter Toggle */}
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

        {/* Sort Dropdown (Date / Benchmark Pace) */}
        <SortDropdown
          value={sortBy}
          onChange={setSortBy}
          options={DASHBOARD_SORT_OPTIONS}
        />

        {viewToggle}
      </div>
    </div>
  );
};
