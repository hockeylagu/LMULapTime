import React from 'react';
import { Link } from 'react-router';
import { Check, ChevronRight } from 'lucide-react';
import type { CornerHabitTrend } from '../../../../shared/types/corners/cornerAnalysis.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { cornerHabitText, sessionRefLabel } from './cornerHabitText.js';

interface CornerHabitLineProps {
  trend: CornerHabitTrend;
  id: string;
  className: string;
  /** The lap view at the corner, the session's lap against the reference's (`trend.view`); null without one. */
  to: string | null;
}

/**
 * The advice opened under a corner trends row (`cornerHabitText`): the habit to work on, loudest, with what it costs
 * and how often it shows beside it, and the link that shows it in telemetry; then one quiet line on the session
 * before, a fixed habit's tick its only colour.
 */
export const CornerHabitLine: React.FC<CornerHabitLineProps> = ({ trend, id, className, to }) => {
  const { habit, since } = cornerHabitText(trend);
  const evidence = habit?.explained ? trend.habit?.detail : undefined;
  if (!habit && !since) return null;
  const session = sessionRefLabel(trend.session);
  return (
    <div id={id} className={`${className} space-y-1 text-[11px] leading-snug`} data-testid="corner-habit">
      {habit && (
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          {/* A loss no rule explains is an observation, not something to do: it reads at the context's weight. */}
          <span className={habit.explained ? 'text-xs font-medium text-lmu-text' : 'text-xs text-lmu-text-soft'}
            title={evidence || `Your main habit here in ${session}, against that session's reference`}>{habit.line}</span>
          <span className="font-mono tabular-nums text-lmu-text-soft">{habit.loss}</span>
          {habit.seen && <span className="text-lmu-muted">{habit.seen}</span>}
          {to && trend.view && (
            // The row toggles the advice on a click; following the link leaves it as it is.
            <Link to={to} onClick={event => event.stopPropagation()}
              title={`Your usual lap of ${session} through this corner against ${trend.view.reference.name}'s`}
              className={`inline-flex items-center gap-0.5 rounded text-[11px] font-semibold text-lmu-info hover:text-lmu-info-soft ${FOCUS_RING}`}>
              Compare in telemetry <ChevronRight className="w-3 h-3 self-center" aria-hidden="true" />
            </Link>
          )}
        </p>
      )}
      {since && (
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-lmu-muted">
          <span>{since.label}:</span>
          {since.cue && <span className="text-lmu-text-soft">{since.cue}</span>}
          {since.cue && since.fixed && <span aria-hidden="true">·</span>}
          {since.fixed && (
            <span className="inline-flex items-baseline gap-1">
              <Check className="w-3 h-3 shrink-0 self-center text-lmu-gain" aria-hidden="true" />
              <span>fixed: <span className="text-lmu-text-soft">{since.fixed}</span></span>
            </span>
          )}
        </p>
      )}
    </div>
  );
};
