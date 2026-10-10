import React from 'react';
import { PaceCategory } from '../../../shared/types/index.js';
import type { PaceBadgeValue } from '../common/PaceBadge.js';

export interface SessionListItem {
  id: string;
  filename?: string;
  trackVenue?: string;
  trackCourse?: string;
  trackLengthMeters?: number | null;
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
    driverOrdinal?: number;
    bestLapOrdinal?: number | null;
    name?: string;
    carType: string;
    carClass?: string;
    bestLapNum?: number | null;
    bestLapTime: number | null;
    bestLapTimeString: string;
    bestLapPaceCategory?: PaceCategory | null;
    bestLapPacePercentage?: number | null;
    bestLapWet?: boolean;
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
  getPaceBadge?: (session: SessionListItem) => PaceBadgeValue | null;
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
  /** Server already returned the URL-selected page. */
  serverPaginated?: boolean;
  totalCount?: number;
}
