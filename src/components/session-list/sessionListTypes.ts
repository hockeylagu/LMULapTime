import React from 'react';
import type { PaceBadgeValue } from '../common/PaceBadge.js';
import type { SessionCard } from '../../../shared/types/sessionSummaries.js';
import type { DetailedSession } from '../../../shared/types/session.js';

export interface SessionListProps {
  sessions: (SessionCard | DetailedSession)[];
  onSelectSession: (sessionId: string) => void;
  onOpenReplay?: (sessionId: string) => void;
  showTrackColumn?: boolean;
  getPaceBadge?: (session: SessionCard | DetailedSession) => PaceBadgeValue | null;
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
