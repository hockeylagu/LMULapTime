import { median } from '../pitStops.js';
import type { AnalysisSessionRef, CornerAnalysis, CornerHabit, CornerHabitTrend, HabitAction, HabitActionType } from '../../types/corners/cornerAnalysis.js';
import type { FocusCorner, FocusProgress, HabitFocus } from '../../types/corners/habitFocus.js';
import { actionDone, habitRule, isExitOnly, withAction } from './habitRules.js';

/**
 * The habit focus (driver, 2026-11-20): the 2 corners to work on next, kept stable from session to session, and the
 * progress on them. Derived on each read by walking every analysed session, oldest first; only pins are stored, so
 * the same history always gives the same focus. Measured on the driver's history: the top 2 of each session alone
 * changed in 86% of sessions, with these rules in about 15%.
 */

/** The sessions a corner's score, its progress and its slipping read: the last ones that measured it. */
export const HISTORY_SESSIONS = 5;
/** How many sessions a corner that left the automatic top 2 stays in the debrief's "No longer in your top 2" list. */
export const LEFT_FOCUS_SESSIONS = 3;
/** The focus is 2 corners: more is not a focus. */
export const FOCUS_SLOTS = 2;
/** A corner can enter with a named habit in at least this many of its last HISTORY_SESSIONS sessions: a one-off never picks the focus. */
export const ENTRY_SESSIONS = 2;
/** Another corner takes a slot when its score is this many times a focus corner's... */
export const CHALLENGER_MARGIN = 1.2;
/** ...in this many sessions running. */
export const CHALLENGER_SESSIONS = 2;
/** Slipping: the corner's cost this much (s) above the median of the window's earlier sessions... */
export const SLIPPING_SEC = 0.1;
/** ...in this many of the latest sessions running. A cost moves by 0.06 s between two ordinary sessions. */
export const SLIPPING_SESSIONS = 2;
/** A corner's cost down by at least this (s) after a try followed it: about the 0.06 s a cost moves between two ordinary sessions. */
export const FOLLOWED_SEC = 0.05;

/** One analysed session of the driver at the layout in one car. */
export interface AnalysedSession extends AnalysisSessionRef {
  /** The driver's ordinal in the session. */
  driverOrdinal: number;
  analysis: CornerAnalysis;
}

/** A corner as the focus names it. */
export interface FocusCornerRef {
  id: number;
  name: string;
  turnIds: readonly number[];
}

/**
 * A corner's habit in a session: the named habit with the highest priority among the corner's turns that can be a
 * focus, else its highest named one (slower at the exit only: shown, never picked), else none.
 */
export function cornerHabit(analysis: CornerAnalysis, cornerId: number): CornerHabit | null {
  const named = analysis.habits.filter(habit => habit.cornerId === cornerId);
  return named.find(habit => !isExitOnly(habit)) ?? named[0] ?? null;
}

/** A session that measured the corner: its place in the history, the corner's cost and its focus score (0 without one to pick). */
interface CornerPoint { index: number; costSec: number; priority: number }

function cornerSeries(sessions: readonly AnalysedSession[], cornerId: number): CornerPoint[] {
  return sessions.flatMap((session, index) => {
    const costSec = session.analysis.corners.find(corner => corner.id === cornerId)?.lossSec ?? null;
    if (costSec === null) return [];
    const habit = cornerHabit(session.analysis, cornerId);
    // Score by whole-corner cost weighted by repeatability and confidence so split and multi-turn corners are not
    // diluted against single non-split turns.
    return [{ index, costSec, priority: habit && !isExitOnly(habit) && costSec > 0 ? costSec * habit.repeatability * habit.confidence : 0 }];
  });
}

/** The last HISTORY_SESSIONS points up to session `index`. */
const windowAt = (series: readonly CornerPoint[], index: number): CornerPoint[] => series.filter(point => point.index <= index).slice(-HISTORY_SESSIONS);

/**
 * The automatic focus after each session, oldest first: the corner ids, the higher score first. A corner's score is
 * the mean of its whole-corner cost weighted by its habit's repeatability and confidence over the last
 * HISTORY_SESSIONS sessions that measured it.
 * - Start: the 2 highest scores. Carry over: each session starts with the focus before it.
 * - Entry: a named habit in ENTRY_SESSIONS of the corner's last sessions (1 while the history has one session).
 * - Clear challenger: a corner scoring CHALLENGER_MARGIN times a focus corner's score in CHALLENGER_SESSIONS sessions
 *   running takes the slot of the lowest scoring focus corner it beats.
 * - Nothing left: a focus corner whose score is 0 gives its slot back.
 */
export function walkFocus(sessions: readonly AnalysedSession[], cornerIds: readonly number[]): number[][] {
  const series = new Map(cornerIds.map(id => [id, cornerSeries(sessions, id)]));
  const steps: number[][] = [];
  const scores: Array<Map<number, number>> = [];
  let focus: number[] = [];
  sessions.forEach((_session, index) => {
    const windows = new Map(cornerIds.map(id => [id, windowAt(series.get(id) ?? [], index)]));
    const now = new Map(cornerIds.map(id => {
      const window = windows.get(id) ?? [];
      return [id, window.length ? window.reduce((sum, point) => sum + point.priority, 0) / window.length : 0];
    }));
    scores.push(now);
    const score = (id: number) => now.get(id) ?? 0;
    const byScore = (a: number, b: number) => score(b) - score(a) || a - b;
    const named = (id: number) => (windows.get(id) ?? []).filter(point => point.priority > 0).length;
    const canEnter = (id: number) => !focus.includes(id) && score(id) > 0 && named(id) >= Math.min(ENTRY_SESSIONS, index + 1);
    focus = focus.filter(id => score(id) > 0);
    // A free slot is filled before anything is replaced: a challenger only ever takes a slot that is held.
    for (const id of cornerIds.filter(canEnter).sort(byScore)) if (focus.length < FOCUS_SLOTS) focus.push(id);
    const running = scores.slice(-CHALLENGER_SESSIONS);
    if (running.length === CHALLENGER_SESSIONS) {
      for (const challenger of cornerIds.filter(canEnter).sort(byScore)) {
        const beaten = focus.filter(id => running.every(at => (at.get(challenger) ?? 0) > 0 && (at.get(challenger) ?? 0) >= CHALLENGER_MARGIN * (at.get(id) ?? 0)));
        const lowest = beaten.sort(byScore).at(-1);
        if (lowest !== undefined) focus = focus.map(id => (id === lowest ? challenger : id));
      }
    }
    focus = focus.toSorted(byScore);
    steps.push(focus);
  });
  return steps;
}

/**
 * Whether the corner is slipping at session `index`: measured there, with a cost at least SLIPPING_SEC above the
 * median of its window's earlier sessions, there and in the session before it (SLIPPING_SESSIONS running).
 */
function isSlipping(series: readonly CornerPoint[], index: number): boolean {
  const upTo = series.filter(point => point.index <= index);
  if (upTo.at(-1)?.index !== index || upTo.length <= SLIPPING_SESSIONS) return false;
  return Array.from({ length: SLIPPING_SESSIONS }, (_, back) => upTo.slice(0, upTo.length - back).slice(-HISTORY_SESSIONS)).every(window => {
    const level = median(window.slice(0, -1).map(point => point.costSec));
    return level !== null && window[window.length - 1].costSec >= level + SLIPPING_SEC;
  });
}

const refOf = ({ sessionId, timestamp, sessionType }: AnalysisSessionRef): AnalysisSessionRef => ({ sessionId, timestamp, sessionType });
const measuresOf = (session: AnalysedSession, turnId: number) => session.analysis.measures.find(turn => turn.turnId === turnId);
const usualLapOf = (session: AnalysedSession, cornerId: number) => session.analysis.corners.find(corner => corner.id === cornerId)?.usualLapOrdinal ?? null;

/** What a session advised at a corner (its habit, with the action to try), and what the try the session before advised did. */
interface CornerAdvice { habit: CornerHabit | null; tried: FocusProgress['tried'] }

/** What the try `advised` (the session before's habit) did by `now`, read at the turn it named; null when the driver's usual did not move its way. */
function triedOf(before: AnalysedSession, now: AnalysedSession, advised: CornerHabit | null, costChangeSec: number): FocusProgress['tried'] {
  const action = advised?.action;
  if (!advised || !action) return null;
  const gapIn = (session: AnalysedSession) => measuresOf(session, advised.turnId)?.actions[action.type] ?? null;
  const gapBefore = gapIn(before), gapNow = gapIn(now);
  const done = gapBefore !== null && gapNow !== null ? actionDone(action.type, gapBefore, gapNow) : null;
  return done && { action: action.type, turnLabel: advised.turnLabel, ...done, costChangeSec, worked: costChangeSec <= -FOLLOWED_SEC };
}

/**
 * What each session that measured the corner advised there, by its place in the history. A session offers its habit's
 * first action, until a try of it moved the driver's usual and the corner got no quicker: the next session then offers
 * the habit's next action, and the first again once every one was tried (driver, 2026-11-21: the same advice only when
 * nothing else is measured). A try that paid keeps its action while it still applies, and starts over once its gap is
 * closed or the habit changes. Walked from the first session, so the same history always advises the same.
 */
function cornerAdvice(sessions: readonly AnalysedSession[], cornerId: number, series: readonly CornerPoint[]): Map<number, CornerAdvice> {
  const advice = new Map<number, CornerAdvice>();
  let noGain: HabitActionType[] = [];
  let before: { point: CornerPoint; habit: CornerHabit | null } | null = null;
  for (const point of series) {
    const session = sessions[point.index];
    const own = cornerHabit(session.analysis, cornerId);
    const tried = before && triedOf(sessions[before.point.index], session, before.habit, point.costSec - before.point.costSec);
    const sameHabit: boolean = own !== null && before?.habit?.rule === own.rule && before.habit.turnId === own.turnId;
    const actions = own ? [...(own.action ? [own.action] : []), ...own.otherActions] : [];
    let action: HabitAction | undefined = sameHabit && tried?.worked ? actions.find(item => item.type === tried.action) : undefined;
    if (!sameHabit || (tried?.worked && !action)) noGain = [];
    else if (tried && !tried.worked) noGain.push(tried.action);
    if (!action) {
      action = actions.find(item => !noGain.includes(item.type));
      if (!action && actions.length) {
        noGain = [];
        [action] = actions;
      }
    }
    const habit: CornerHabit | null = own && action && action.type !== own.action?.type ? withAction(own, action) : own;
    advice.set(point.index, { habit, tried });
    before = { point, habit };
  }
  return advice;
}

/** The corner then against now: the oldest of its last HISTORY_SESSIONS measuring sessions against the latest. */
function progressOf(
  sessions: readonly AnalysedSession[], corner: FocusCornerRef, series: readonly CornerPoint[], state: FocusProgress['state'], tried: FocusProgress['tried'],
): FocusProgress | null {
  const last = sessions.length - 1;
  const window = windowAt(series, last);
  const now = window.at(-1), then = window[0];
  if (!now || now.index !== last || then.index === last) return null;
  const nowSession = sessions[last], thenSession = sessions[then.index];
  // A graduated corner often has no named habit left now: show the gap of the last habit worked on in the window so the driver sees what improved.
  const habit = cornerHabit(nowSession.analysis, corner.id)
    ?? (state === 'left' ? window.map(point => cornerHabit(sessions[point.index].analysis, corner.id)).findLast(item => item?.rule != null) ?? null : null);
  const gapOf = (session: AnalysedSession) => (habit?.rule ? measuresOf(session, habit.turnId)?.rules[habit.rule] ?? null : null);
  const gapThen = gapOf(thenSession), gapNow = gapOf(nowSession);
  const lapOrdinal = usualLapOf(nowSession, corner.id), thenLapOrdinal = usualLapOf(thenSession, corner.id);
  return {
    cornerId: corner.id, name: corner.name, state, slipping: isSlipping(series, last),
    since: { ...refOf(thenSession), driverOrdinal: thenSession.driverOrdinal },
    costThenSec: then.costSec, costNowSec: now.costSec,
    costs: window.map(point => point.costSec),
    gap: habit?.rule && gapThen !== null && gapNow !== null
      ? { rule: habit.rule, turnLabel: habit.turnLabel, unit: habitRule(habit.rule).unit, before: gapThen, now: gapNow } : null,
    tried,
    view: lapOrdinal !== null && thenLapOrdinal !== null ? { lapOrdinal, thenLapOrdinal } : null,
  };
}

/** Pins always show. A corner held by history needs a measured cost to be recommended for this session. */
function shownFocus(auto: readonly number[], pins: readonly number[], cornerIds: readonly number[], analysis: CornerAnalysis | undefined): number[] {
  const pinned = pins.filter(id => cornerIds.includes(id)).slice(0, FOCUS_SLOTS);
  const measured = auto.filter(id => !pinned.includes(id) && analysis?.corners.some(corner => corner.id === id && corner.lossSec !== null));
  return [...pinned, ...measured].slice(0, FOCUS_SLOTS);
}

/**
 * The focus of the latest of `sessions` (oldest first): its 2 corners (pins hold a slot until unpinned), and the
 * progress on them and on the corners that left the automatic focus within the last LEFT_FOCUS_SESSIONS sessions.
 */
export function habitFocus(sessions: readonly AnalysedSession[], corners: readonly FocusCornerRef[], pins: readonly number[]): HabitFocus {
  const cornerIds = corners.map(corner => corner.id);
  const steps = walkFocus(sessions, cornerIds);
  const last = sessions.length - 1;
  const session = sessions[last];
  const auto = steps[last] ?? [];
  const shown = shownFocus(auto, pins, cornerIds, session?.analysis);
  const left = [...new Set(steps.slice(Math.max(0, last - LEFT_FOCUS_SESSIONS), last).toReversed().flat())].filter(id => !auto.includes(id) && !shown.includes(id));
  const series = new Map(cornerIds.map(id => [id, cornerSeries(sessions, id)]));
  // What this session advises at each corner named below, and what its last try did.
  const advice = new Map([...shown, ...left].map(id => [id, cornerAdvice(sessions, id, series.get(id) ?? []).get(last)]));
  const cornerOf = (id: number) => corners.find(corner => corner.id === id) as FocusCornerRef;
  const focusCorners = shown.map((id): FocusCorner => {
    const corner = cornerOf(id);
    return {
      cornerId: id, name: corner.name, pinTurnId: corner.turnIds[0], pinned: pins.includes(id),
      habit: advice.get(id)?.habit ?? (session ? cornerHabit(session.analysis, id) : null),
      costSec: session?.analysis.corners.find(item => item.id === id)?.lossSec ?? null,
      slipping: isSlipping(series.get(id) ?? [], last),
    };
  });
  const progress = [...shown.map(id => [id, 'focus'] as const), ...left.map(id => [id, 'left'] as const)]
    .flatMap(([id, state]) => progressOf(sessions, cornerOf(id), series.get(id) ?? [], state, advice.get(id)?.tried ?? null) ?? []);
  return { sessions: sessions.length, corners: focusCorners, progress };
}

/**
 * Each corner over the driver's analysed sessions at the layout in one car (oldest first), for the corner trends:
 * the latest session's habit there, the corner's cost and the habit's gap over the last HISTORY_SESSIONS sessions that
 * measured it, and whether it is a focus corner (the same walk as the debrief) or pinned.
 */
export function cornerFocusTrends(sessions: readonly AnalysedSession[], corners: readonly FocusCornerRef[], pins: readonly number[]): Map<number, CornerHabitTrend> {
  const cornerIds = corners.map(corner => corner.id);
  const last = sessions.length - 1;
  const now = sessions[last];
  if (!now) return new Map();
  const shown = shownFocus(walkFocus(sessions, cornerIds)[last] ?? [], pins, cornerIds, now.analysis);
  return new Map(corners.flatMap(corner => {
    const measured = now.analysis.corners.find(item => item.id === corner.id);
    if (!measured || measured.usualSec === null) return [];
    const series = cornerSeries(sessions, corner.id);
    // The corner's habit with the action the focus offers, else its biggest loss no rule explains: an observation, not advice.
    const habit = cornerAdvice(sessions, corner.id, series).get(last)?.habit ?? cornerHabit(now.analysis, corner.id)
      ?? now.analysis.unexplained.find(item => item.cornerId === corner.id) ?? null;
    const { usualLapOrdinal, reference } = measured;
    const trend: CornerHabitTrend = {
      session: refOf(now), habit, costSec: measured.lossSec,
      focus: !shown.includes(corner.id) ? null : pins.includes(corner.id) ? 'pinned' : 'focus',
      pinTurnId: corner.turnIds[0], slipping: isSlipping(series, last),
      gap: habit?.rule ? { rule: habit.rule, turnLabel: habit.turnLabel, unit: habitRule(habit.rule).unit } : null,
      series: windowAt(series, last).map(point => ({
        session: refOf(sessions[point.index]), costSec: point.costSec,
        gap: habit?.rule ? measuresOf(sessions[point.index], habit.turnId)?.rules[habit.rule] ?? null : null,
      })),
      view: usualLapOrdinal !== null && reference
        ? {
          lap: { sessionId: now.sessionId, driverOrdinal: now.driverOrdinal, lapOrdinal: usualLapOrdinal },
          reference: { sessionId: reference.sessionId, driverOrdinal: reference.driverOrdinal, lapOrdinal: reference.usualLapOrdinal, name: reference.name },
        }
        : null,
    };
    return [[corner.id, trend] as const];
  }));
}
