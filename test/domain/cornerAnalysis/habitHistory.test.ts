import { describe, expect, it } from 'vitest';
import { cornerHabitTrend, habitCue, sessionHabitProgress, type AnalysedSession } from '../../../shared/domain/cornerAnalysis/habitHistory.js';
import type { TurnUsual } from '../../../shared/domain/cornerAnalysis/turnUsual.js';
import type { CornerAnalysis, CornerHabit, HabitRule } from '../../../shared/types/corners/cornerAnalysis.js';

const usual = (values: Partial<TurnUsual> = {}): TurnUsual => ({
  laps: 4, sec: 4, toApexSec: 2, fromApexSec: 2, entryKmh: 200, minKmh: 90, exitKmh: 150, minSpeedM: 800, brakeM: 700, brakeShare: 1,
  peakBrake: 0.9, brakeSec: 1, partThrottleSec: 0.5, absSec: 0, gear: 3, spreadSec: 0.02,
  coastSec: 0, ...values,
});

const habit = (rule: HabitRule | null, line: string, turnId = 1): CornerHabit => ({
  cornerId: 7, turnId, turnLabel: `T${turnId}`, half: 'in', lossSec: 0.1, sameCarLossSec: null, rule, gap: 1, repeatability: 1,
  confidence: 1, priority: 0.1, line, detail: '',
});

/** A session whose corner 7 takes `usualSec`, with its habits and the driver's usual through turn 1. */
function session(id: number, usualSec: number | null, habits: CornerHabit[], turn: Partial<TurnUsual> = {}): AnalysedSession {
  const analysis: CornerAnalysis = {
    laps: 4, sameCarReference: null, carDifferences: [], mistakes: [],
    corners: [{ id: 7, label: 'SQ1', name: 'T1', turnIds: [1], usualSec, usualLapOrdinal: 1, lossSec: 0.1, reference: null }],
    habits: habits.filter(item => item.rule !== null), unexplained: habits.filter(item => item.rule === null),
  };
  return { sessionId: `s${id}`, timestamp: id, sessionType: 'Race', driverOrdinal: 0, analysis, turns: new Map([[1, usual(turn)]]) };
}

describe('habitCue', () => {
  it('names the cue each rule measures, the driver now against then', () => {
    const then = usual();
    const cue = (rule: HabitRule, now: Partial<TurnUsual>) => habitCue(rule, usual(now), then, 5000);
    expect(cue('brakeEarly', { brakeM: 706 })).toBe('brake 6 m later');
    expect(cue('brakeEarly', { brakeM: 700.4 })).toBe('same brake point');
    expect(cue('apexEarly', { minSpeedM: 795 })).toBe('slowest point 5 m earlier');
    expect(cue('overSlowing', { minKmh: 93 })).toBe('3 km/h more in the middle');
    expect(cue('inFastOutSlow', { minKmh: 88 })).toBe('2 km/h less in the middle');
    expect(cue('partThrottle', { partThrottleSec: 0.3 })).toBe('0.2 s less part throttle');
    expect(cue('dragBrake', { brakeSec: 1.3 })).toBe('braking 0.3 s longer');
    expect(cue('brakesWhereLift', { peakBrake: 0.7 })).toBe('peak brake 20 points lighter');
    expect([cue('gear', { gear: 4 }), cue('gear', {})]).toEqual(['gear 4 (was 3)', 'same gear']);
    // Across the start line: the short way round.
    expect(habitCue('brakeEarly', usual({ brakeM: 2 }), usual({ brakeM: 4996 }), 5000)).toBe('brake 6 m later');
    expect([habitCue(null, then, then, 5000), habitCue('brakeEarly', undefined, then, 5000), cue('brakeEarly', { brakeM: null })]).toEqual([null, null, null]);
  });
});

/** The session with a reference at corner 7: its habits there were measured. */
const measured = (now: AnalysedSession): AnalysedSession => {
  now.analysis.corners[0].reference = {
    sessionId: 'r', driverOrdinal: 1, name: 'Reference', car: null, sameSession: true, laps: 4,
    usualSec: 4, usualLapOrdinal: 1,
  };
  return now;
};

describe('sessionHabitProgress', () => {
  const brake = habit('brakeEarly', 'Brake later into T1');

  it('reports a cue that improves while a habit persists, and resolves it only when it clears', () => {
    const previous = session(1, 4.2, [brake]);
    const improving = measured(session(2, 4.1, [brake], { brakeM: 706 }));
    expect(sessionHabitProgress(improving, previous, 5000)).toMatchObject([{ status: 'improving', cue: 'brake 6 m later' }]);
    const resolved = measured(session(2, 4.1, [], { brakeM: 706 }));
    expect(sessionHabitProgress(resolved, previous, 5000)).toMatchObject([{ status: 'resolved', cue: 'brake 6 m later' }]);
    expect(sessionHabitProgress(resolved, previous, 5000)[0].gainSec).toBeCloseTo(0.1);
    expect(sessionHabitProgress(measured(session(2, 4.3, [], { brakeM: 706 })), previous, 5000)).toEqual([]);
    expect(sessionHabitProgress(measured(session(2, 4.1, [])), previous, 5000)).toEqual([]);
    expect(sessionHabitProgress(session(2, 4.1, [], { brakeM: 706 }), previous, 5000)).toEqual([]);
  });

  it('uses less mid-corner speed for fast-in/slow-out and rejects gear movement away from the target', () => {
    const fastIn = habit('inFastOutSlow', 'Give up speed in the middle of T1');
    const previous = session(1, 4.2, [fastIn]);
    expect(sessionHabitProgress(measured(session(2, 4.1, [], { minKmh: 88 })), previous, 5000)).toMatchObject([
      { status: 'resolved', cue: '2 km/h less in the middle' },
    ]);
    expect(sessionHabitProgress(measured(session(2, 4.1, [], { minKmh: 92 })), previous, 5000)).toEqual([]);
    const gear = habit('gear', 'Try gear 2 through T1');
    expect(sessionHabitProgress(measured(session(2, 4.1, [], { gear: 4 })), session(1, 4.2, [gear]), 5000)).toEqual([]);
  });
});

describe('cornerHabitTrend', () => {
  const brake = { ...habit('brakeEarly', 'Brake 10 m later into T1'), detail: 'You brake 10 m before Ref Driver' };

  it('counts the sessions the main habit showed in, and measures the corner against the session before', () => {
    const sessions = [session(4, 4.0, [brake], { brakeM: 704 }), session(3, 4.1, [brake]), session(2, 4.2, []), session(1, 4.3, [brake])];
    expect(cornerHabitTrend(7, sessions, 5000)).toMatchObject({
      session: { sessionId: 's4', timestamp: 4, sessionType: 'Race' }, habit: { line: 'Brake 10 m later into T1', rule: 'brakeEarly', detail: brake.detail },
      seen: 3, of: 4, since: { sessionId: 's3' }, change: { isNew: false, cue: 'brake 4 m later' }, fixed: null,
    });
    // Only the last five are read.
    expect(cornerHabitTrend(7, [...sessions, ...sessions], 5000)).toMatchObject({ seen: 4, of: 5 });
    // A session too short to measure the corner neither shows the habit nor counts against it.
    expect(cornerHabitTrend(7, [sessions[0], session(3, null, []), sessions[1]], 5000)).toMatchObject({ seen: 2, of: 2 });
  });

  it("points the lap view at the latest session's usual lap against the reference's", () => {
    const now = session(2, 4.0, [brake]);
    expect(cornerHabitTrend(7, [now], 5000)?.view).toBeNull();
    now.analysis.corners[0].reference = {
      sessionId: 'r', driverOrdinal: 3, name: 'Ref', car: null, sameSession: false, laps: 5, usualSec: 3.9, usualLapOrdinal: 4,
    };
    expect(cornerHabitTrend(7, [now], 5000)?.view).toEqual({
      lap: { sessionId: 's2', driverOrdinal: 0, lapOrdinal: 1 }, reference: { sessionId: 'r', driverOrdinal: 3, lapOrdinal: 4, name: 'Ref' },
    });
  });

  it('calls a habit new, says which one was fixed, and falls back on a loss no rule explains', () => {
    const lift = habit(null, 'Losing time into T1: no clear cause');
    // Braking 8 m later than then, the corner 0.1 s quicker: fixed.
    expect(cornerHabitTrend(7, [measured(session(2, 4.0, [lift], { brakeM: 708 })), session(1, 4.1, [brake])], 5000)).toMatchObject({
      habit: { line: lift.line, rule: null }, seen: 1, change: { isNew: true, cue: null }, fixed: 'Brake 10 m later into T1',
    });
    // Without a reference now nothing was measured at the corner: the habit gone from the list is not fixed.
    expect(cornerHabitTrend(7, [session(2, 4.0, [lift], { brakeM: 708 }), session(1, 4.1, [brake])], 5000)?.fixed).toBeNull();
    const fixed = (now: AnalysedSession, then: AnalysedSession) => cornerHabitTrend(7, [measured(now), then], 5000)?.fixed;
    // Gone from the list but the same brake point, or a brake point under what the cue says: under its threshold, not fixed.
    expect(fixed(session(2, 4.0, [lift]), session(1, 4.1, [brake]))).toBeNull();
    expect(fixed(session(2, 4.0, [lift], { brakeM: 700.4 }), session(1, 4.1, [brake]))).toBeNull();
    // Braking later but the corner slower: not fixed.
    expect(fixed(session(2, 4.2, [lift], { brakeM: 708 }), session(1, 4.1, [brake]))).toBeNull();
    // A loss no rule explains has nothing to fix; a habit still there is not fixed either.
    expect(fixed(session(2, 4.0, []), session(1, 4.1, [lift]))).toBeNull();
    expect(fixed(session(2, 4.0, [brake], { brakeM: 708 }), session(1, 4.1, [brake]))).toBeNull();
    // A fix is said the way its cue goes: less coasting, another gear.
    const coast = habit('coast', "Don't coast into T1");
    expect(fixed(session(2, 4.0, [], { coastSec: 0.2 }), session(1, 4.1, [coast], { coastSec: 0.5 }))).toBe(coast.line);
    expect(fixed(session(2, 4.0, [], { coastSec: 0.6 }), session(1, 4.1, [coast], { coastSec: 0.5 }))).toBeNull();
    const gear = habit('gear', 'Use gear 2 through T1');
    expect([fixed(session(2, 4.0, [], { gear: 2 }), session(1, 4.1, [gear])), fixed(session(2, 4.0, []), session(1, 4.1, [gear]))]).toEqual([gear.line, null]);
    expect(cornerHabitTrend(7, [session(1, 4.0, [])], 5000)).toMatchObject({ habit: null, seen: 0, of: 1, since: null, change: null });
  });

  it('has nothing for a corner the latest session has no usual through', () => {
    expect(cornerHabitTrend(7, [session(2, null, [brake]), session(1, 4.0, [brake])], 5000)).toBeNull();
    expect(cornerHabitTrend(7, [], 5000)).toBeNull();
  });
});
