import React from 'react';
import { PaceCategory } from '../../../shared/types/index.js';

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
