import React from 'react';
import { FileText } from 'lucide-react';
import { SessionList, SessionListItem } from '../SessionList';
import { TrackSessionsToolbar, TrackDetailSortOption } from './TrackSessionsToolbar';
import { PaceCategory } from '../../../server/types';

export interface TrackSessionsCardProps {
  trackName: string;
  sortedSessions: SessionListItem[];
  totalSessionsCount: number;
  emptyCount: number;
  hideEmpty: boolean;
  setHideEmpty: (val: boolean) => void;
  onSelectSession: (id: string) => void;
  filterType: string;
  setFilterType: (val: string) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  sortBy: TrackDetailSortOption;
  setSortBy: (val: TrackDetailSortOption) => void;
  getPaceBadge: (s: SessionListItem) => { category: PaceCategory; percentage?: number | null } | null;
  onResetFilters?: () => void;
}

export const TrackSessionsCard: React.FC<TrackSessionsCardProps> = ({
  trackName,
  sortedSessions,
  totalSessionsCount,
  emptyCount,
  hideEmpty,
  setHideEmpty,
  onSelectSession,
  filterType,
  setFilterType,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  getPaceBadge,
  onResetFilters,
}) => {
  return (
    <div className="glass-panel p-6 rounded-2xl">
      <SessionList
        sessions={sortedSessions}
        onSelectSession={onSelectSession}
        showTrackColumn={false}
        headerTitle={
          <>
            <FileText className="w-5 h-5 text-lmu-accent" />
            <span>
              Sessions Recorded on {trackName} ({sortedSessions.length}
              {hideEmpty && emptyCount > 0 ? ` / ${totalSessionsCount}` : ''})
            </span>
          </>
        }
        headerSubtitle={
          hideEmpty && emptyCount > 0
            ? `Filtering ${emptyCount} empty session${emptyCount > 1 ? 's' : ''}`
            : 'Click any session to view detailed telemetry & sector timings'
        }
        headerActions={
          <TrackSessionsToolbar
            filterType={filterType}
            setFilterType={setFilterType}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            hideEmpty={hideEmpty}
            setHideEmpty={setHideEmpty}
            emptyCount={emptyCount}
            sortBy={sortBy}
            setSortBy={setSortBy}
          />
        }
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
