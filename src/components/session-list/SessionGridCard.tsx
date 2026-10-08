import React from 'react';
import { Link } from 'react-router';
import { isSessionEmpty, getDisplayTrackName } from '../../../shared/domain/formatters.js';
import { PaceBadge, ReplayIndicator } from '../common/index.js';
import { CarIdentity } from '../vehicle/index.js';
import { SessionListItem } from './sessionListTypes.js';
import { sessionReplayUrl } from './sessionReplayUrl.js';
import { SessionTypeChip, FinishPosition, EmptyChip } from './SessionRowParts.js';
import { FOCUS_RING } from '../common/buttonStyles.js';
import type { PaceBadgeValue } from '../common/PaceBadge.js';
import { linkClickHandler } from '../../utils/linkClick.js';
import { CIRCUIT_SPECIFICATIONS, getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { getTrackOutlineUrl } from '../../api/trackGeometryApi.js';

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
  const { layoutKey } = getCircuitSpecification(
    s.trackVenue, s.trackCourse, null, s.matchingReplayFile?.name, null, s.trackLengthMeters,
  );
  const [failedOutlineKey, setFailedOutlineKey] = React.useState<string | null>(null);
  const showOutline = Boolean(CIRCUIT_SPECIFICATIONS[layoutKey]) && failedOutlineKey !== layoutKey;

  const label = [s.sessionType, displayTrack, s.timeString].filter(Boolean).join(', ');
  const replayUrl = sessionReplayUrl(s);

  return (
    <div
      onClick={() => onSelectSession(s.id)}
      className="min-w-0 bg-lmu-card border border-lmu-border transition-colors duration-150 hover:bg-lmu-cardHover hover:border-lmu-rule focus-within:border-lmu-rule px-4 py-3 rounded-xl cursor-pointer flex flex-col gap-2 relative group"
    >
      {/* Keyboard & middle-click target for the whole card */}
      <Link
        to={`/session/${encodeURIComponent(s.id)}`}
        aria-label={`Open session: ${label}`}
        onClick={linkClickHandler(() => onSelectSession(s.id), { stop: true })}
        className={`absolute inset-0 rounded-xl cursor-pointer ${FOCUS_RING}`}
      />
      <div className={`flex items-center gap-2 ${showTrackColumn ? 'min-h-16' : 'min-h-12'}`}>
        {showTrackColumn && showOutline && (
          <img
            src={getTrackOutlineUrl(layoutKey)}
            alt=""
            aria-hidden="true"
            width={72}
            height={64}
            className="h-16 w-[72px] shrink-0 object-contain pointer-events-none"
            onError={() => setFailedOutlineKey(layoutKey)}
          />
        )}
        <div className="min-w-0 flex-1">
          {showTrackColumn && displayTrack && (
            <h4 className="font-bold text-lmu-text text-base leading-tight line-clamp-2 break-words" title={displayTrack} dir="auto">
              {displayTrack}
            </h4>
          )}
          {!showTrackColumn && (
            <h4>
              <CarIdentity
                carType={p?.carType}
                carClass={p?.carClass}
                nameClassName="text-lmu-text text-base font-bold leading-tight line-clamp-2"
                className="gap-3"
                logoSize="lg"
                wrap
                emptyLabel="N/A"
                fallbackIcon
              />
            </h4>
          )}

          <p className={`text-[11px] font-mono tabular-nums text-lmu-muted ${displayTrack || !showTrackColumn ? 'mt-1' : ''}`}>
            {s.timeString}
          </p>
          {empty && <div className="mt-1"><EmptyChip /></div>}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          <SessionTypeChip session={s} />
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
      </div>

      {/* Driver / Car / Lap / Timing Info */}
      <div className="pt-2 border-t border-lmu-border/60 space-y-2 text-xs">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div>
            <p className="text-[10px] font-semibold text-lmu-muted uppercase tracking-wider">Best lap</p>
            <div className="h-7 flex items-center mt-0.5">
              <span className="font-mono font-bold text-lg text-lmu-text tabular-nums">
                {p?.bestLapTimeString || '--:--.---'}
              </span>
            </div>
          </div>
          <div className="self-end text-right">
            <div className="h-7 flex items-center justify-end">
              {pace ? (
                <PaceBadge
                  category={pace.category}
                  percentage={pace.percentage}
                  wet={pace.wet}
                  showPercentage
                  size="sm"
                />
              ) : (
                <span className="text-lmu-muted" title="No benchmark pace available">—</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <span className="text-lmu-muted">
              Laps: <strong className="text-lmu-text-soft font-mono tabular-nums">{p ? p.lapsCount : 0}</strong>
            </span>
            <FinishPosition session={s} label />
          </div>
          {showTrackColumn && (
            <CarIdentity
              carType={p?.carType}
              carClass={p?.carClass}
              nameClassName="text-lmu-text-soft font-medium"
              className="justify-end"
              emptyLabel="N/A"
              fallbackIcon
            />
          )}
        </div>
      </div>
    </div>
  );
};
