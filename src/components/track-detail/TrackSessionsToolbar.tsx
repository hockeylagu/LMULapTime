import React from 'react';
import { SessionTypePills, HideEmptyToggle, HasReplayToggle, SortDropdown } from '../common';
import { SessionFilterRows, SessionSearchField } from '../session-list/SessionFilterParts.js';
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
  onClearFilters?: () => void;
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
  onClearFilters,
}) => {
  return (
    <SessionFilterRows
      className="pb-4 mb-4 border-b border-lmu-border/50"
      onClear={onClearFilters}
      find={<SessionSearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search car, file, driver..." />}
      order={
        <>
          <SortDropdown value={sortBy} onChange={setSortBy} options={TRACK_DETAIL_SORT_OPTIONS} />
          {viewToggle}
        </>
      }
      narrow={
        <>
          <SessionTypePills selectedType={filterType} onSelectType={setFilterType} />
          <HideEmptyToggle hideEmpty={hideEmpty} onToggle={setHideEmpty} emptyCount={emptyCount} />
          <HasReplayToggle
            hasReplayOnly={hasReplay}
            onToggle={setHasReplay}
            replayCount={replayCount}
            label="Has Replay"
            ariaLabel="Filter sessions with replay"
            titleActive="Showing only sessions with recorded replay (.Vcr). Click to show all."
            titleInactive="Filter to sessions with recorded replay (.Vcr) telemetry."
          />
        </>
      }
    />
  );
};
