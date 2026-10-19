import React from 'react';
import { MapPin, X } from 'lucide-react';
import { VehicleClassPills } from '../common/VehicleClassPills.js';
import { SessionTypePills } from '../common/SessionTypePills.js';
import { HideEmptyToggle } from '../common/HideEmptyToggle.js';
import { HasReplayToggle } from '../common/HasReplayToggle.js';
import { SortDropdown } from '../common/dropdown/SortDropdown.js';
import { Select } from '../common/dropdown/Select.js';
import { SessionFilterRows, SessionSearchField } from '../session-list/SessionFilterParts.js';
import { DASHBOARD_SORT_OPTIONS } from './dashboardSortOptions.js';
import type { DashboardSortOption } from './dashboardSortOptions.js';
import { FOCUS_RING } from '../common/buttonStyles.js';
import type { DashboardTrackFilter } from '../../../shared/types/dashboard.js';

export interface DashboardFilterBarProps {
  tracks: DashboardTrackFilter[];
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
  const isNarrowed = Boolean(selectedTrack) && selectedTrack !== 'All';
  // Use the same full layout name as circuit links and the leaderboard.
  const trackOptions = [
    { value: 'All', label: `All Tracks (${tracks.length})` },
    ...tracks.map((t) => ({ value: t.track, label: t.track })),
  ];

  return (
    <SessionFilterRows
      className={embedded ? 'p-4 border-b border-lmu-border/50' : 'bg-lmu-card border border-lmu-border p-4 rounded-2xl'}
      onClear={onClearFilters}
      find={
        <>
          <SessionSearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search track, car, file..." />
          <div className="relative w-[300px] shrink-0">
            <Select
              aria-label="Filter by track"
              value={selectedTrack}
              onChange={setSelectedTrack}
              options={trackOptions}
              icon={<MapPin aria-hidden="true" className="w-3.5 h-3.5 text-lmu-muted shrink-0" />}
              size="filter"
              className={`w-full ${isNarrowed ? 'pr-9' : ''}`}
            />
            {isNarrowed && (
              <button
                type="button"
                onClick={() => setSelectedTrack('All')}
                className={`absolute right-2 top-1/2 -translate-y-1/2 text-lmu-muted hover:text-white p-0.5 rounded transition-colors ${FOCUS_RING}`}
                title="Reset to All Tracks"
                aria-label="Reset track filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
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
