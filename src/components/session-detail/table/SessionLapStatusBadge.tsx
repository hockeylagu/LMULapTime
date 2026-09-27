import React from 'react';
import { AlertTriangle, Ban, Flag, ShieldAlert, Users } from 'lucide-react';
import { LapData } from '../../../../shared/types/index.js';
import { LapStatusBadge } from '../../common/index.js';
import {
  getWorstTrackLimitSeverity,
  getTrackLimitBadgeClasses,
} from '../../../utils/trackLimits.js';
import { NON_REPRESENTATIVE_LABELS, describeLapGaps, describeLapTraffic } from '../../../utils/lapTrafficText.js';

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
  const trafficEvents = describeLapTraffic(l.traffic);
  const trafficLines = [...trafficEvents, ...describeLapGaps(l.traffic)];

  return (
    <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
      {isPitStop && l.lapTime !== null && l.lapTime > 0 ? (
        <LapStatusBadge
          isPitStop
          pitTooltip={l.pitStopDurationString ? `Estimated pit loss: ${l.pitStopDurationString}` : undefined}
        />
      ) : isOutLap ? (
        <LapStatusBadge isOutLap />
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
      ) : (
        <LapStatusBadge isValid={l.isValid} isInferred={isInferredLap} incompleteTooltip={incompleteTooltip} />
      )}

      {l.nonRepresentativeReason && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40 cursor-help"
          title={[
            `${NON_REPRESENTATIVE_LABELS[l.nonRepresentativeReason].title}: left out of the average and consistency`,
            ...trafficLines,
          ].join('\n')}
        >
          {NON_REPRESENTATIVE_LABELS[l.nonRepresentativeReason].label}
        </span>
      )}
      {trafficEvents.length > 0 && (
        <span
          data-testid="lap-traffic"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/30 cursor-help whitespace-nowrap"
          title={trafficLines.join('\n')}
        >
          <Users className="w-3 h-3" /> {trafficEvents.join(' · ')}
        </span>
      )}

      {/* Compact Incident & Penalty Badges */}
      {hasLapIncidents && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 cursor-help"
          title={l.incidents?.map((i) => i.description).join('\n')}
        >
          <ShieldAlert className="w-3 h-3" /> {l.incidentCount}
        </span>
      )}
      {hasLapTrackLimits && (
        <span
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-help ${tlBadgeClass}`}
          title={l.trackLimits?.map((tl) => tl.description).join('\n')}
        >
          <AlertTriangle className="w-3 h-3" /> {l.trackLimitCount}
        </span>
      )}
      {hasLapPenalties && (
        <span
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 cursor-help"
          title={l.penalties?.map((p) => p.description).join('\n')}
        >
          <Ban className="w-3 h-3" /> {l.penalties?.[0]?.penalty || 'Pen'}
        </span>
      )}
    </div>
  );
};

