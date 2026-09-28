import React from 'react';
import {
  AlertTriangle, Ban, CarFront, CircleAlert, Clock, CloudRain, Droplets, Flag, LogOut, ShieldAlert, ShieldCheck, Snail, Users, Wrench,
  type LucideIcon,
} from 'lucide-react';
import { LapData, NonRepresentativeReason } from '../../../../shared/types/index.js';
import { resolveLapStatus } from '../../common/lapStatus.js';
import { getWorstTrackLimitSeverity, getTrackLimitBadgeClasses } from '../../../utils/trackLimits.js';
import { NON_REPRESENTATIVE_LABELS } from '../../../utils/lapTrafficText.js';
import { CONDITIONS_NOTE, describeRain } from './lapDetailSections.js';

export interface SessionLapStatusBadgeProps {
  lap: LapData;
  isPitStop: boolean;
  isOutLap: boolean;
  isRaceSession: boolean;
  isInferredLap: boolean;
  incompleteTooltip: string;
}

interface StatusIconProps {
  icon: LucideIcon;
  /** Read by screen readers and tests; the icon alone is shown. */
  label: string;
  title: string;
  className: string;
  count?: number;
}

function StatusIcon({ icon: Icon, label, title, className, count }: StatusIconProps) {
  return (
    <span className={`inline-flex items-center gap-0.5 cursor-help ${className}`} title={title}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {count !== undefined && <span className="text-[10px] font-bold">{count}</span>}
      <span className="sr-only">{label}</span>
    </span>
  );
}

const REASON_ICONS: Record<NonRepresentativeReason, LucideIcon> = {
  traffic: Users,
  contact: CarFront,
  offPace: Snail,
};

const badge = 'px-1 py-0.5 rounded border';

/**
 * The lap's status as a row of icons, each explained by its tooltip: valid, start, pit, out-lap or
 * incomplete; rain and wet tyres (none on a dry lap); why it is left out of the average; incidents,
 * track limits and penalties. The details
 * are in the lap's expanded row.
 */
export const SessionLapStatusBadge: React.FC<SessionLapStatusBadgeProps> = ({
  lap: l,
  isPitStop,
  isOutLap,
  isRaceSession,
  isInferredLap,
  incompleteTooltip,
}) => {
  const status = isPitStop && l.lapTime !== null && l.lapTime > 0
    ? 'pit'
    : isOutLap
    ? 'outlap'
    : l.lapNum === 1
    ? 'start'
    : resolveLapStatus({ isValid: l.isValid, isInferred: isInferredLap });
  const reason = l.nonRepresentativeReason;

  return (
    <div className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
      {status === 'pit' && (
        <StatusIcon icon={Wrench} label="Pit Stop" className="text-lmu-accent"
          title={l.pitStopDurationString ? `Estimated pit loss: ${l.pitStopDurationString}` : 'Pit stop'} />
      )}
      {status === 'outlap' && (
        <StatusIcon icon={LogOut} label="Out Lap" className="text-cyan-400"
          title="Out lap (rejoining the track from the pit lane, left out of flying pace)" />
      )}
      {status === 'start' && (
        <StatusIcon icon={Flag} label="Start Lap" className="text-amber-400"
          title={isRaceSession
            ? 'Race start lap (standing or rolling start on cold tyres, left out of flying pace)'
            : 'Session start lap (out of the garage, left out of flying pace)'} />
      )}
      {status === 'valid' && <StatusIcon icon={ShieldCheck} label="Valid" className="text-lmu-green" title="Valid lap" />}
      {status === 'inferred' && <StatusIcon icon={Clock} label="Incomplete" className="text-amber-400" title={incompleteTooltip} />}
      {status === 'invalid' && <StatusIcon icon={CircleAlert} label="Incomplete" className="text-lmu-gold" title={incompleteTooltip} />}

      {l.conditions?.rain !== undefined && (
        <StatusIcon icon={CloudRain} label="Rain" className="text-sky-400" title={`${describeRain(l.conditions.rain)}: ${CONDITIONS_NOTE}`} />
      )}
      {l.conditions?.wetTyres && (
        <StatusIcon icon={Droplets} label="Wet tyres" className="text-sky-300" title={`On wet tyres: ${CONDITIONS_NOTE}`} />
      )}
      {reason && (
        <StatusIcon icon={REASON_ICONS[reason]} label={NON_REPRESENTATIVE_LABELS[reason].label}
          className={`${badge} bg-amber-500/15 text-amber-300 border-amber-500/40`}
          title={`${NON_REPRESENTATIVE_LABELS[reason].title}: left out of the average and consistency`} />
      )}
      {Boolean(l.incidentCount) && (
        <StatusIcon icon={ShieldAlert} label="Incidents" count={l.incidentCount}
          className={`${badge} bg-rose-500/20 text-rose-300 border-rose-500/40`}
          title={l.incidents?.map((i) => i.description).join('\n') ?? 'Incidents'} />
      )}
      {Boolean(l.trackLimitCount) && (
        <StatusIcon icon={AlertTriangle} label="Track limits" count={l.trackLimitCount}
          className={`${badge} ${getTrackLimitBadgeClasses(getWorstTrackLimitSeverity(l.trackLimits))}`}
          title={l.trackLimits?.map((tl) => tl.description).join('\n') ?? 'Track limits'} />
      )}
      {Boolean(l.penaltyCount) && (
        <StatusIcon icon={Ban} label={l.penalties?.[0]?.penalty || 'Penalty'}
          className={`${badge} bg-rose-500/20 text-rose-300 border-rose-500/40`}
          title={l.penalties?.map((p) => p.description).join('\n') ?? 'Penalty'} />
      )}
    </div>
  );
};
