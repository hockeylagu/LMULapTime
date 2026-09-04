import React from 'react';
import { SessionTypePills, HideEmptyToggle, SortDropdown, SortOption } from '../common';

export type TrackDetailSortOption = 'date-desc' | 'date-asc' | 'pos-asc' | 'pace-asc' | 'pace-desc' | 'lap-asc';

export const TRACK_DETAIL_SORT_OPTIONS: readonly SortOption<TrackDetailSortOption>[] = [
  { value: 'date-desc', label: 'Date (Newest First)' },
  { value: 'date-asc', label: 'Date (Oldest First)' },
  { value: 'pos-asc', label: 'Best Position (P1 First)' },
  { value: 'pace-asc', label: 'Benchmark (Best Pace %)' },
  { value: 'pace-desc', label: 'Benchmark (Slowest Pace %)' },
  { value: 'lap-asc', label: 'Best Lap Time (Fastest)' },
];

export interface TrackSessionsToolbarProps {
  filterType: string;
  setFilterType: (type: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  hideEmpty: boolean;
  setHideEmpty: (hide: boolean) => void;
  emptyCount: number;
  sortBy: TrackDetailSortOption;
  setSortBy: (sort: TrackDetailSortOption) => void;
}

export const TrackSessionsToolbar: React.FC<TrackSessionsToolbarProps> = ({
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
    <>
      {/* Session Type Filter Pills */}
      <SessionTypePills
        selectedType={filterType}
        onSelectType={setFilterType}
      />

      {/* Search Input */}
      <input
        type="text"
        placeholder="Search car, file, driver..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="bg-lmu-bg border border-lmu-border rounded-xl px-3.5 py-1.5 text-xs text-white placeholder-lmu-muted focus:outline-none focus:border-lmu-accent w-full sm:w-48"
      />

      {/* Hide Empty Toggle */}
      <HideEmptyToggle
        hideEmpty={hideEmpty}
        onToggle={setHideEmpty}
        emptyCount={emptyCount}
        label="Hide Empty"
        titleHiding="Hiding empty sessions (0 laps). Click to show all."
        titleShowing="Showing all sessions. Click to filter out empty results."
      />

      {/* Sort Dropdown */}
      <SortDropdown
        value={sortBy}
        onChange={setSortBy}
        options={TRACK_DETAIL_SORT_OPTIONS}
      />
    </>
  );
};
