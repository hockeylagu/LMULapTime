import React from 'react';
import { SessionListHeader } from './SessionListHeader.js';
import { SessionEmptyState } from './SessionEmptyState.js';
import { SessionGridView } from './SessionGridView.js';
import { SessionTableView } from './SessionTableView.js';
import { useSessionViewMode } from './useSessionViewMode.js';
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
}) => {
  const { viewMode, setViewMode: handleSetViewMode } = useSessionViewMode(controlledViewMode, onViewModeChange);

  const resolvePaceBadge = (s: SessionListItem) => {
    if (getPaceBadge) {
      return getPaceBadge(s);
    }
    const p = s.playerDriver;
    if (p?.bestLapPaceCategory) {
      return {
        category: p.bestLapPaceCategory,
        percentage: p.bestLapPacePercentage,
      };
    }
    return null;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {!hideHeader && (
        <SessionListHeader
          headerTitle={headerTitle}
          headerSubtitle={headerSubtitle}
          headerActions={headerActions}
          viewMode={viewMode}
          onViewModeChange={handleSetViewMode}
        />
      )}

      {sessions.length === 0 ? (
        <SessionEmptyState
          emptyMessage={emptyMessage}
          onResetFilters={onResetFilters}
          hideEmptyNotice={hideEmptyNotice}
        />
      ) : viewMode === 'grid' ? (
        <SessionGridView
          sessions={sessions}
          onSelectSession={onSelectSession}
          onOpenReplay={onOpenReplay}
          showTrackColumn={showTrackColumn}
          resolvePaceBadge={resolvePaceBadge}
        />
      ) : (
        <SessionTableView
          sessions={sessions}
          onSelectSession={onSelectSession}
          onOpenReplay={onOpenReplay}
          showTrackColumn={showTrackColumn}
          resolvePaceBadge={resolvePaceBadge}
        />
      )}
    </div>
  );
};
