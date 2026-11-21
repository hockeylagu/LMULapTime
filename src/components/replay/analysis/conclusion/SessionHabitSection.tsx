import React, { useMemo } from 'react';
import { MISTAKE_LINES } from '../../../../../shared/domain/cornerAnalysis/analyzeCorners.js';
import { FocusTag, formatCostSec } from '../../../common/CostSparkline.js';
import { Term } from '../../../common/Term.js';
import { HABIT_EXPLANATIONS, HABIT_LABELS, MISTAKE_EXPLANATIONS } from '../../../session-detail/debrief/habitText.js';
import { cornerConclusion } from './cornerConclusion.js';
import { useSessionCornerAnalysis } from './useSessionCornerAnalysis.js';

interface Props {
  /** The shown lap: the analysis is its session's, and only says something about the session player's laps. */
  sessionId: string | undefined;
  driverOrdinal: number | undefined;
  lapOrdinal: number | undefined;
  /** The corner's number in the lap view. */
  cornerNumber: number;
}

export const CONCLUSION_SHELL = 'border-t border-lmu-border/60 px-3 py-2 text-xs leading-snug';
/** The Label (DESIGN.md): 10px bold tracked caps over each part. */
export const CONCLUSION_HEADING = 'text-[10px] font-bold uppercase tracking-wider text-lmu-muted';

/**
 * The second part of the lap view's corner conclusion: what the corner analysis engine concluded there (`cornerConclusion`). The cards
 * above compare the shown lap with its compare lap; this says the habit over the whole session, against the target.
 */
export const SessionHabitSection: React.FC<Props> = ({ sessionId, driverOrdinal, lapOrdinal, cornerNumber }) => {
  const state = useSessionCornerAnalysis(sessionId);
  const conclusion = useMemo(() => {
    if (state?.status !== 'ready' || state.analysis.driverOrdinal !== driverOrdinal) return null;
    const corner = state.analysis.corners.find(item => state.cornerNumberOf(item.id) === cornerNumber);
    return corner ? cornerConclusion(state.analysis, corner.id, lapOrdinal) : null;
  }, [state, driverOrdinal, lapOrdinal, cornerNumber]);

  if (!state) return null;
  if (state.status === 'loading') return <p className={`${CONCLUSION_SHELL} text-lmu-muted`} role="status">Reading the session's corner analysis…</p>;
  if (state.status === 'unavailable') {
    return <p className={`${CONCLUSION_SHELL} text-lmu-muted`}>No corner analysis for this session. It needs a replay with enough dry flying laps.</p>;
  }
  if (state.status === 'error') return <p className={`${CONCLUSION_SHELL} text-lmu-loss`} role="alert">{state.message}</p>;
  // Another driver's lap, or a corner the analysis does not hold: nothing to say.
  if (!conclusion) return null;

  const { habit, mistake, costSec } = conclusion;
  return (
    <section className={`${CONCLUSION_SHELL} space-y-1`} aria-label="Session corner analysis" data-testid="corner-conclusion">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className={CONCLUSION_HEADING} title="Your usual through this corner over the session's counted laps, against the layout's target. Not this lap against the compare lap.">
          Your session vs target
        </span>
        <span className="flex items-center gap-2">
          {conclusion.focus && <FocusTag focus="focus" label="Focus corner" title="One of the 2 corners to work on next" />}
          {costSec !== null && (
            <span className="font-mono font-bold tabular-nums text-white" title="Your usual time lost to the target through the whole corner">
              {`${costSec >= 0 ? '+' : ''}${formatCostSec(costSec)} s/lap`}
            </span>
          )}
        </span>
      </div>
      {/* A loss no rule explains is an observation, not something to do: it reads at the context's weight. */}
      <p className={habit?.rule ? 'text-[13px] leading-5 font-semibold text-white' : 'text-[13px] leading-5 text-lmu-text-soft'}>
        {habit?.line ?? (costSec === null ? 'Not measured against the target this session.' : 'No habit named here this session.')}
      </p>
      {habit && (habit.tryLine || habit.speedCue) && (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {habit.tryLine && <span className="text-lmu-text" title={habit.tryTitle}><span className="font-semibold text-lmu-warn">Try:</span> {habit.tryLine}</span>}
          {habit.tryLine && habit.speedCue && <span aria-hidden="true" className="text-lmu-muted">·</span>}
          {habit.speedCue && <span className="font-mono tabular-nums text-lmu-text-soft" title="Your usual, then the target's">{habit.speedCue}</span>}
        </p>
      )}
      {habit?.diagnosis && <p className="text-lmu-text-soft">{habit.diagnosis}</p>}
      {habit && habit.causes.length > 0 && <p className="text-lmu-muted">Also measured: {habit.causes.join(' · ')}</p>}
      {habit?.rule && (
        <p className="text-lmu-muted">
          <Term explanation={HABIT_EXPLANATIONS[habit.rule]}>{HABIT_LABELS[habit.rule]}</Term>{` · ${Math.round(habit.share * 100)}% of laps`}
        </p>
      )}
      {mistake && (
        <p className="text-lmu-text-soft" data-testid="corner-conclusion-lap">
          <span className={CONCLUSION_HEADING}>This lap</span>{' '}
          <span className="font-mono font-bold tabular-nums text-lmu-loss">+{mistake.lossSec.toFixed(2)} s</span>
          {` vs. your usual at ${mistake.turnLabel}`}
          {mistake.cause && <> · <Term explanation={MISTAKE_EXPLANATIONS[mistake.cause]}>{MISTAKE_LINES[mistake.cause]}</Term></>}
        </p>
      )}
    </section>
  );
};
