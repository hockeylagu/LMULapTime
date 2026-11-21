import { describe, expect, it } from 'vitest';
import { cornerFocusTrends, habitFocus, walkFocus, type AnalysedSession, type FocusCornerRef } from '../../../shared/domain/cornerAnalysis/habitFocus.js';
import { paceGoal } from '../../../shared/domain/cornerAnalysis/paceGoal.js';
import type { CornerAnalysis, CornerHabit, HabitAction, HabitCause, TurnMeasures } from '../../../shared/types/corners/cornerAnalysis.js';

/** A corner in one session: its cost to the target, its habit's priority (none without one) and the habit's measures. */
interface Corner {
  cost: number;
  priority?: number;
  /** The habit's own gap (km/h under the target at the slowest point). */
  gap?: number;
  action?: HabitAction;
  otherActions?: HabitAction[];
  /** The action's gap in this session, whether or not it is advised. */
  brakeLater?: number;
  reachInside?: number;
  causes?: HabitCause[];
  exitOnly?: boolean;
  /** A loss no rule explains instead of a habit. */
  unexplained?: boolean;
}

const CORNERS: FocusCornerRef[] = [0, 1, 2, 3].map(id => ({ id, name: `T${id + 1}`, turnIds: [id] }));
const IDS = CORNERS.map(corner => corner.id);

function habitOf(id: number, corner: Corner): CornerHabit {
  const exitOnly = corner.exitOnly === true;
  return {
    cornerId: id, turnId: id, turnLabel: `T${id + 1}`, half: exitOnly ? 'out' : 'in', lossSec: corner.cost, sameCarLossSec: null,
    rule: corner.unexplained ? null : exitOnly ? 'exitSpeed' : 'overSlowing', gap: corner.gap ?? 5,
    speeds: { minKmh: exitOnly ? 90 : 85, targetMinKmh: 90, exitKmh: 145, targetExitKmh: 150 }, kind: null, arc: null,
    action: corner.action ?? null, otherActions: corner.otherActions ?? [], causes: corner.causes ?? [], repeatability: 1, confidence: 1, priority: corner.priority ?? 0,
    line: `Carry 5 km/h more through T${id + 1}`, detail: '',
  };
}

/** Session `index` (0 the oldest) with the given corners measured; a corner left out was not measured. */
function session(index: number, corners: Record<number, Corner>): AnalysedSession {
  const entries = Object.entries(corners).map(([id, corner]) => [Number(id), corner] as const);
  const measures = entries.map(([id, corner]): TurnMeasures => ({
    turnId: id,
    rules: { brakesWhereLift: null, overSlowing: corner.gap ?? null, brakeEarly: null, exitSpeed: null },
    actions: { lift: null, brakeLater: corner.brakeLater ?? null, brakeShorter: null, turnInEarlier: null, reachInside: corner.reachInside ?? null },
  }));
  const analysis: CornerAnalysis = {
    laps: 5,
    corners: entries.map(([id, corner]) => ({
      id, label: `T${id + 1}`, name: `T${id + 1}`, turnIds: [id], usualSec: 10 + corner.cost, usualLapOrdinal: index + 1, lossSec: corner.cost,
      reference: { sessionId: 'target', driverOrdinal: 4, name: 'Bob', car: 'Car A', laps: 5, usualSec: 10, usualLapOrdinal: 2 },
    })),
    target: { sessionId: 'target', driverOrdinal: 4, name: 'Bob', car: 'Car A', laps: 5, paceSec: 100 },
    sameCarReference: null,
    habits: entries.filter(([, corner]) => (corner.priority ?? 0) > 0 && !corner.unexplained).map(([id, corner]) => habitOf(id, corner))
      .toSorted((a, b) => b.priority - a.priority),
    unexplained: entries.filter(([, corner]) => corner.unexplained).map(([id, corner]) => habitOf(id, corner)),
    carDifferences: [], mistakes: [], measures,
  };
  return { sessionId: `s${index + 1}`, timestamp: 1000 * (index + 1), sessionType: 'Race', driverOrdinal: 7, analysis };
}

/** Sessions oldest first, each a list of [cost, priority] per corner id. */
const history = (...rows: Array<Record<number, Corner>>) => rows.map((corners, index) => session(index, corners));
const at = (cost: number, priority = cost): Corner => ({ cost, priority });

describe('walkFocus', () => {
  it('starts with the 2 highest scores and carries them over while no corner clearly beats one', () => {
    // T3 edges past T2 in the second session only: the mean of its sessions (0.16) is under T2's.
    const steps = walkFocus(history({ 0: at(0.3), 1: at(0.2), 2: at(0.1) }, { 0: at(0.3), 1: at(0.2), 2: at(0.22) }), IDS);
    expect(steps).toEqual([[0, 1], [0, 1]]);
  });

  it('lets a corner enter only with a named habit in 2 of its last sessions: a one-off never picks the focus', () => {
    const steps = walkFocus(history(
      { 0: at(0.3), 1: at(0.1, 0), 2: at(0.1, 0) },
      { 0: at(0.3), 1: at(0.9), 2: at(0.1, 0) },
      { 0: at(0.3), 1: at(0.9), 2: at(0.1, 0) },
    ), IDS);
    // Alone at the start, the one-off left out of the free slot, then in once it showed twice.
    expect(steps).toEqual([[0], [0], [1, 0]]);
  });

  it('gives a slot to a clear challenger: 20% above a focus corner in 2 sessions running, the lowest one it beats', () => {
    const steps = walkFocus(history(
      { 0: at(0.3), 1: at(0.2), 2: at(0.1) },
      // T3's score is 0.3: above T2's by more than 20% for the first session, level with T1's.
      { 0: at(0.3), 1: at(0.2), 2: at(0.5) },
      { 0: at(0.3), 1: at(0.2), 2: at(0.5) },
    ), IDS);
    expect(steps).toEqual([[0, 1], [0, 1], [2, 0]]);
  });

  it('takes a slot back from a corner with nothing left, and scores a corner over the sessions that measured it', () => {
    const later = { 0: at(0.1, 0), 1: at(0.2), 2: at(0.05) };
    const steps = walkFocus(history({ 0: at(0.3), 1: at(0.2), 2: at(0.05) }, later, later, later, later, later), IDS);
    // T1 keeps its slot while one of its last 5 sessions named a habit, then gives it back.
    expect(steps[4]).toEqual([1, 0]);
    expect(steps[5]).toEqual([1, 2]);
    // A session that did not measure T1 does not count in its window: the old habit stays in it for one session more.
    const gap = walkFocus(history({ 0: at(0.3), 1: at(0.2), 2: at(0.05) }, later, later, { 1: at(0.2), 2: at(0.05) }, later, later), IDS);
    expect(gap[5]).toEqual([1, 0]);
  });

  it('never picks a habit slower at the exit only, though it is shown', () => {
    const exit = { cost: 0.4, priority: 0.4, exitOnly: true };
    const sessions = history({ 0: exit, 1: at(0.2) }, { 0: exit, 1: at(0.2) });
    expect(walkFocus(sessions, IDS)).toEqual([[1], [1]]);
    // Pinned, its habit still shows.
    expect(habitFocus(sessions, CORNERS, [0]).corners[0]).toMatchObject({ cornerId: 0, pinned: true, habit: { rule: 'exitSpeed' } });
  });

  it('scores corners by whole-corner cost rather than a split half-turn priority, and skips non-positive corner costs', () => {
    // T1 loses 0.50 s overall even though its single-half habit priority is only 0.15; it outranks T2 (0.30 s) and T3 (0.25 s).
    const splitCorner = { cost: 0.5, priority: 0.15 };
    const quickerOverall = { cost: -0.05, priority: 0.2 };
    const steps = walkFocus(history({ 0: splitCorner, 1: at(0.3), 2: at(0.25), 3: quickerOverall }), IDS);
    expect(steps).toEqual([[0, 1]]);
  });
});

describe('habitFocus', () => {
  const sessions = history(
    { 0: at(0.3), 1: at(0.2), 2: at(0.1), 3: at(0.05, 0) },
    { 0: at(0.3), 1: at(0.2), 2: at(0.5), 3: at(0.05, 0) },
    { 0: at(0.28), 1: at(0.2), 2: at(0.5), 3: at(0.05, 0) },
  );

  it('shows the focus of the latest session with the progress on it and on the corner that left', () => {
    const focus = habitFocus(sessions, CORNERS, []);
    expect(focus.sessions).toBe(3);
    expect(focus.corners.map(corner => [corner.cornerId, corner.name, corner.pinTurnId, corner.pinned, corner.costSec, corner.habit?.rule])).toEqual([
      [2, 'T3', 2, false, 0.5, 'overSlowing'], [0, 'T1', 0, false, 0.28, 'overSlowing']]);
    // Leaving is not fixing: T2 keeps a row for 3 sessions after leaving, then drops off.
    expect(focus.progress.map(row => [row.cornerId, row.state, row.since.sessionId, row.costThenSec, row.costNowSec])).toEqual([
      [2, 'focus', 's1', 0.1, 0.5], [0, 'focus', 's1', 0.3, 0.28], [1, 'left', 's1', 0.2, 0.2]]);
    expect(focus.progress[1]).toMatchObject({ since: { driverOrdinal: 7, sessionType: 'Race', timestamp: 1000 }, view: { lapOrdinal: 3, thenLapOrdinal: 1 }, slipping: false });
    const afterThree = history(
      { 0: at(0.3), 1: at(0.2), 2: at(0.1) },
      { 0: at(0.3), 1: at(0.2), 2: at(0.5) },
      { 0: at(0.3), 1: at(0.2), 2: at(0.5) }, // T2 leaves here (1st session out)
      { 0: at(0.3), 1: at(0.2), 2: at(0.5) }, // 2nd session out
      { 0: at(0.3), 1: at(0.2), 2: at(0.5) }, // 3rd session out (still shown)
      { 0: at(0.3), 1: at(0.2), 2: at(0.5) }, // 4th session out (dropped)
    );
    expect(habitFocus(afterThree.slice(0, 5), CORNERS, []).progress.some(row => row.cornerId === 1 && row.state === 'left')).toBe(true);
    expect(habitFocus(afterThree, CORNERS, []).progress.some(row => row.cornerId === 1 && row.state === 'left')).toBe(false);
    // A graduated corner whose habit cleared still carries the gap of the habit it worked on, so the debrief shows what improved.
    const graduated = history(
      { 0: at(0.3), 1: { cost: 0.2, priority: 0.2, gap: 6 }, 2: at(0.1) },
      { 0: at(0.3), 1: { cost: 0.15, priority: 0.15, gap: 4 }, 2: at(0.5) },
      { 0: at(0.3), 1: { cost: 0.04, priority: 0, gap: 0.2 }, 2: at(0.5) },
    );
    expect(habitFocus(graduated, CORNERS, []).progress.find(row => row.cornerId === 1)).toMatchObject({
      state: 'left', gap: { rule: 'overSlowing', turnLabel: 'T2', unit: 'km/h', before: 6, now: 0.2 },
    });
  });

  it('hides an automatic focus without a measured cost for this session and keeps pins', () => {
    const partial = history({ 0: at(0.3), 1: at(0.2) }, { 0: at(0.4), 1: at(0.2) });
    partial[1].analysis.corners[0].lossSec = null;
    expect(walkFocus(partial, IDS).at(-1)).toEqual([0, 1]);
    expect(habitFocus(partial, CORNERS, []).corners.map(corner => corner.cornerId)).toEqual([1]);
    expect(cornerFocusTrends(partial, CORNERS, []).get(0)?.focus).toBeNull();
    expect(habitFocus(partial, CORNERS, [0]).corners[0]).toMatchObject({ cornerId: 0, pinned: true, costSec: null });
  });

  it('lets pins hold a slot until unpinned: at most 2, the rules fill the rest', () => {
    const pinned = habitFocus(sessions, CORNERS, [1]);
    expect(pinned.corners.map(corner => [corner.cornerId, corner.pinned])).toEqual([[1, true], [2, false]]);
    // A pinned corner with no named habit says so and still shows its cost.
    expect(habitFocus(sessions, CORNERS, [3]).corners[0]).toMatchObject({ cornerId: 3, pinned: true, habit: null, costSec: 0.05 });
    // A third pin and a pin on a corner the layout no longer has are left out.
    expect(habitFocus(sessions, CORNERS, [9, 1, 3, 0]).corners.map(corner => corner.cornerId)).toEqual([1, 3]);
    // No session yet: no focus.
    expect(habitFocus([], CORNERS, [1])).toMatchObject({ sessions: 0, progress: [] });
  });

  it("shows the habit's gap then against now, and whether the try the session before advised worked", () => {
    const action: HabitAction = { type: 'brakeLater', gap: 10, line: 'Brake 10 m later' };
    const tried = (now: Corner) => habitFocus(history(
      { 0: { cost: 0.3, priority: 0.3, gap: 5, action, brakeLater: 10 } },
      { 0: { cost: 0.3, priority: 0.3, gap: 5, action, brakeLater: 10 } },
      { 0: now },
    ), CORNERS, []).progress[0];
    // The driver braked 8 m later and the corner's cost followed.
    const worked = tried({ cost: 0.24, priority: 0.24, gap: 3, brakeLater: 2 });
    expect(worked.gap).toEqual({ rule: 'overSlowing', turnLabel: 'T1', unit: 'km/h', before: 5, now: 3 });
    expect(worked.tried).toMatchObject({ action: 'brakeLater', turnLabel: 'T1', did: 'braked 8 m later', moved: 8, worked: true });
    expect(worked.tried?.costChangeSec).toBeCloseTo(-0.06);
    // Braked later and the corner is no quicker.
    expect(tried({ cost: 0.3, priority: 0.3, gap: 5, brakeLater: 2 }).tried).toMatchObject({ did: 'braked 8 m later', worked: false });
    // The brake point did not move by a step: nothing was tried.
    expect(tried({ cost: 0.24, priority: 0.24, gap: 3, brakeLater: 9 }).tried).toBeNull();
    // No named habit now: no gap to show.
    expect(tried({ cost: 0.24, priority: 0 }).gap).toBeNull();
  });

  it('offers the next action after a try that gave no gain, and the first again once every one was tried', () => {
    const later: HabitAction = { type: 'brakeLater', gap: 10, line: 'Brake 10 m later' };
    const inside: HabitAction = { type: 'reachInside', gap: 1.2, line: 'Get closer to the inside at the apex' };
    const cause = { type: 'brakePoint' as const, gap: 10, line: 'braking 10 m earlier' };
    const tryAt = (cost: number, brakeLater: number, reachInside = 1.2): Corner => ({ cost, priority: cost, gap: 5, action: later, otherActions: [inside], brakeLater, reachInside });
    const focusOf = (...corners: Corner[]) => habitFocus(history(...corners.map(corner => ({ 0: corner }))), CORNERS, []);
    const advised = (...corners: Corner[]) => focusOf(...corners).corners[0].habit;
    // Nothing tried yet: the habit's first action.
    expect(advised(tryAt(0.3, 10), tryAt(0.3, 10))).toMatchObject({ action: later, otherActions: [inside] });
    // Braked 8 m later and the corner is no quicker: the next action; a cause it does not say stays.
    const next = habitFocus(history({ 0: tryAt(0.3, 10) }, { 0: { ...tryAt(0.3, 2), causes: [cause] } }), CORNERS, []);
    expect(next.corners[0].habit).toMatchObject({ action: inside, otherActions: [later], causes: [cause] });
    expect(next.progress[0].tried).toMatchObject({ action: 'brakeLater', worked: false });
    // Not tried in the session after (the apex did not move): the same next action stays.
    expect(advised(tryAt(0.3, 10), tryAt(0.3, 2), tryAt(0.3, 2))).toMatchObject({ action: inside });
    // The apex tried too, no gain: everything was tried, so the first again; the row says the try that was shown.
    const again = focusOf(tryAt(0.3, 10), tryAt(0.3, 2), tryAt(0.3, 2, 0.4));
    expect(again.corners[0].habit).toMatchObject({ action: later });
    expect(again.progress[0].tried).toMatchObject({ action: 'reachInside', did: 'got a little closer to the inside at the apex', worked: false });
    // A try that paid keeps its action, including an alternate action while it still applies.
    expect(advised(tryAt(0.3, 10), tryAt(0.2, 2))).toMatchObject({ action: later });
    const alternatePaid = focusOf(tryAt(0.3, 10), tryAt(0.3, 2), tryAt(0.18, 2, 0.5));
    expect(alternatePaid.corners[0].habit).toMatchObject({ action: inside, otherActions: [later] });
    expect(alternatePaid.progress[0].tried).toMatchObject({ action: 'reachInside', worked: true });
    // Still kept on the next session when nothing moved yet; only once its gap closes does it start over with the first.
    expect(advised(tryAt(0.3, 10), tryAt(0.3, 2), tryAt(0.18, 2, 0.5), tryAt(0.18, 2, 0.5))).toMatchObject({ action: inside });
    expect(advised(tryAt(0.3, 10), tryAt(0.3, 2), { ...tryAt(0.18, 2, 0.5), otherActions: [] })).toMatchObject({ action: later });
    // The corner trends offer the same action as the debrief.
    expect(cornerFocusTrends(history({ 0: tryAt(0.3, 10) }, { 0: tryAt(0.3, 2) }), CORNERS, []).get(0)?.habit).toMatchObject({ action: inside });
  });

  it('tags a corner slipping when its cost sits 0.10 s above its recent level in 2 sessions running', () => {
    const costs = (...values: number[]) => habitFocus(history(...values.map(cost => ({ 0: at(cost) }))), CORNERS, []);
    expect(costs(0.2, 0.2, 0.2, 0.35).corners[0].slipping).toBe(false);
    const slipping = costs(0.2, 0.2, 0.2, 0.35, 0.35);
    expect(slipping.corners[0].slipping).toBe(true);
    expect(slipping.progress[0].slipping).toBe(true);
    // 0.05 s above is ordinary scatter.
    expect(costs(0.2, 0.2, 0.2, 0.25, 0.25).corners[0].slipping).toBe(false);
  });
});

describe('cornerFocusTrends', () => {
  const sessions = history(
    { 0: at(0.3), 1: { cost: 0.2, priority: 0.2, gap: 6 }, 2: at(0.1) },
    { 0: at(0.3), 1: { cost: 0.2, priority: 0.2, gap: 4 }, 2: at(0.5) },
    { 0: at(0.28), 1: { cost: 0.2, priority: 0.2, gap: 3 }, 2: at(0.5), 3: { cost: 0.07, unexplained: true } },
  );

  it("marks the focus corners of the same walk and gives each corner's cost and gap series", () => {
    const trends = cornerFocusTrends(sessions, CORNERS, []);
    expect([...trends].map(([id, trend]) => [id, trend.focus])).toEqual([[0, 'focus'], [1, null], [2, 'focus'], [3, null]]);
    expect(trends.get(1)).toMatchObject({
      session: { sessionId: 's3' }, costSec: 0.2, pinTurnId: 1, slipping: false, habit: { rule: 'overSlowing' },
      gap: { rule: 'overSlowing', turnLabel: 'T2', unit: 'km/h' },
      series: [{ session: { sessionId: 's1' }, costSec: 0.2, gap: 6 }, { session: { sessionId: 's2' }, costSec: 0.2, gap: 4 }, { session: { sessionId: 's3' }, costSec: 0.2, gap: 3 }],
      view: { lap: { sessionId: 's3', driverOrdinal: 7, lapOrdinal: 3 }, reference: { sessionId: 'target', driverOrdinal: 4, lapOrdinal: 2, name: 'Bob' } },
    });
    // A loss no rule explains is the corner's line when it has no habit: an observation, with no gap to follow.
    expect(trends.get(3)).toMatchObject({ habit: { rule: null }, gap: null, series: [{ costSec: 0.07, gap: null }] });
  });

  it("marks the driver's own pick, and has nothing without a session", () => {
    expect([...cornerFocusTrends(sessions, CORNERS, [1])].map(([id, trend]) => [id, trend.focus])).toEqual([[0, null], [1, 'pinned'], [2, 'focus'], [3, null]]);
    expect(cornerFocusTrends([], CORNERS, []).size).toBe(0);
  });
});

describe('paceGoal', () => {
  it('rates the true pace like a pace badge and gives the seconds to find for the level above', () => {
    // 102.3% of the benchmark target is Good; Competitive starts at 101.5%.
    const goal = paceGoal(100, 102.3);
    expect(goal).toMatchObject({ benchmarkSec: 100, percent: 102.3, level: 'Good', next: { level: 'Competitive', maxPercent: 101.5 } });
    expect(goal?.next?.toFindSec).toBeCloseTo(0.8);
    // Each level aims for the one above, never straight for the top.
    expect([108, 106, 104.2, 101.5, 100.51].map(pace => [paceGoal(100, pace)?.level, paceGoal(100, pace)?.next?.level])).toEqual([
      ['Offline', 'Tail-ender'], ['Tail-ender', 'Midpack'], ['Midpack', 'Good'], ['Competitive', 'Alien'], ['Competitive', 'Alien'],
    ]);
    expect(paceGoal(100, 104.2)?.next?.toFindSec).toBeCloseTo(0.7);
    // The top level has nothing above.
    expect(paceGoal(100, 100.5)).toEqual({ benchmarkSec: 100, percent: 100.5, level: 'Alien', next: null });
  });

  it('has no goal without a true pace or a benchmark target', () => {
    expect(paceGoal(100, null)).toBeNull();
    expect(paceGoal(null, 101.8)).toBeNull();
    expect(paceGoal(0, 101.8)).toBeNull();
  });
});
