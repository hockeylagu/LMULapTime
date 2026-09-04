import React from 'react';
import { Flag, ShieldCheck, Clock, AlertTriangle } from 'lucide-react';
import { LapData } from '../../../server/types.js';
import {
  getWorstTrackLimitSeverity,
  getTrackLimitBadgeClasses,
} from '../../utils/trackLimits.js';

export interface SessionLapStatusBadgeProps {
  lap: LapData;
  isPitStop: boolean;
  isOutLap: boolean;
  isRaceSession: boolean;
  isInferredLap: boolean;
  incompleteTooltip: string;
}

export const SessionLapStatusBadge: React.FC<SessionLapStatusBadgeProps> = ({
  lap: l,
  isPitStop,
  isOutLap,
  isRaceSession,
  isInferredLap,
  incompleteTooltip,
}) => {
  const hasLapIncidents = Boolean(l.incidentCount && l.incidentCount > 0);
  const hasLapTrackLimits = Boolean(l.trackLimitCount && l.trackLimitCount > 0);
  const hasLapPenalties = Boolean(l.penaltyCount && l.penaltyCount > 0);

  const tlSeverity = getWorstTrackLimitSeverity(l.trackLimits);
  const tlBadgeClass = getTrackLimitBadgeClasses(tlSeverity);

  return (
    <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
      {isPitStop && l.lapTime !== null && l.lapTime > 0 ? (
        <span
          className="px-2 py-0.5 rounded bg-lmu-accent/20 text-lmu-accent text-xs font-semibold"
          title={l.pitStopDurationString ? `Estimated pit loss: ${l.pitStopDurationString}` : undefined}
        >
          PIT STOP
        </span>
      ) : isOutLap ? (
        <span
          className="inline-flex items-center gap-1 text-cyan-400 text-xs font-semibold px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30"
          title="Out Lap (rejoining track from pit lane — excluded from flying consistency)"
        >
          Out Lap
        </span>
      ) : l.lapNum === 1 ? (
        <span
          className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium"
          title={
            isRaceSession
              ? 'Race Start Lap (Standing/Rolling start on cold tires — excluded from average flying pace)'
              : 'Session Start Lap (Pit exit / out-lap from garage — excluded from average flying pace)'
          }
        >
          <Flag className="w-3.5 h-3.5" />
          Start Lap
        </span>
      ) : l.isValid ? (
        <span className="inline-flex items-center gap-1 text-lmu-green text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          Valid
        </span>
      ) : isInferredLap ? (
        <span
          className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium cursor-help"
          title={incompleteTooltip}
        >
          <Clock className="w-3.5 h-3.5" />
          Incomplete
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1 text-lmu-gold text-xs font-medium cursor-help"
          title={incompleteTooltip}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Incomplete
        </span>
      )}

      {/* Compact Incident & Penalty Badges */}
      {hasLapIncidents && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 cursor-help"
          title={l.incidents?.map((i) => `💥 ${i.description}`).join('\n')}
        >
          💥 {l.incidentCount}
        </span>
      )}
      {hasLapTrackLimits && (
        <span
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-help ${tlBadgeClass}`}
          title={l.trackLimits?.map((tl) => `⚠️ ${tl.description}`).join('\n')}
        >
          ⚠️ {l.trackLimitCount}
        </span>
      )}
      {hasLapPenalties && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600/30 text-red-200 border border-red-500/50 cursor-help"
          title={l.penalties?.map((p) => `🛑 ${p.description}`).join('\n')}
        >
          🛑 {l.penalties?.[0]?.penalty || 'Pen'}
        </span>
      )}
    </div>
  );
};
