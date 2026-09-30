import React from 'react';
import { ChevronRight } from 'lucide-react';
import { isSessionEmpty, getDisplayTrackName } from '../../../shared/domain/formatters.js';
import { PaceBadge, ReplayIndicator, CarClassBadge } from '../common/index.js';
import { SessionListItem } from './sessionListTypes.js';
import { SessionTypeChip, FinishPosition, EmptyChip } from './SessionRowParts.js';
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

  return (
    <tr
      onClick={() => onSelectSession(s.id)}
      className="hover:bg-lmu-cardHover transition-colors cursor-pointer group"
    >
      {/* Track */}
      {showTrackColumn && (
        <td className="px-3.5 py-3 font-semibold text-white">{displayTrack || 'Circuit'}</td>
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
        <div className="flex items-center gap-1.5">
          <span className="text-white font-medium truncate max-w-[180px]" title={p?.carType || 'N/A'}>
            {p?.carType || 'N/A'}
          </span>
          {p?.carClass && (
            <CarClassBadge
              carClass={p.carClass}
              carType={p.carType}
              size="xs"
            />
          )}
        </div>
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
              replay={s.matchingReplayFile}
              hasDuckDbTelemetry={s.hasDuckDbTelemetry}
              duckdbFilename={s.duckdbFilename}
              hideIfEmpty
              onClick={onOpenReplay ? () => onOpenReplay(s.id) : undefined}
            />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectSession(s.id);
            }}
            className="p-1.5 rounded-lg text-lmu-muted group-hover:text-white hover:bg-lmu-raised transition-colors cursor-pointer shrink-0 flex items-center justify-center group/btn"
            title={`Analyze ${displayTrack || 'Session'} Details`}
            aria-label={`Analyze ${displayTrack || 'Session'}`}
          >
            <ChevronRight className="w-4 h-4 transform group-hover/btn:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </td>
    </tr>
  );
};
