import React from 'react';
import { Car, ChevronRight, AlertCircle } from 'lucide-react';
import { isSessionEmpty, getDisplayTrackName } from '../../utils/formatters';
import { PaceBadge, ReplayIndicator } from '../common';
import { SessionListItem } from '../SessionList';
import { PaceCategory } from '../../../server/types';

export interface SessionGridCardProps {
  session: SessionListItem;
  onSelectSession: (sessionId: string) => void;
  showTrackColumn?: boolean;
  paceBadge?: { category: PaceCategory; percentage?: number | null } | null;
}

export const SessionGridCard: React.FC<SessionGridCardProps> = ({
  session: s,
  onSelectSession,
  showTrackColumn = true,
  paceBadge: pace,
}) => {
  const p = s.playerDriver;
  const empty = isSessionEmpty(s);
  const displayTrack = s.trackVenue ? getDisplayTrackName(s.trackVenue, s.trackCourse) : '';

  return (
    <div
      onClick={() => onSelectSession(s.id)}
      className={`glass-panel glass-panel-hover p-4 rounded-xl cursor-pointer flex flex-col justify-between space-y-3 relative overflow-hidden ${
        empty ? 'border-amber-500/30 bg-amber-950/10' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wider ${
                s.sessionType === 'Race'
                  ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30'
                  : s.sessionType === 'Qualifying'
                  ? 'bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30'
                  : 'bg-lmu-blue/20 text-lmu-blue border border-lmu-blue/30'
              }`}
            >
              {s.sessionName || s.sessionType}
            </span>
            {s.weatherInfo && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-lmu-bg/80 border border-lmu-border/60 text-lmu-muted">
                {s.weatherInfo}
              </span>
            )}
            {empty && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Empty
              </span>
            )}
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

        <ReplayIndicator replay={s.matchingReplayFile} hideIfEmpty={true} />
      </div>

      {/* Driver / Car / Lap / Timing Info */}
      <div className="pt-2.5 border-t border-lmu-border/60 space-y-1.5 text-xs">
        {/* Row 1: Car & Best Lap */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <Car className="w-3.5 h-3.5 text-lmu-cyan shrink-0" />
            <span className="text-white font-medium truncate" title={p?.carType || 'N/A'}>
              {p ? p.carType : 'N/A'}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 shrink-0 font-mono">
            <span className="text-[10px] text-lmu-muted uppercase">Best:</span>
            <span className="font-bold text-sm text-lmu-gold">
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
            {s.sessionType === 'Race' && p?.position ? (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-lmu-bg/90 border border-lmu-border/70 text-xs font-mono text-white shadow-sm"
                title={p.gridPosition ? `Started P${p.gridPosition} → Finished P${p.position}` : `Finished P${p.position}`}
              >
                <span className="text-lmu-muted text-[10px] uppercase font-sans font-semibold">Finish:</span>
                <strong className={`text-xs font-extrabold ${p.position === 1 ? 'text-lmu-gold' : 'text-white'}`}>
                  P{p.position}
                </strong>
                {p.positionGain !== null && p.positionGain !== undefined && (
                  <span
                    className={`font-bold text-xs ${
                      p.positionGain > 0 ? 'text-lmu-green' : p.positionGain < 0 ? 'text-rose-400' : 'text-slate-400'
                    }`}
                  >
                    ({p.positionGain > 0 ? `+${p.positionGain}` : p.positionGain})
                  </span>
                )}
              </span>
            ) : (s.sessionType === 'Qualifying' || s.sessionName?.toLowerCase().includes('quali')) && p?.position ? (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-lmu-bg/90 border border-lmu-border/70 text-xs font-mono text-white shadow-sm"
                title={`Qualified P${p.position}`}
              >
                <span className="text-lmu-muted text-[10px] uppercase font-sans font-semibold">Qual:</span>
                <strong className={`text-xs font-extrabold ${p.position === 1 ? 'text-lmu-gold' : 'text-lmu-cyan'}`}>
                  P{p.position}
                </strong>
              </span>
            ) : null}
          </div>

          {pace && (
            <PaceBadge
              category={pace.category}
              percentage={pace.percentage}
              size="xs"
              className="shrink-0"
            />
          )}
        </div>
      </div>

      <div className="pt-2 flex items-center justify-between text-xs text-lmu-accent font-semibold group">
        <span>Analyze Sector Details</span>
        <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
      </div>
    </div>
  );
};
