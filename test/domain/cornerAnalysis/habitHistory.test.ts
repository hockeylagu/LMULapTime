import { describe, expect, it } from 'vitest';
import { cornerHabitTrend, habitCue, type AnalysedSession } from '../../../shared/domain/cornerAnalysis/habitHistory.js';
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
  return { sessionId: `s${id}`, timestamp: id, sessionType: 'Race', analysis, turns: new Map([[1, usual(turn)]]) };
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

describe('cornerHabitTrend', () => {
  const brake = habit('brakeEarly', 'Brake 10 m later into T1');

  it('counts the sessions the main habit showed in, and measures the corner against the session before', () => {
    const sessions = [session(4, 4.0, [brake], { brakeM: 704 }), session(3, 4.1, [brake]), session(2, 4.2, []), session(1, 4.3, [brake])];
    expect(cornerHabitTrend(7, sessions, 5000)).toMatchObject({
      session: { sessionId: 's4', timestamp: 4, sessionType: 'Race' }, habit: { line: 'Brake 10 m later into T1', rule: 'brakeEarly' },
      seen: 3, of: 4, since: { sessionId: 's3' }, change: { isNew: false, cue: 'brake 4 m later' }, fixed: null,
    });
    expect(cornerHabitTrend(7, sessions, 5000)?.gainSec).toBeCloseTo(0.1);
    // Only the last five are read.
    expect(cornerHabitTrend(7, [...sessions, ...sessions], 5000)).toMatchObject({ seen: 4, of: 5 });
    // A session too short to measure the corner neither shows the habit nor counts against it.
    expect(cornerHabitTrend(7, [sessions[0], session(3, null, []), sessions[1]], 5000)).toMatchObject({ seen: 2, of: 2 });
  });

  it('calls a habit new, says which one went, and falls back on a loss no rule explains', () => {
    const lift = habit(null, 'T1 loses 0.10 s in: no clear cause');
    expect(cornerHabitTrend(7, [session(2, 4.0, [lift]), session(1, 4.1, [brake])], 5000)).toMatchObject({
      habit: { line: lift.line, rule: null }, seen: 1, change: { isNew: true, cue: null }, fixed: 'Brake 10 m later into T1',
    });
    expect(cornerHabitTrend(7, [session(1, 4.0, [])], 5000)).toMatchObject({ habit: null, seen: 0, of: 1, since: null, gainSec: null, change: null });
  });

  it('has nothing for a corner the latest session has no usual through', () => {
    expect(cornerHabitTrend(7, [session(2, null, [brake]), session(1, 4.0, [brake])], 5000)).toBeNull();
    expect(cornerHabitTrend(7, [], 5000)).toBeNull();
  });
});
