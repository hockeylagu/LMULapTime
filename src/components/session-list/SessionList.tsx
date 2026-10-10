import React, { useRef } from 'react';
import { SessionListHeader } from './SessionListHeader.js';
import { SessionEmptyState } from './SessionEmptyState.js';
import { SessionGridView } from './SessionGridView.js';
import { SessionTableView } from './SessionTableView.js';
import { useSessionViewMode } from './useSessionViewMode.js';
import { useSessionPage } from './useSessionPage.js';
import { SessionPagination } from './SessionPagination.js';
import { SessionListItem, SessionListProps } from './sessionListTypes.js';

export type { SessionListItem, SessionListProps } from './sessionListTypes.js';

export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  onSelectSession,
  onOpenReplay,
  showTrackColumn = true,
  getPaceBadge,
  emptyMessage = 'No sessions found matching filters.',
  onResetFilters,
  hideEmptyNotice,
  headerTitle,
  headerSubtitle,
  headerActions,
  viewMode: controlledViewMode,
  onViewModeChange,
  hideHeader = false,
  className = '',
  serverPaginated = false,
  totalCount,
}) => {
  const { viewMode, setViewMode: handleSetViewMode } = useSessionViewMode(controlledViewMode, onViewModeChange);
  const total = totalCount ?? sessions.length;
  const { page, pageCount, setPage, start, end } = useSessionPage(total);
  const pageSessions = serverPaginated ? sessions : sessions.slice(start, end);
  const listTopRef = useRef<HTMLDivElement>(null);

  const changePage = (next: number) => {
    setPage(next);
    // The pager sits under the list: bring the first row back into view when it has scrolled away.
    const top = listTopRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) listTopRef.current?.scrollIntoView({ block: 'start' });
  };

  const resolvePaceBadge = (s: SessionListItem) => {
    if (getPaceBadge) {
      return getPaceBadge(s);
    }
    const p = s.playerDriver;
    if (p?.bestLapWet) return { wet: true };
    if (p?.bestLapPaceCategory) {
      return {
        category: p.bestLapPaceCategory,
        percentage: p.bestLapPacePercentage,
      };
    }
    return null;
  };

  return (
    <div ref={listTopRef} className={`space-y-4 scroll-mt-4 ${className}`}>
      {!hideHeader && (
        <SessionListHeader
          headerTitle={headerTitle}
          headerSubtitle={headerSubtitle}
          headerActions={headerActions}
          viewMode={viewMode}
          onViewModeChange={handleSetViewMode}
        />
      )}

      {total === 0 ? (
        <SessionEmptyState
          emptyMessage={emptyMessage}
          onResetFilters={onResetFilters}
          hideEmptyNotice={hideEmptyNotice}
        />
      ) : viewMode === 'grid' ? (
        <SessionGridView
          sessions={pageSessions}
          onSelectSession={onSelectSession}
          onOpenReplay={onOpenReplay}
          showTrackColumn={showTrackColumn}
          resolvePaceBadge={resolvePaceBadge}
        />
      ) : (
        <SessionTableView
          sessions={pageSessions}
          onSelectSession={onSelectSession}
          onOpenReplay={onOpenReplay}
          showTrackColumn={showTrackColumn}
          resolvePaceBadge={resolvePaceBadge}
        />
      )}

      {total > 0 && (
        <SessionPagination page={page} pageCount={pageCount} start={start} end={end} total={total} onPageChange={changePage} />
      )}
    </div>
  );
};
