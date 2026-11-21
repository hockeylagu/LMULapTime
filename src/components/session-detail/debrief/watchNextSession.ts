import type { CornerHabit, HabitRule, SessionCornerAnalysis } from '../../../../shared/types/corners/cornerAnalysis.js';
import type { FocusProgress, HabitFocusPin, PaceGoal } from '../../../../shared/types/corners/habitFocus.js';
import type { PaceCategory } from '../../../../shared/types/reference.js';
import type { LayoutCorners } from '../../../../shared/types/corners/cornerPasses.js';
import { MISTAKE_LINES } from '../../../../shared/domain/cornerAnalysis/analyzeCorners.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { HISTORY_SESSIONS } from '../../../../shared/domain/cornerAnalysis/habitFocus.js';
import { CAUSE_EXPLANATIONS, habitGapLabel, habitGapText, habitTriedTitle, habitTryLine, habitTryTitle, MISTAKE_EXPLANATIONS } from './habitText.js';
import { sessionRefLabel } from '../../track-detail/corner-trends/cornerHabitText.js';
import { buildTelemetryComparePath, type TelemetryLapRef } from '../../../utils/telemetryCompareLink.js';

/** Where the session stands against the next pace level, one line above the focus. */
export interface WatchGoal {
  /** At the top level: nothing above to find. */
  reached: boolean;
  /** Current pace level and percentage for the PaceBadge. */
  level: PaceCategory;
  percent: number;
  /** Next pace level and seconds to find; null at the top level. */
  next: { level: PaceCategory; toFindSec: number } | null;
  /** "0.76 s to find for Competitive pace · Good now", or "Alien pace: the top level". */
  line: string;
  /** The numbers behind the line: the true pace's percent of the benchmark target, and where the next level starts. */
  title: string;
}

/** A focus corner: what to do there next session. */
export interface WatchFocus {
  cornerId: number;
  /** The corner's name ("Sunset Bend (T17)"). */
  name: string;
  /** The turn a pin of the corner is stored on. */
  pinTurnId: number;
  pinned: boolean;
  slipping: boolean;
  /** Null for a pinned corner without a named habit this session. */
  rule: HabitRule | null;
  /** The habit's advice ("Carry 7 km/h more through T5"); the corner's name without a habit. */
  line: string;
  /** Compact speed target shown on the summary line ("Apex 96 → 100 km/h"); null without a habit or speed. */
  speedLine: string | null;
  /** Diagnostic detail hidden under Details (line/grip/kind text); null when none. */
  diagnosis: string | null;
  /** The speeds to hit and the kind of loss; says so when no habit is named. */
  detail: string;
  /** The one thing to try ("Turn in 5 m earlier"); null when the headline is the action or none is measured. */
  tryLine: string | null;
  /** The metres behind a try said in words, for its tooltip. */
  tryTitle: string | undefined;
  /** What else was measured there: "braking 0.4 s longer", with a hover explanation. */
  causes: Array<{ line: string; explanation: string }>;
  /** The usual time lost to the target through the whole corner (s a lap); null when not measured. */
  costSec: number | null;
  /** The share of laps the habit showed on; null without a habit. */
  share: number | null;
  link: string | null;
}

export interface WatchMistake {
  lapNumber: number | null;
  turnLabel: string;
  /** Why the lap lost time, and what that measured; null when nothing measured stands out. */
  cause: { label: string; explanation: string } | null;
  lossSec: number;
  link: string | null;
}

/** A focus corner, or one that left the focus lately, then against now. */
export interface WatchProgress {
  cornerId: number;
  name: string;
  state: FocusProgress['state'];
  slipping: boolean;
  /** The session "then" is: "Oct 21 Race". */
  sinceLabel: string;
  costThenSec: number;
  costNowSec: number;
  /** Corner cost (s/lap) over the last measuring sessions, oldest first, for the inline sparkline. */
  costs: number[];
  /** "Minimum speed at T5: 7 km/h under → 3 km/h under"; null without a named habit. */
  gap: string | null;
  /** What the driver did of the last advice and whether the corner's cost followed: the result of a try, not progress by itself. */
  tried: { line: string; worked: boolean; title: string | undefined } | null;
  link: string | null;
}

export interface WatchNextSession {
  /** The driver's analysed sessions here in the car the progress reads: this one and the few before it. */
  sessions: number;
  /** The driver's earlier sessions here in the car: none, this is their first. */
  earlierSessions: number;
  goal: WatchGoal | null;
  progress: WatchProgress[];
  focus: WatchFocus[];
  hasReference: boolean;
  /** What a pin or an unpin names beside the turn. */
  pinScope: Omit<HabitFocusPin, 'turnId'>;
  /** The biggest one-off loss the driver caused (traffic is not theirs to fix). */
  mistake: WatchMistake | null;
}

/** The 2D lap view at a corner (its number in the lap view, by start position), with a comparison lap. */
const watchLink = (lap: TelemetryLapRef, baseline: TelemetryLapRef, cornerNumber: number | null): string =>
  buildTelemetryComparePath(new URLSearchParams({ view: '2d' }), lap, baseline, cornerNumber ?? undefined);

/** The lap view numbers the layout's corners in their order on the track. */
export function cornerNumbering(layout: LayoutCorners | null): (cornerId: number) => number | null {
  const order = layout ? layout.corners.toSorted((a, b) => a.startM - b.startM).map(corner => corner.id) : [];
  return (cornerId) => {
    const index = order.indexOf(cornerId);
    return index < 0 ? null : index + 1;
  };
}

function watchGoal({ benchmarkSec, percent, level, next }: PaceGoal): WatchGoal {
  const now = `Your true pace (the average of your 3 fastest clean dry laps) is ${percent.toFixed(1)}% of the benchmark target of this layout and class, ${formatTime(benchmarkSec)}: ${level}`;
  return next
    ? {
      reached: false, level, percent, next: { level: next.level, toFindSec: next.toFindSec },
      line: `${next.toFindSec.toFixed(2)} s to find for ${next.level} pace · ${level} now`,
      title: `${now}. ${next.level} starts at ${next.maxPercent.toFixed(1)}%, ${formatTime((benchmarkSec * next.maxPercent) / 100)}`,
    }
    : { reached: true, level, percent, next: null, line: `${level} pace: the top level`, title: now };
}

/** Compact speed cue for the collapsed focus row ("Apex 96 → 100 km/h"); null without measured speeds. */
function focusSpeedLine(habit: CornerHabit): string | null {
  const { minKmh, targetMinKmh, exitKmh, targetExitKmh } = habit.speeds;
  const pair = (label: string, own: number | null, target: number | null) =>
    (own !== null && target !== null ? `${label} ${Math.round(own)} → ${Math.round(target)} km/h` : null);
  const apex = pair('Apex', minKmh, targetMinKmh);
  if (habit.rule === 'exitSpeed') {
    const exit = pair('Exit', exitKmh, targetExitKmh);
    return [exit, apex].filter(Boolean).join(' · ') || null;
  }
  return apex;
}

/** Diagnostic part of `habit.detail` (line/grip/brake pressure) tucked under Details; null when none. */
export function focusDiagnosis(habit: CornerHabit): string | null {
  const parts = habit.detail.split(' · ');
  const kept = parts.filter(part => !/^(apex|exit)\s/i.test(part));
  return kept.length ? kept.join(' · ') : null;
}

/** Advice text for a focus row: omits the turn label when the row already prefixes a single-turn corner's name. */
function focusLine(habit: CornerHabit, singleTurn: boolean): string {
  if (!singleTurn || habit.rule === null || habit.gap === null) return habit.line;
  switch (habit.rule) {
    case 'brakesWhereLift': return "Lift, don't brake";
    case 'overSlowing': return `Carry ${Math.round(habit.gap)} km/h more`;
    case 'brakeEarly': return `Brake ${Math.round(habit.gap)} m later`;
    case 'exitSpeed': return `Exit ${Math.round(habit.gap)} km/h faster`;
  }
}

export function watchNextSession(
  analysis: SessionCornerAnalysis,
  driverName: string,
  cornerNumberOf: (cornerId: number) => number | null,
  lapNumberOf: (lapOrdinal: number) => number | null,
): WatchNextSession {
  const corners = new Map(analysis.corners.map(corner => [corner.id, corner]));
  const own = (lapOrdinal: number): TelemetryLapRef => ({
    sessionId: analysis.sessionId, driverOrdinal: analysis.driverOrdinal, lapOrdinal, driverName,
  });
  const focus = analysis.focus.corners.map((item): WatchFocus => {
    const corner = corners.get(item.cornerId);
    const usual = corner?.usualLapOrdinal;
    const cornerReference = corner?.reference;
    const { habit } = item;
    const singleTurn = (corner?.turnIds.length ?? 0) === 1;
    return {
      cornerId: item.cornerId, name: item.name, pinTurnId: item.pinTurnId, pinned: item.pinned, slipping: item.slipping,
      rule: habit?.rule ?? null,
      line: habit ? focusLine(habit, singleTurn) : item.name,
      speedLine: habit ? focusSpeedLine(habit) : null,
      diagnosis: habit ? focusDiagnosis(habit) : null,
      detail: habit?.detail ?? 'No habit named here this session.',
      tryLine: habit ? habitTryLine(habit) : null,
      tryTitle: habit ? habitTryTitle(habit.action) : undefined,
      causes: habit?.causes.map(cause => ({ line: cause.line, explanation: CAUSE_EXPLANATIONS[cause.type] })) ?? [],
      costSec: item.costSec,
      share: habit?.repeatability ?? null,
      link: usual != null && cornerReference ? watchLink(own(usual), {
        sessionId: cornerReference.sessionId, driverOrdinal: cornerReference.driverOrdinal,
        lapOrdinal: cornerReference.usualLapOrdinal, driverName: cornerReference.name,
      }, cornerNumberOf(item.cornerId)) : null,
    };
  });

  const progress = analysis.focus.progress.map((item): WatchProgress => {
    const { gap, tried } = item;
    return {
      cornerId: item.cornerId, name: item.name, state: item.state, slipping: item.slipping,
      sinceLabel: sessionRefLabel(item.since),
      costThenSec: item.costThenSec, costNowSec: item.costNowSec,
      costs: item.costs,
      gap: gap && `${habitGapLabel(gap.rule, gap.turnLabel)}: ${habitGapText(gap.rule, gap.unit, gap.before)} → ${habitGapText(gap.rule, gap.unit, gap.now)}`,
      tried: tried && {
        worked: tried.worked,
        title: habitTriedTitle(tried.action, tried.moved),
        line: `Last try: you ${tried.did} at ${tried.turnLabel} · ${tried.worked
          ? `the corner is ${Math.abs(tried.costChangeSec).toFixed(2)} s quicker` : 'no gain in the corner yet'}`,
      },
      link: item.view ? watchLink(own(item.view.lapOrdinal), {
        sessionId: item.since.sessionId, driverOrdinal: item.since.driverOrdinal, lapOrdinal: item.view.thenLapOrdinal, driverName,
      }, cornerNumberOf(item.cornerId)) : null,
    };
  });

  const biggest = analysis.mistakes.filter(item => item.cause !== 'traffic').reduce<(typeof analysis.mistakes)[number] | null>((best, item) =>
    best === null || item.lossSec > best.lossSec ? item : best, null);
  const baseline = biggest ? corners.get(biggest.cornerId)?.usualLapOrdinal : null;
  return {
    sessions: Math.min(HISTORY_SESSIONS, analysis.focus.sessions),
    earlierSessions: analysis.focus.sessions - 1,
    goal: analysis.goal && watchGoal(analysis.goal),
    progress,
    focus,
    hasReference: analysis.corners.some(corner => corner.reference !== null),
    pinScope: { layoutKey: analysis.layoutKey, carClass: analysis.carClass },
    mistake: biggest && {
      lapNumber: lapNumberOf(biggest.lapOrdinal),
      turnLabel: biggest.turnLabel,
      cause: biggest.cause && { label: MISTAKE_LINES[biggest.cause], explanation: MISTAKE_EXPLANATIONS[biggest.cause] },
      lossSec: biggest.lossSec,
      link: baseline != null && baseline !== biggest.lapOrdinal
        ? watchLink(own(biggest.lapOrdinal), own(baseline), cornerNumberOf(biggest.cornerId)) : null,
    },
  };
}
