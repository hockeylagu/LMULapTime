import { useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronDown, Flag, History, Loader2, Pin, Target, Zap, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../common/buttonStyles.js';
import { costChangeTone, CostSparkline, formatCostSec, SlippingTag } from '../../common/CostSparkline.js';
import { PaceBadge } from '../../common/PaceBadge.js';
import { Term } from '../../common/Term.js';
import type { WatchNextSessionState } from './useWatchNextSession.js';
import type { WatchFocus, WatchGoal, WatchMistake, WatchNextSession, WatchProgress } from './watchNextSession.js';
import { HABIT_EXPLANATIONS, HABIT_LABELS } from './habitText.js';

const readout = 'font-mono text-xs font-bold tabular-nums whitespace-nowrap';
/** An inline link (DESIGN.md, Buttons): soft text with a 12px icon, white and underlined on hover. */
const actionClass = `inline-flex w-fit items-center gap-1 rounded text-xs font-semibold text-lmu-text-soft underline-offset-2 hover:text-white hover:underline cursor-pointer ${FOCUS_RING}`;
const toggleClass = `inline-flex items-center gap-0.5 rounded text-xs text-lmu-muted hover:text-lmu-text cursor-pointer ${FOCUS_RING}`;

function TelemetryLink({ to, children }: { to: string; children: string }) {
  return <Link to={to} className={actionClass}>{children}<ArrowUpRight aria-hidden="true" className="size-3" /></Link>;
}

/** A row's text that opens its corner in telemetry: one link per row, no repeated action line. */
function RowLink({ to, title, label, children }: { to: string | null; title: string; label?: string; children: string }) {
  if (!to) return children;
  return (
    <Link to={to} title={title} aria-label={label} className={`group inline-flex items-baseline gap-1 rounded underline-offset-2 hover:underline ${FOCUS_RING}`}>
      {children}<ArrowUpRight aria-hidden="true" className="size-3.5 self-center text-lmu-muted group-hover:text-white" />
    </Link>
  );
}

/** A section's heading (Title, 14px): its icon is neutral unless it carries a signal, gain the graduated corners, loss a one-off. */
function SectionHeading({ id, icon: Icon, tone, children }: { id: string; icon: LucideIcon; tone: string; children: string }) {
  return (
    <h3 id={id} className="flex items-center gap-1.5 text-sm font-semibold text-white">
      <Icon aria-hidden="true" className={`size-4 ${tone}`} />{children}
    </h3>
  );
}

/** Where the session stands against the next pace level, reusing PaceBadge to repeat the app's pace language. */
function GoalLine({ goal }: { goal: WatchGoal }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="debrief-goal" title={goal.title}>
      <Flag aria-hidden="true" className={`size-4 shrink-0 ${goal.reached ? 'text-lmu-gain' : 'text-lmu-muted'}`} />
      <PaceBadge category={goal.level} size="sm" />
      {goal.next ? (
        <>
          <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-lmu-muted" />
          <PaceBadge category={goal.next.level} size="sm" />
          <span aria-hidden="true" className="text-lmu-muted">·</span>
          <span className="font-mono font-bold tabular-nums text-white">{goal.next.toFindSec.toFixed(2)} s</span>
          <span className="text-xs text-lmu-text-soft">to find</span>
        </>
      ) : (
        <>
          <span aria-hidden="true" className="text-lmu-muted">·</span>
          <span className="font-semibold text-lmu-gain">top level</span>
        </>
      )}
    </p>
  );
}

/**
 * A corner's cost last session against this one, with the last sessions' costs as a line: only the end dot wears the
 * colour of that same change, so it agrees with "Last try"; the readout stays white.
 */
function CostChange({ item }: { item: WatchProgress }) {
  const tone = costChangeTone(item.costNowSec - item.costThenSec);
  const line = item.costs.length > 2 ? ` The line shows the last ${item.costs.length} sessions here.` : '';
  return (
    <span className="inline-flex items-center gap-2">
      <CostSparkline costs={item.costs} tone={tone} testId="debrief-sparkline" />
      <span className={`${readout} text-white`} title={`Time lost to the target through the corner: ${item.sinceLabel}, then this session.${line}`}>
        {`${formatCostSec(item.costThenSec)} → ${formatCostSec(item.costNowSec)} s/lap`}
      </span>
    </span>
  );
}

type Unpin = ((turnId: number) => void) | null;

/** One unified focus corner: advice + trend sparkline on top, Try + apex speed below, diagnostics tucked in Details. */
function FocusRow({ item, progress, onUnpin }: { item: WatchFocus; progress: WatchProgress | null; onUnpin: Unpin }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(item.diagnosis || item.causes.length > 0 || item.rule || progress?.gap);
  const summary = item.speedLine ?? (!item.rule ? item.detail : null);
  const showCornerPrefix = item.rule !== null;
  return (
    <li className="space-y-1 py-2.5" data-testid="debrief-focus-row">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-semibold text-white">
          {showCornerPrefix && <span className="text-lmu-text-soft">{item.name} ·</span>}
          <RowLink to={item.link} title="Compare in telemetry" label={showCornerPrefix ? `${item.name}: ${item.line}` : undefined}>{item.line}</RowLink>
        </p>
        {progress ? (
          <CostChange item={progress} />
        ) : (
          <span className={`${readout} text-white`} title="Your usual time lost to the target through the whole corner">
            {item.costSec === null ? '—' : `${item.costSec >= 0 ? '+' : '−'}${Math.abs(item.costSec).toFixed(2)} s/lap`}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
        {item.tryLine && (
          <span className="text-lmu-text" title={item.tryTitle}>
            <span className="font-semibold text-lmu-warn">Try:</span> {item.tryLine}
          </span>
        )}
        {item.tryLine && summary && <span aria-hidden="true" className="text-lmu-muted">·</span>}
        {summary && <span className="font-mono tabular-nums text-lmu-text-soft">{summary}</span>}
        {item.slipping && <><span aria-hidden="true" className="text-lmu-muted">·</span><SlippingTag /></>}
        {item.pinned && (
          <>
            {(item.tryLine || summary || item.slipping) && <span aria-hidden="true" className="text-lmu-muted">·</span>}
            <span className="inline-flex items-center gap-1 text-lmu-text-soft"><Pin aria-hidden="true" className="size-3 self-center" />Your pick</span>
            {onUnpin && <button type="button" onClick={() => onUnpin(item.pinTurnId)} aria-label={`Unpin ${item.name}`} className={toggleClass}>Unpin</button>}
          </>
        )}
        {hasDetails && (
          <button type="button" aria-expanded={expanded} aria-label={`${expanded ? 'Hide details' : 'Details'} for ${item.name}`} onClick={() => setExpanded(open => !open)} className={`${toggleClass} ml-auto`}>
            <span>{expanded ? 'Hide details' : 'Details'}</span>
            <ChevronDown aria-hidden="true" className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {progress?.tried && (
        <p className={`text-xs ${progress.tried.worked ? 'text-lmu-gain' : 'text-lmu-text-soft'}`} title={progress.tried.title}>
          {progress.tried.line}
        </p>
      )}
      {expanded && hasDetails && (
        <div className="space-y-1.5 border-l-2 border-lmu-border pl-3 pt-1 text-xs" data-testid="debrief-focus-details">
          {item.rule && (
            <p className="text-lmu-text-soft">
              <span className="text-lmu-muted">Habit: </span>
              <Term explanation={HABIT_EXPLANATIONS[item.rule]}>{HABIT_LABELS[item.rule]}</Term>
              {item.share !== null && <span className="text-lmu-muted">{` — showed on ${Math.round(item.share * 100)}% of your clean laps`}</span>}
            </p>
          )}
          {item.diagnosis && (
            <p className="text-lmu-text-soft">
              <span className="text-lmu-muted">Why vs target: </span>
              {item.diagnosis}
            </p>
          )}
          {item.causes.length > 0 && (
            <p className="text-lmu-text-soft">
              <span className="text-lmu-muted">Other differences vs target: </span>
              {item.causes.map((cause, index) => (
                <span key={cause.line}>
                  {index > 0 && <span aria-hidden="true" className="text-lmu-muted"> · </span>}
                  <Term explanation={cause.explanation}>{cause.line}</Term>
                </span>
              ))}
            </p>
          )}
          {progress?.gap && (
            <p className="text-lmu-text-soft">
              <span className="text-lmu-muted">{`Progress since ${progress.sinceLabel}: `}</span>
              {progress.gap}
            </p>
          )}
          {progress?.link && (
            <p className="pt-0.5">
              <TelemetryLink to={progress.link}>{`Compare against your ${progress.sinceLabel} lap`}</TelemetryLink>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function HabitGroups({ watch, onUnpin }: { watch: WatchNextSession; onUnpin: Unpin }) {
  const { focus, progress, earlierSessions } = watch;
  const progressByCorner = new Map(progress.map(item => [item.cornerId, item]));
  const left = progress.filter(item => item.state === 'left');
  return (
    <>
      {watch.goal && <GoalLine goal={watch.goal} />}
      <section aria-labelledby="debrief-next-session" className={`space-y-1 ${watch.goal ? 'border-t border-lmu-border pt-3' : ''}`}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <SectionHeading id="debrief-next-session" icon={Target} tone="text-lmu-muted">Focus next session</SectionHeading>
          {earlierSessions > 0 && <p className="text-xs text-lmu-muted">last {watch.sessions} sessions here</p>}
        </div>
        {focus.length ? (
          <ol className="divide-y divide-lmu-border/60">
            {focus.map(item => (
              <FocusRow key={item.cornerId} item={item} progress={progressByCorner.get(item.cornerId) ?? null} onUnpin={onUnpin} />
            ))}
          </ol>
        ) : (
          <p className="py-1 text-sm text-lmu-muted" role="status">
            {watch.hasReference ? 'No recurring driving habit identified.' : 'No comparable reference for these laps.'}
          </p>
        )}
        {earlierSessions === 0 && focus.length > 0 && (
          <p className="pt-1 text-xs text-lmu-muted">First session here in this class. The next one will show your trend.</p>
        )}
      </section>
      {left.length > 0 && (
        <section aria-labelledby="debrief-left-focus" className="space-y-1 border-t border-lmu-border pt-3">
          {/* Neutral: a corner leaves the top 2 when others cost more, not only when it got quicker; its cost line says which. */}
          <SectionHeading id="debrief-left-focus" icon={History} tone="text-lmu-muted">No longer in your top 2</SectionHeading>
          <ul className="divide-y divide-lmu-border/60">
            {left.map(item => (
              <li key={item.cornerId} className="space-y-0.5 py-2" data-testid="debrief-left-row">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-semibold text-white">
                    <RowLink to={item.link} title={`Opens it in telemetry against ${item.sinceLabel}.`}>{item.name}</RowLink>
                    {item.slipping && <SlippingTag />}
                  </p>
                  <CostChange item={item} />
                </div>
                {item.gap && <p className="text-xs text-lmu-text-soft">{item.gap}</p>}
                {item.tried && (
                  <p className={`text-xs ${item.tried.worked ? 'text-lmu-gain-soft' : 'text-lmu-muted'}`} title={item.tried.title}>
                    {item.tried.line}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function OneOffLoss({ mistake }: { mistake: WatchMistake }) {
  return (
    <section aria-labelledby="debrief-one-off" className="space-y-1">
      <SectionHeading id="debrief-one-off" icon={Zap} tone="text-lmu-loss">One-off</SectionHeading>
      <p className="text-xs text-lmu-text-soft">
        {mistake.turnLabel}{mistake.cause && <> · <Term explanation={mistake.cause.explanation}>{mistake.cause.label}</Term></>} · <span className="font-mono font-semibold tabular-nums text-lmu-text">+{mistake.lossSec.toFixed(2)} s</span> vs. your usual
      </p>
      {mistake.link && <TelemetryLink to={mistake.link}>{mistake.lapNumber === null ? 'Replay this lap' : `Replay lap ${mistake.lapNumber}`}</TelemetryLink>}
    </section>
  );
}

interface WatchNextSessionCardProps {
  state: WatchNextSessionState;
  retry: () => void;
  /** Hands a pinned corner's focus slot back to the rules; null when nothing can be unpinned. */
  onUnpin: ((turnId: number) => void) | null;
}

export function WatchNextSessionCard({ state, retry, onUnpin }: WatchNextSessionCardProps) {
  return (
    <section aria-label="Driving habits" className="min-w-0 space-y-3 px-5 py-4" data-testid="watch-next-session">
      {state.status === 'loading' && (
        <p role="status" className="flex items-center gap-2 text-sm text-lmu-muted"><Loader2 aria-hidden="true" className="size-4 animate-spin" /> Reading corner analysis…</p>
      )}
      {state.status === 'unavailable' && <p role="status" className="text-sm text-lmu-muted">{state.message}</p>}
      {state.status === 'error' && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-lmu-loss">{state.message}</p>
          <button type="button" onClick={retry} className={SECONDARY_BUTTON}>Retry corner analysis</button>
        </div>
      )}
      {state.status === 'ready' && <HabitGroups watch={state.watch} onUnpin={onUnpin} />}
    </section>
  );
}
