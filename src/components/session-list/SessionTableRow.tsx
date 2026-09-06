import React from 'react';
import { Car, ChevronRight, AlertCircle, MapPin } from 'lucide-react';
import { isSessionEmpty, getDisplayTrackName } from '../../utils/formatters';
import { PaceBadge, ReplayIndicator } from '../common';
import { SessionListItem } from '../SessionList';
import { PaceCategory } from '../../../server/types';

export interface SessionTableRowProps {
  session: SessionListItem;
  onSelectSession: (sessionId: string) => void;
  showTrackColumn?: boolean;
  paceBadge?: { category: PaceCategory; percentage?: number | null } | null;
}

export const SessionTableRow: React.FC<SessionTableRowProps> = ({
  session: s,
  onSelectSession,
  showTrackColumn = true,
  paceBadge: pace,
}) => {
  const p = s.playerDriver;
  const empty = isSessionEmpty(s);
  const displayTrack = s.trackVenue ? getDisplayTrackName(s.trackVenue, s.trackCourse) : '';

  return (
    <tr
      onClick={() => onSelectSession(s.id)}
      className={`hover:bg-lmu-card/60 transition-colors cursor-pointer group ${
        empty ? 'bg-amber-950/10' : ''
      }`}
    >
      {/* Track */}
      {showTrackColumn && (
        <td className="px-3.5 py-3 font-medium text-white">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-lmu-accent shrink-0" />
            <span className="font-bold text-white group-hover:text-lmu-accent transition-colors">
              {displayTrack || 'Circuit'}
            </span>
          </div>
        </td>
      )}

      {/* Session Type & Name */}
      <td className="px-3.5 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`px-2 py-0.5 text-[11px] font-bold rounded uppercase tracking-wider ${
              s.sessionType === 'Race'
                ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30'
                : s.sessionType === 'Qualifying'
                ? 'bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30'
                : 'bg-lmu-blue/20 text-lmu-blue border border-lmu-blue/30'
            }`}
          >
            {s.sessionName || s.sessionType}
          </span>
          {s.sessionType === 'Race' && p?.position ? (
            <span
              className="px-2 py-0.5 text-xs font-mono font-bold rounded-lg bg-lmu-bg/90 border border-lmu-border/70 text-white"
              title={p.gridPosition ? `Grid: P${p.gridPosition} → Finish: P${p.position}` : `Finish: P${p.position}`}
            >
              P{p.position}
              {p.positionGain !== null && p.positionGain !== undefined && (
                <span
                  className={`ml-1 font-bold ${
                    p.positionGain > 0 ? 'text-lmu-green' : p.positionGain < 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}
                >
                  ({p.positionGain > 0 ? `+${p.positionGain}` : p.positionGain})
                </span>
              )}
            </span>
          ) : (s.sessionType === 'Qualifying' || s.sessionName?.toLowerCase().includes('quali')) && p?.position ? (
            <span
              className="px-2 py-0.5 text-xs font-mono font-bold rounded-lg bg-lmu-bg/90 border border-lmu-border/70 text-lmu-cyan"
              title={`Qualified P${p.position}`}
            >
              P{p.position}
            </span>
          ) : null}
          {empty && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Empty
            </span>
          )}
        </div>
      </td>

      {/* Date & Time */}
      <td className="px-3.5 py-3 font-mono text-[11px] text-lmu-muted whitespace-nowrap">
        {s.timeString}
      </td>

      {/* Car & Class */}
      <td className="px-3.5 py-3">
        <div className="flex items-center gap-1.5">
          <Car className="w-3.5 h-3.5 text-lmu-cyan shrink-0" />
          <span className="text-white font-medium truncate max-w-[180px]" title={p?.carType || 'N/A'}>
            {p?.carType || 'N/A'}
          </span>
          {p?.carClass && (
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-lmu-bg border border-lmu-border text-lmu-muted">
              {p.carClass}
            </span>
          )}
        </div>
      </td>

      {/* Laps */}
      <td className="px-3.5 py-3 text-center font-mono font-semibold text-white">
        {p ? p.lapsCount : 0}
      </td>

      {/* Best Lap */}
      <td className="px-3.5 py-3 text-right font-mono font-bold text-sm text-lmu-gold">
        {p?.bestLapTimeString || '--:--.---'}
      </td>

      {/* Benchmark Pace */}
      <td className="px-3.5 py-3 text-center">
        {pace ? (
          <PaceBadge
            category={pace.category}
            percentage={pace.percentage}
            showPercentage={true}
            size="xs"
          />
        ) : (
          <span className="text-lmu-muted text-xs">-</span>
        )}
      </td>

      {/* Replay */}
      <td className="px-3.5 py-3 text-center">
        <ReplayIndicator replay={s.matchingReplayFile} />
      </td>

      {/* Action */}
      <td className="px-3.5 py-3 text-right">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-lmu-accent group-hover:text-white transition-colors">
          <span>Analyze</span>
          <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
        </span>
      </td>
    </tr>
  );
};
