import React from 'react';
import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import type { CornerHabitTrend } from '../../../../shared/types/corners/cornerAnalysis.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../common/buttonStyles.js';
import { costChangeTone, CostSparkline, formatCostSec } from '../../common/CostSparkline.js';
import { SlippingTag } from '../../common/HabitTags.js';
import { cornerHabitText, sessionRefLabel } from './cornerHabitText.js';
import { habitSpeedLine } from '../../session-detail/debrief/habitText.js';

/** Making the corner a focus or handing its slot back; `error` is the server's refusal ("Unpin one first"). */
export interface CornerPinControl {
  onChange: (pinned: boolean) => void;
  error: string | null;
}

interface CornerHabitLineProps {
  trend: CornerHabitTrend;
  id: string;
  className: string;
  /** The lap view at the corner, the session's lap against the reference's (`trend.view`); null without one. */
  to: string | null;
  /** Null when the corner cannot be pinned (the car is unknown). */
  pin: CornerPinControl | null;
}

/**
 * What opens under a corner trends row (`cornerHabitText`): the habit to work on, loudest, with what the corner costs
 * against the target and the link that shows it in telemetry; the one thing to try; the cost and the habit's gap over
 * the last sessions; and the driver's own choice of focus.
 */
export const CornerHabitLine: React.FC<CornerHabitLineProps> = ({ trend, id, className, to, pin }) => {
  const { habit, tryLine, tryTitle, cost, gapSeries } = cornerHabitText(trend);
  const speedCue = habitSpeedLine(trend.habit);
  const session = sessionRefLabel(trend.session);
  const costs = trend.series.map(point => point.costSec);
  const hasCostTrend = costs.length > 1;
  const costTone = hasCostTrend ? costChangeTone(costs[costs.length - 1] - costs[0]) : 'text-lmu-text-soft';
  const hasFooter = Boolean(hasCostTrend || gapSeries || pin);
  return (
    // The row toggles on a click; a click in here (a link, a button) leaves it as it is.
    <div id={id} className={`${className} space-y-1.5 text-xs`} data-testid="corner-habit">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          {/* A loss no rule explains is an observation, not something to do: it reads at the context's weight. */}
          <span className={habit?.explained ? 'text-[13px] leading-5 font-semibold text-white' : 'text-[13px] leading-5 text-lmu-text-soft'}
            title={(habit?.explained && trend.habit?.detail) || `Your habit here in ${session}, against the target`}>
            {habit?.line ?? `No habit named here in ${session}`}
          </span>
          {cost && <span className="font-mono text-xs font-bold tabular-nums text-lmu-text-soft" title="Your usual time lost through the whole corner">{cost}</span>}
          {trend.slipping && <SlippingTag />}
        </div>
        {to && trend.view && (
          <Link to={to} onClick={event => event.stopPropagation()}
            title={`Your usual lap of ${session} through this corner against the target's`}
            className={`inline-flex items-center gap-1 rounded text-xs font-semibold text-lmu-text-soft underline-offset-2 hover:text-white hover:underline ${FOCUS_RING}`}>
            Compare in telemetry <ArrowUpRight className="w-3 h-3 self-center" aria-hidden="true" />
          </Link>
        )}
      </div>
      {(tryLine || speedCue) && (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          {tryLine && <span className="text-lmu-text-soft" title={tryTitle}><span className="font-semibold text-lmu-warn">Try:</span> {tryLine}</span>}
          {tryLine && speedCue && <span aria-hidden="true" className="text-lmu-muted">·</span>}
          {speedCue && <span className="font-mono tabular-nums text-lmu-muted">{speedCue}</span>}
        </p>
      )}
      {hasFooter && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-lmu-border/60 pt-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums text-lmu-muted" title="The last sessions that measured the corner, oldest first">
            {hasCostTrend && (
              <span className="inline-flex items-center gap-1.5">
                <CostSparkline costs={costs} tone={costTone} testId="corner-habit-sparkline" />
                <span className="font-semibold text-white">{`${formatCostSec(costs[0])} → ${formatCostSec(costs[costs.length - 1])} s`}</span>
              </span>
            )}
            {hasCostTrend && gapSeries && <span aria-hidden="true">·</span>}
            {gapSeries && <span>{gapSeries}</span>}
          </div>
          {pin && (
            <div className="flex flex-wrap items-center gap-2 text-lmu-muted">
              <button type="button" className={`${SECONDARY_BUTTON} h-7`}
                onClick={event => { event.stopPropagation(); pin.onChange(trend.focus !== 'pinned'); }}>
                {trend.focus === 'pinned' ? 'Unpin' : trend.focus === 'focus' ? 'Keep as focus' : 'Make focus'}
              </button>
              {pin.error && <span role="alert" className="text-lmu-loss">{pin.error}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
