import React, { useState } from 'react';
import { getHashRouteAndParams, updateHashParams } from '../utils/urlParams.js';
import { PaceCategory } from '../../server/types.js';
import { SessionListHeader } from './session-list/SessionListHeader';
import { SessionEmptyState } from './session-list/SessionEmptyState';
import { SessionGridView } from './session-list/SessionGridView';
import { SessionTableView } from './session-list/SessionTableView';

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
  matchingReplayFile?: {
    name: string;
    path: string;
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
}

export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  onSelectSession,
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
}) => {
  const { params: initialParams } = getHashRouteAndParams();
  const [internalViewMode, setInternalViewMode] = useState<'grid' | 'table'>(() => {
    const paramView = initialParams.get('view');
    if (paramView === 'table' || paramView === 'grid') return paramView;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lmu_dashboard_view');
      if (saved === 'table' || saved === 'grid') return saved;
    }
    return 'grid';
  });

  const viewMode = controlledViewMode ?? internalViewMode;

  const handleSetViewMode = (mode: 'grid' | 'table') => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('lmu_dashboard_view', mode);
        } catch {}
      }
      updateHashParams({ view: mode });
    }
  };

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
    <div className="space-y-4">
      <SessionListHeader
        headerTitle={headerTitle}
        headerSubtitle={headerSubtitle}
        headerActions={headerActions}
        viewMode={viewMode}
        onViewModeChange={handleSetViewMode}
      />

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
          showTrackColumn={showTrackColumn}
          resolvePaceBadge={resolvePaceBadge}
        />
      ) : (
        <SessionTableView
          sessions={sessions}
          onSelectSession={onSelectSession}
          showTrackColumn={showTrackColumn}
          resolvePaceBadge={resolvePaceBadge}
        />
      )}
    </div>
  );
};
