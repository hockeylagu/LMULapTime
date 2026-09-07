import React from 'react';
import { SessionTypePills, HideEmptyToggle, SortDropdown } from '../common';
import { TRACK_DETAIL_SORT_OPTIONS } from './trackDetailSortOptions.js';
import type { TrackDetailSortOption } from './trackDetailSortOptions.js';

export type { TrackDetailSortOption };

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
