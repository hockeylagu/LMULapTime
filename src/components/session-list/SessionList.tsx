import React from 'react';
import { PaceCategory } from '../../../server/core/types';
import { SessionListHeader } from './SessionListHeader.js';
import { SessionEmptyState } from './SessionEmptyState.js';
import { SessionGridView } from './SessionGridView.js';
import { SessionTableView } from './SessionTableView.js';
import { useSessionViewMode } from './useSessionViewMode.js';

export interface SessionListItem {
  id: string;
  filename?: string;
  trackVenue?: string;
  trackCourse?: string;
  timeString: string;
  sessionType: string;
  sessionName?: string;
  weatherInfo?: string;
  driversCount?: number;
  hasDuckDbTelemetry?: boolean;
  duckdbFilename?: string;
  matchingReplayFile?: {
    name: string;
    path: string;
    hasDuckDbTelemetry?: boolean;
    duckdbFilename?: string;
  };
  playerDriver?: {
    name?: string;
    carType: string;
    carClass?: string;
    bestLapTime: number | null;
    bestLapTimeString: string;
    bestLapPaceCategory?: PaceCategory | null;
    bestLapPacePercentage?: number | null;
    position?: number;
    gridPosition?: number | null;
    positionGain?: number | null;
    lapsCount: number;
  };
}

export interface SessionListProps {
  sessions: SessionListItem[];
  onSelectSession: (sessionId: string) => void;
  onOpenReplay?: (sessionId: string) => void;
  showTrackColumn?: boolean;
  getPaceBadge?: (session: SessionListItem) => { category: PaceCategory; percentage?: number | null } | null;
  emptyMessage?: string;
  onResetFilters?: () => void;
  hideEmptyNotice?: React.ReactNode;
  headerTitle?: React.ReactNode;
  headerSubtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  viewMode?: 'grid' | 'table';
  onViewModeChange?: (mode: 'grid' | 'table') => void;
  hideHeader?: boolean;
  className?: string;
}

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
