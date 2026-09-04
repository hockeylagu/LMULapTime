import React from 'react';
import { SessionListItem } from '../SessionList';
import { SessionGridCard } from './SessionGridCard';
import { PaceCategory } from '../../../server/types';

export interface SessionGridViewProps {
  sessions: SessionListItem[];
  onSelectSession: (sessionId: string) => void;
  showTrackColumn?: boolean;
  resolvePaceBadge: (session: SessionListItem) => { category: PaceCategory; percentage?: number | null } | null;
}

export const SessionGridView: React.FC<SessionGridViewProps> = ({
  sessions,
  onSelectSession,
  showTrackColumn = true,
  resolvePaceBadge,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sessions.map((s) => (
        <SessionGridCard
          key={s.id}
          session={s}
          onSelectSession={onSelectSession}
          showTrackColumn={showTrackColumn}
          paceBadge={resolvePaceBadge(s)}
        />
      ))}
    </div>
  );
};
