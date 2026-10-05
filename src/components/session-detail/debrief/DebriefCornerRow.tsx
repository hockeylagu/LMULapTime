import React from 'react';
import { Link } from 'react-router';
import { ChevronRight, Users } from 'lucide-react';
import type { CornerPhase, DebriefCorner } from '../../../utils/sessionDebrief.js';
import { describeTrafficSpell } from '../../../utils/lapTrafficText.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { linkClickHandler } from '../../../utils/linkClick.js';

const PHASE_LABELS: Record<CornerPhase, string> = {
  entry: 'mostly on entry',
  rotation: 'mostly mid-corner',
  exit: 'mostly on exit',
};

export interface DebriefCornerRowProps {
  rank: number;
  corner: DebriefCorner;
  /** Link generator for the corner in telemetry. */
  toLink?: (cornerNumber: number, against: 'reference' | 'technique') => string;
  /** Opens the corner in telemetry against the realistic reference, or the technique (fastest) lap. */
  onOpen: (cornerNumber: number, against: 'reference' | 'technique') => void;
  /** Whether there is a separate technique lap: the evidence then describes it. */
  hasTechnique: boolean;
}

const linkClass = 'shrink-0 inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold text-lmu-info hover:bg-lmu-info-strong/10 border border-transparent hover:border-lmu-info-strong/30 transition-colors cursor-pointer';

/**
 * One corner to work on: what it costs against the realistic target, how often, where in the
 * corner, how the fastest lap drives it, and whether another car was close.
 */
export const DebriefCornerRow: React.FC<DebriefCornerRowProps> = ({ rank, corner, toLink, onOpen, hasTechnique }) => {
  const frequency = corner.lapsSampled !== null
    ? `lost on ${corner.lapsLosing} of ${corner.lapsSampled} laps`
    : 'measured on this lap only';
  const inTraffic = corner.lapsInTraffic > 0 ? ` (${corner.lapsInTraffic} in traffic left out)` : '';

  const refUrl = toLink?.(corner.cornerNumber, 'reference');
  const techUrl = toLink?.(corner.cornerNumber, 'technique');

  return (
    <li className="flex items-start gap-3 py-2.5 border-t border-lmu-border/40 first:border-t-0" data-testid={`debrief-corner-${corner.cornerNumber}`}>
      <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-lmu-raised border border-lmu-rule text-[11px] font-bold text-white flex items-center justify-center">
        {rank}
      </span>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-bold text-white">T{corner.cornerNumber}</span>
          <span className="font-mono text-sm font-bold text-lmu-loss">+{corner.timeLossSec.toFixed(3)}s</span>
          {corner.techniqueLossSec !== null && (
            <span className="font-mono text-xs text-lmu-muted" title="Time lost here against the fastest lap">
              {corner.techniqueLossSec >= 0 ? '+' : ''}{corner.techniqueLossSec.toFixed(3)}s vs fastest
            </span>
          )}
          <span className="text-xs text-lmu-muted">
            {frequency}{inTraffic}
            {corner.worstPhase ? ` · ${PHASE_LABELS[corner.worstPhase]}` : ''}
          </span>
        </div>
        {corner.traffic && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-lmu-warn-strong/10 border border-lmu-warn-strong/30 text-[11px] text-lmu-warn-soft"
            title="Another car was within a second through this corner on this lap: ranked lower, the loss may not be yours"
          >
            <Users className="w-3 h-3" /> {describeTrafficSpell(corner.traffic)}
          </span>
        )}
        {corner.evidence.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-lmu-muted">To match the {hasTechnique ? 'fastest' : 'reference'}:</span>
            {corner.evidence.map((item) => (
              <span key={item} className="px-1.5 py-0.5 rounded bg-lmu-card border border-lmu-rule text-[11px] text-lmu-text">
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end">
        {refUrl ? (
          <Link
            to={refUrl}
            onClick={linkClickHandler(() => onOpen(corner.cornerNumber, 'reference'))}
            className={`${linkClass} ${FOCUS_RING}`}
            aria-label={`Open T${corner.cornerNumber} in telemetry`}
          >
            Open <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <button type="button" onClick={() => onOpen(corner.cornerNumber, 'reference')} className={`${linkClass} ${FOCUS_RING}`} aria-label={`Open T${corner.cornerNumber} in telemetry`}>
            Open <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
        {hasTechnique && (
          techUrl ? (
            <Link
              to={techUrl}
              onClick={linkClickHandler(() => onOpen(corner.cornerNumber, 'technique'))}
              className={`${linkClass} ${FOCUS_RING}`}
              aria-label={`Open T${corner.cornerNumber} against the fastest lap`}
            >
              Fastest <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <button type="button" onClick={() => onOpen(corner.cornerNumber, 'technique')} className={`${linkClass} ${FOCUS_RING}`} aria-label={`Open T${corner.cornerNumber} against the fastest lap`}>
              Fastest <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )
        )}
      </div>
    </li>
  );
};
