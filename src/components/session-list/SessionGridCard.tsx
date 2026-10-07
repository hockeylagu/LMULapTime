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
import type { PaceBadgeValue } from '../common/PaceBadge.js';
import { linkClickHandler } from '../../utils/linkClick.js';

export interface SessionGridCardProps {
  session: SessionListItem;
  onSelectSession: (sessionId: string) => void;
  onOpenReplay?: (sessionId: string) => void;
  showTrackColumn?: boolean;
  paceBadge?: PaceBadgeValue | null;
}

export const SessionGridCard: React.FC<SessionGridCardProps> = ({
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
  const replayUrl = sessionReplayUrl(s);

  return (
    <div
      onClick={() => onSelectSession(s.id)}
      className={`bg-lmu-card border border-lmu-border transition-all duration-200 ease-in-out hover:bg-lmu-cardHover hover:border-lmu-rule p-4 rounded-xl cursor-pointer flex flex-col justify-between space-y-3 relative overflow-hidden group`}
    >
      {/* Keyboard & middle-click target for the whole card */}
      <Link
        to={`/session/${encodeURIComponent(s.id)}`}
        aria-label={`Open session: ${label}`}
        onClick={linkClickHandler(() => onSelectSession(s.id), { stop: true })}
        className={`absolute inset-0 rounded-xl cursor-pointer ${FOCUS_RING}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SessionTypeChip session={s} />
            {empty && <EmptyChip />}
          </div>

          {showTrackColumn && displayTrack && (
            <h4 className="font-bold text-white text-base mt-2 truncate leading-tight" title={displayTrack}>
              {displayTrack}
            </h4>
          )}

          <p className={`text-xs text-lmu-muted ${showTrackColumn && displayTrack ? 'mt-0.5' : 'mt-2'}`}>
            {s.timeString}
          </p>
        </div>

        <span className="relative z-10">
        <ReplayIndicator
          replay={s.matchingReplayFile}
          hasDuckDbTelemetry={s.hasDuckDbTelemetry}
          duckdbFilename={s.duckdbFilename}
          hideIfEmpty={true}
          to={replayUrl}
          onClick={onOpenReplay ? () => onOpenReplay(s.id) : undefined}
        />
        </span>
      </div>

      {/* Driver / Car / Lap / Timing Info */}
      <div className="pt-2.5 border-t border-lmu-border/60 space-y-1.5 text-xs">
        {/* Row 1: Car & Best Lap */}
        <div className="flex items-center justify-between gap-2">
          <CarIdentity carType={p?.carType} carClass={p?.carClass} nameClassName="text-white font-medium" emptyLabel="N/A" fallbackIcon />
          <div className="flex items-baseline gap-1.5 shrink-0 font-mono">
            <span className="text-[10px] text-lmu-muted uppercase tracking-wider">Best:</span>
            <span className="font-bold text-sm text-white tabular-nums">
              {p?.bestLapTimeString || '--:--.---'}
            </span>
          </div>
        </div>

        {/* Row 2: Laps + Position & Pace Badge */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lmu-muted text-xs">
              Laps: <strong className="text-white font-mono">{p ? p.lapsCount : 0}</strong>
            </span>
            <FinishPosition session={s} label />
          </div>

          {pace && (
            <PaceBadge
              category={pace.category}
              percentage={pace.percentage}
              wet={pace.wet}
              size="xs"
              className="shrink-0"
            />
          )}
        </div>
      </div>

      <div className="pt-2 flex items-center justify-between text-xs text-lmu-muted group-hover:text-white transition-colors font-semibold">
        <span>Analyze Sector Details</span>
        <ChevronRight className="w-4 h-4" />
      </div>
    </div>
  );
};
