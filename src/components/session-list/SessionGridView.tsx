import React from 'react';
import type { SessionCard } from '../../../shared/types/sessionSummaries.js';
import type { DetailedSession } from '../../../shared/types/session.js';
import { SessionGridCard } from './SessionGridCard';
import type { PaceBadgeValue } from '../common/PaceBadge.js';

export interface SessionGridViewProps {
  sessions: (SessionCard | DetailedSession)[];
  onSelectSession: (sessionId: string) => void;
  onOpenReplay?: (sessionId: string) => void;
  showTrackColumn?: boolean;
  resolvePaceBadge: (session: SessionCard | DetailedSession) => PaceBadgeValue | null;
}

export const SessionGridView: React.FC<SessionGridViewProps> = ({
  sessions,
  onSelectSession,
  onOpenReplay,
  showTrackColumn = true,
  resolvePaceBadge,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
      {sessions.map((s) => (
        <SessionGridCard
          key={s.id}
          session={s}
          onSelectSession={onSelectSession}
          onOpenReplay={onOpenReplay}
          showTrackColumn={showTrackColumn}
          paceBadge={resolvePaceBadge(s)}
        />
      ))}
    </div>
  );
};
