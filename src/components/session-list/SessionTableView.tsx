import React from 'react';
import { SessionListItem } from '../SessionList';
import { SessionTableRow } from './SessionTableRow';
import { PaceCategory } from '../../../server/types';

export interface SessionTableViewProps {
  sessions: SessionListItem[];
  onSelectSession: (sessionId: string) => void;
  showTrackColumn?: boolean;
  resolvePaceBadge: (session: SessionListItem) => { category: PaceCategory; percentage?: number | null } | null;
}

export const SessionTableView: React.FC<SessionTableViewProps> = ({
  sessions,
  onSelectSession,
  showTrackColumn = true,
  resolvePaceBadge,
}) => {
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-left text-xs text-lmu-muted">
        <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border">
          <tr>
            {showTrackColumn && <th className="px-3.5 py-3">Track / Layout</th>}
            <th className="px-3.5 py-3">Session</th>
            <th className="px-3.5 py-3">Date & Time</th>
            <th className="px-3.5 py-3">Car / Class</th>
            <th className="px-3.5 py-3 text-center">Laps</th>
            <th className="px-3.5 py-3 text-right">Best Lap</th>
            <th className="px-3.5 py-3 text-center">Benchmark Pace</th>
            <th className="px-3.5 py-3 text-center">Replay</th>
            <th className="px-3.5 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-lmu-border/50">
          {sessions.map((s) => (
            <SessionTableRow
              key={s.id}
              session={s}
              onSelectSession={onSelectSession}
              showTrackColumn={showTrackColumn}
              paceBadge={resolvePaceBadge(s)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};
