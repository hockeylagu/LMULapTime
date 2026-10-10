import React from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { isSessionEmpty, getDisplayTrackName } from '../../../shared/domain/formatters.js';
import { PaceBadge, ReplayIndicator } from '../common/index.js';
import { CarIdentity } from '../vehicle/index.js';
import { SessionListItem } from './sessionListTypes.js';
import { sessionReplayUrl } from './sessionReplayUrl.js';
import { SessionTypeChip, FinishPosition, EmptyChip } from './SessionRowParts.js';
import { FOCUS_RING } from '../common/buttonStyles.js';
import { linkClickHandler } from '../../utils/linkClick.js';
import type { PaceBadgeValue } from '../common/PaceBadge.js';

export interface SessionTableRowProps {
  session: SessionListItem;
  onSelectSession: (sessionId: string) => void;
  onOpenReplay?: (sessionId: string) => void;
  showTrackColumn?: boolean;
  paceBadge?: PaceBadgeValue | null;
}

export const SessionTableRow: React.FC<SessionTableRowProps> = ({
  session: s,
  onSelectSession,
  onOpenReplay,
  showTrackColumn = true,
  paceBadge: pace,
}) => {
  const p = s.playerDriver;
  const empty = isSessionEmpty(s);
  const displayTrack = s.trackVenue ? getDisplayTrackName(s.trackVenue, s.trackCourse) : '';

  const label = [s.sessionType, displayTrack, s.timeString].filter(Boolean).join(', ');
  const sessionUrl = `/session/${encodeURIComponent(s.id)}`;
  const replayUrl = sessionReplayUrl(s);

  return (
    <tr
      onClick={() => onSelectSession(s.id)}
      tabIndex={0}
      aria-label={`Open session: ${label}`}
      onKeyDown={(e) => {
        // Only the row itself: Enter or Space on an inner button must not also open the session.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectSession(s.id);
        }
      }}
      className={`hover:bg-lmu-cardHover transition-colors cursor-pointer group ${FOCUS_RING}`}
    >
      {/* Track */}
      {showTrackColumn && (
        <td className="px-3.5 py-3 font-semibold text-white">
          <Link
            to={sessionUrl}
            onClick={linkClickHandler(() => onSelectSession(s.id), { stop: true })}
            className="hover:text-lmu-accent-text transition-colors"
          >
            {displayTrack || 'Circuit'}
          </Link>
        </td>
      )}

      {/* Session Type & Name */}
      <td className="px-3.5 py-3">
        <div className="flex items-center gap-2">
          <SessionTypeChip session={s} />
          <FinishPosition session={s} />
          {empty && <EmptyChip />}
        </div>
      </td>

      {/* Date & Time */}
      <td className="px-3.5 py-3 font-mono text-[11px] text-lmu-muted whitespace-nowrap">
        {s.timeString}
      </td>

      {/* Car & Class */}
      <td className="px-3.5 py-3">
        <CarIdentity carType={p?.carType} carClass={p?.carClass} nameClassName="text-white font-medium max-w-[180px]" emptyLabel="N/A" />
      </td>

      {/* Laps */}
      <td className="px-3.5 py-3 text-center font-mono text-lmu-text-soft tabular-nums">
        {p ? p.lapsCount : 0}
      </td>

      {/* Best Lap */}
      <td className="px-3.5 py-3 text-right font-mono font-bold text-sm text-white tabular-nums">
        {p?.bestLapTimeString || '--:--.---'}
      </td>

      {/* Benchmark Pace */}
      <td className="px-3.5 py-3 text-center">
        {pace ? (
          <PaceBadge
            category={pace.category}
            percentage={pace.percentage}
            wet={pace.wet}
            showPercentage={true}
            size="xs"
          />
        ) : (
          <span className="text-lmu-muted text-xs">-</span>
        )}
      </td>

      {/* Actions (Replay + Analyze) */}
      <td className="px-3.5 py-3 text-right whitespace-nowrap">
        <div className="inline-flex items-center justify-end gap-2.5">
          {s.matchingReplayFile && (
            <ReplayIndicator
              sessionId={s.id}
              hasReplay={Boolean(s.matchingReplayFile)}
              hasDuckDbTelemetry={s.hasDuckDbTelemetry || s.matchingReplayFile?.hasDuckDbTelemetry}
              hideIfEmpty
              to={replayUrl}
              onClick={onOpenReplay ? () => onOpenReplay(s.id) : undefined}
            />
          )}
          <Link
            to={sessionUrl}
            onClick={linkClickHandler(() => onSelectSession(s.id), { stop: true })}
            className={`p-1.5 rounded-lg ${FOCUS_RING} text-lmu-muted group-hover:text-white hover:bg-lmu-raised transition-colors cursor-pointer shrink-0 flex items-center justify-center group/btn`}
            title={`Analyze ${displayTrack || 'Session'} Details`}
            aria-label={`Analyze ${displayTrack || 'Session'}`}
          >
            <ChevronRight className="w-4 h-4 transform group-hover/btn:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </td>
    </tr>
  );
};
