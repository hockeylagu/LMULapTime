import React from 'react';
import { SessionList, SessionListItem } from '../session-list/SessionList.js';
import { SessionViewModeToggle } from '../session-list/SessionListHeader.js';
import { TrackSessionsToolbar, TrackDetailSortOption } from './TrackSessionsToolbar';
import { PaceCategory } from '../../../server/core/types';

export interface TrackSessionsCardProps {
  trackName: string;
  sortedSessions: SessionListItem[];
  totalSessionsCount: number;
  emptyCount: number;
  hideEmpty: boolean;
  setHideEmpty: (val: boolean) => void;
  hasReplay: boolean;
  setHasReplay: (val: boolean) => void;
  replayCount: number;
  onSelectSession: (id: string) => void;
  onOpenReplay?: (id: string) => void;
  filterType: string;
  setFilterType: (val: string) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  sortBy: TrackDetailSortOption;
  setSortBy: (val: TrackDetailSortOption) => void;
  getPaceBadge: (s: SessionListItem) => { category: PaceCategory; percentage?: number | null } | null;
  onResetFilters?: () => void;
  viewMode: 'grid' | 'table';
  onViewModeChange: (mode: 'grid' | 'table') => void;
}

export const TrackSessionsCard: React.FC<TrackSessionsCardProps> = ({
  trackName: _trackName,
  sortedSessions,
  totalSessionsCount: _totalSessionsCount,
  emptyCount,
  hideEmpty,
  setHideEmpty,
  hasReplay,
  setHasReplay,
  replayCount,
  onSelectSession,
  onOpenReplay,
  filterType,
  setFilterType,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  getPaceBadge,
  onResetFilters,
  viewMode,
  onViewModeChange,
}) => {
  return (
    <div className="bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] p-6 rounded-2xl">
      <TrackSessionsToolbar
        filterType={filterType}
        setFilterType={setFilterType}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        hideEmpty={hideEmpty}
        setHideEmpty={setHideEmpty}
        emptyCount={emptyCount}
        hasReplay={hasReplay}
        setHasReplay={setHasReplay}
        replayCount={replayCount}
        sortBy={sortBy}
        setSortBy={setSortBy}
        viewToggle={<SessionViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />}
      />
      <SessionList
        sessions={sortedSessions}
        onSelectSession={onSelectSession}
        onOpenReplay={onOpenReplay}
        showTrackColumn={false}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        hideHeader
        getPaceBadge={getPaceBadge}
        onResetFilters={onResetFilters}
        hideEmptyNotice={
          hideEmpty && emptyCount > 0 ? (
            <span>
              {emptyCount} empty session{emptyCount > 1 ? 's are' : ' is'} hidden.
            </span>
          ) : undefined
        }
      />
    </div>
  );
};
