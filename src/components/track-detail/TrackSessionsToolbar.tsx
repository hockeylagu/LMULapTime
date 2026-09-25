import React from 'react';
import { Search } from 'lucide-react';
import { SessionTypePills, HideEmptyToggle, HasReplayToggle, SortDropdown } from '../common';
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
  hasReplay: boolean;
  setHasReplay: (hasReplay: boolean) => void;
  replayCount: number;
  sortBy: TrackDetailSortOption;
  setSortBy: (sort: TrackDetailSortOption) => void;
  viewToggle?: React.ReactNode;
}

export const TrackSessionsToolbar: React.FC<TrackSessionsToolbarProps> = ({
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
  viewToggle,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3 pb-4 mb-4 border-b border-lmu-border/50">
      {/* Session Type Filter Pills */}
      <SessionTypePills
        selectedType={filterType}
        onSelectType={setFilterType}
      />

      {/* Search Input */}
      <div className="relative flex-1 min-w-[220px]">
        <Search className="w-3.5 h-3.5 text-lmu-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          placeholder="Search car, file, driver..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-lmu-bg border border-lmu-border rounded-xl pl-9 pr-3.5 h-9 text-xs text-white placeholder-lmu-muted focus:outline-none focus:border-lmu-accent transition-all"
        />
      </div>

      {/* Hide Empty Toggle */}
      <HideEmptyToggle
        hideEmpty={hideEmpty}
        onToggle={setHideEmpty}
        emptyCount={emptyCount}
      />

      <HasReplayToggle
        hasReplayOnly={hasReplay}
        onToggle={setHasReplay}
        replayCount={replayCount}
        label="Has Replay"
        ariaLabel="Filter sessions with replay"
        titleActive="Showing only sessions with recorded replay (.Vcr). Click to show all."
        titleInactive="Filter to sessions with recorded replay (.Vcr) telemetry."
      />

      {/* Sort Dropdown */}
      <SortDropdown
        value={sortBy}
        onChange={setSortBy}
        options={TRACK_DETAIL_SORT_OPTIONS}
      />

      {viewToggle}
    </div>
  );
};
