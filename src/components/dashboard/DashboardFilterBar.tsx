import React from 'react';
import { VehicleClassPills, SessionTypePills, HideEmptyToggle, SortDropdown, SortOption } from '../common';

export type DashboardSortOption = 'date-desc' | 'date-asc' | 'pos-asc' | 'pace-asc' | 'pace-desc';

export const DASHBOARD_SORT_OPTIONS: readonly SortOption<DashboardSortOption>[] = [
  { value: 'date-desc', label: 'Date (Newest First)' },
  { value: 'date-asc', label: 'Date (Oldest First)' },
  { value: 'pos-asc', label: 'Best Position (P1 First)' },
  { value: 'pace-asc', label: 'Benchmark (Best Pace %)' },
  { value: 'pace-desc', label: 'Benchmark (Slowest Pace %)' },
];

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
  sortBy: DashboardSortOption;
  setSortBy: (sort: DashboardSortOption) => void;
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
  sortBy,
  setSortBy,
}) => {
  return (
    <div className="glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Track Filter */}
        <select
          value={selectedTrack}
          onChange={(e) => setSelectedTrack(e.target.value)}
          className="bg-lmu-bg border border-lmu-border rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-lmu-accent"
        >
          <option value="All">All Tracks ({tracks.length})</option>
          {tracks.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

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

        {/* Search Bar */}
        <input
          type="text"
          placeholder="Search track, car, file..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-lmu-bg border border-lmu-border rounded-xl px-4 py-1.5 text-xs text-white placeholder-lmu-muted focus:outline-none focus:border-lmu-accent w-full md:w-56"
        />

        {/* Hide Empty Results Filter Toggle */}
        <HideEmptyToggle
          hideEmpty={hideEmpty}
          onToggle={setHideEmpty}
          emptyCount={emptyCount}
          label="Hide Empty Results"
        />

        {/* Sort Dropdown (Date / Benchmark Pace) */}
        <SortDropdown
          value={sortBy}
          onChange={setSortBy}
          options={DASHBOARD_SORT_OPTIONS}
        />
      </div>
    </div>
  );
};
