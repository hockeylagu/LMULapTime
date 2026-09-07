import React from 'react';
import { ShieldCheck, Clock, AlertTriangle } from 'lucide-react';
import { resolveLapStatus, LapStatusFlags } from './lapStatus.js';

export interface LapStatusBadgeProps extends LapStatusFlags {
  pitTooltip?: string;
  outLapTooltip?: string;
  incompleteTooltip?: string;
  size?: 'xs' | 'sm';
  className?: string;
}

// Canonical lap status presentation (established in session-detail): pill badges for
// Pit Stop / Out Lap, plain icon+label for Valid / Incomplete. Inferred vs. truly invalid
// share the "Incomplete" wording but differ in icon/color to hint at data confidence.
export const LapStatusBadge: React.FC<LapStatusBadgeProps> = ({
  isPitStop,
  isOutLap,
  isValid,
  isInferred,
  pitTooltip,
  outLapTooltip = 'Out Lap (rejoining track from pit lane — excluded from flying consistency)',
  incompleteTooltip,
  size = 'sm',
  className = '',
}) => {
  const status = resolveLapStatus({ isPitStop, isOutLap, isValid, isInferred });
  const textSize = size === 'xs' ? 'text-[10px]' : 'text-xs';
  const iconSize = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  if (status === 'pit') {
    return (
      <span
        className={`inline-flex items-center rounded px-2 py-0.5 font-semibold bg-lmu-accent/20 text-lmu-accent ${textSize} ${className}`}
        title={pitTooltip}
      >
        PIT STOP
      </span>
    );
  }
  if (status === 'outlap') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 ${textSize} ${className}`}
        title={outLapTooltip}
      >
        Out Lap
      </span>
    );
  }
  if (status === 'valid') {
    return (
      <span className={`inline-flex items-center gap-1 font-medium text-lmu-green ${textSize} ${className}`}>
        <ShieldCheck className={iconSize} />
        Valid
      </span>
    );
  }
  if (status === 'inferred') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-medium text-amber-400 cursor-help ${textSize} ${className}`}
        title={incompleteTooltip}
      >
        <Clock className={iconSize} />
        Incomplete
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium text-lmu-gold cursor-help ${textSize} ${className}`}
      title={incompleteTooltip}
    >
      <AlertTriangle className={iconSize} />
      Incomplete
    </span>
  );
};
