import { describe, expect, it } from 'vitest';
import { cornerNumbering, watchNextSession } from '../../../../src/components/session-detail/debrief/watchNextSession.js';
import { habitGapText } from '../../../../src/components/session-detail/debrief/habitText.js';
import type { LayoutCorners } from '../../../../shared/types/corners/cornerPasses.js';
import type { PaceGoal } from '../../../../shared/types/corners/habitFocus.js';
import { analysis, layout, ME, session } from './debriefFixtures.js';

const lapNumberOf = (lapOrdinal: number) => session.drivers[0].laps[lapOrdinal]?.lapNumber ?? null;
const numbers = cornerNumbering(layout as unknown as LayoutCorners);
const params = (link: string | null | undefined) => Object.fromEntries(new URLSearchParams((link ?? '').split('?')[1]));
const watchOf = (changes: Partial<typeof analysis> = {}) => watchNextSession({ ...analysis, ...changes }, ME, numbers, lapNumberOf);

describe('watchNextSession', () => {
  it('numbers corners from the start of the lap like the lap view', () => {
    expect([3, 5, 9, 7].map(numbers)).toEqual([1, 2, 3, null]);
    expect(cornerNumbering(null)(5)).toBeNull();
  });

  it("shows the 2 focus corners as the engine picked them, each opening against its corner's reference", () => {
    const fallback = { ...analysis.corners[0].reference!, name: 'Dee Reference', sessionId: 'D1' };
    const watch = watchOf({ corners: [{ ...analysis.corners[0], reference: fallback }, ...analysis.corners.slice(1)] });
    expect(watch.focus.map(row => [row.line, row.rule, row.costSec, row.share, row.pinned, row.slipping])).toEqual([
      ['Carry 4 km/h more through T2', 'overSlowing', 0.2, 1, false, false],
      ['Brake 10 m later', 'brakeEarly', 0.1, 0.75, true, true],
    ]);
    // The speeds to hit and the kind of loss, the one thing to try, and what else was measured.
    expect(watch.focus[0]).toMatchObject({
      name: 'T1–T2', speedLine: 'Apex 96 → 100 km/h', diagnosis: 'tighter arc: 80 m radius against 87 m',
      detail: 'Apex 96 km/h, target 100 km/h · tighter arc: 80 m radius against 87 m', tryLine: 'Get closer to the inside at the apex',
      tryTitle: 'The target is 1.2 m closer to the inside at the apex than you', pinTurnId: 1,
    });
    expect(watch.focus[0].causes.map(cause => cause.line)).toEqual(['braking 0.4 s longer', '0.2 s more coasting']);
    expect(watch.focus[0].causes[0].explanation).toContain('brake pedal');
    expect(watch.focus[0].causes[1].explanation).toContain('off both pedals');
    // A brake point is its own advice: not said twice.
    expect(watch.focus[1]).toMatchObject({ tryLine: null, tryTitle: undefined, causes: [], pinTurnId: 4 });
    expect(params(watch.focus[0].link)).toEqual({
      sessionId: 'R1', driverOrdinal: '0', lapOrdinal: '2', baselineSessionId: 'D1', baselineDriverOrdinal: '2', baselineLapOrdinal: '6',
      compareDriver: 'Dee Reference', corner: '2', view: '2d',
    });
    expect(watch.pinScope).toEqual({ layoutKey: 'test_gp', carClass: 'Hyper' });
    expect(watchOf({ car: null }).pinScope).toEqual({ layoutKey: 'test_gp', carClass: 'Hyper' });
  });

  it('says so for a pinned corner without a habit, and has no link without a usual lap or a reference', () => {
    const [corner] = analysis.focus.corners;
    const watch = watchOf({
      corners: [{ ...analysis.corners[0], reference: null }],
      focus: { ...analysis.focus, corners: [{ ...corner, pinned: true, habit: null, costSec: null }, { ...corner, cornerId: 77 }] },
    });
    expect(watch.focus[0]).toMatchObject({ line: 'T1–T2', rule: null, detail: 'No habit named here this session.', tryLine: null, causes: [], share: null, costSec: null, link: null });
    expect(watch.focus[1]).toMatchObject({ link: null });
    expect(watch.hasReference).toBe(false);
  });

  it('shows the gap and the cost then against now, and whether the last try worked', () => {
    const watch = watchOf();
    expect(watch.sessions).toBe(4);
    expect(watch.earlierSessions).toBe(3);
    expect(watch.progress.map(row => [row.name, row.state, row.costThenSec, row.costNowSec, row.gap, row.tried?.line ?? null])).toEqual([
      ['T1–T2', 'focus', 0.31, 0.2, 'Minimum speed at T2: 7 km/h under → 4 km/h under', 'Last try: you got a little closer to the inside at the apex at T2 · the corner is 0.06 s quicker'],
      ['T7', 'left', 0.15, 0.16, 'Brake point at T7: 12 m early → 2 m early', null],
    ]);
    expect(watch.progress[0].sinceLabel).toBe('Oct 21 Practice');
    // It opens this session's usual lap through the corner against that session's.
    expect(params(watch.progress[0].link)).toEqual({
      sessionId: 'R1', driverOrdinal: '0', lapOrdinal: '2', baselineSessionId: 'P1', baselineDriverOrdinal: '1', baselineLapOrdinal: '5',
      compareDriver: ME, corner: '2', view: '2d',
    });
    expect(watch.progress[1].link).toBeNull();
    // A try the cost did not follow is said as plainly.
    const [row] = analysis.focus.progress;
    const missed = watchOf({ focus: { ...analysis.focus, sessions: 9, progress: [{ ...row, tried: { ...row.tried!, costChangeSec: 0.01, worked: false } }] } });
    expect(missed.progress[0].tried).toEqual({
      worked: false, title: 'Your usual moved 0.8 m closer to the inside at the apex',
      line: 'Last try: you got a little closer to the inside at the apex at T2 · no gain in the corner yet',
    });
    // A try counted in metres or seconds says its number in the line: no tooltip.
    const braked = watchOf({ focus: { ...analysis.focus, progress: [{ ...row, tried: { ...row.tried!, action: 'brakeLater', did: 'braked 8 m later', moved: 8 } }] } });
    expect(braked.progress[0].tried).toMatchObject({ title: undefined, line: 'Last try: you braked 8 m later at T2 · the corner is 0.06 s quicker' });
    // The progress reads the last 5 sessions at most.
    expect(missed.sessions).toBe(5);
  });

  it('words a gap on either side of the target', () => {
    expect(habitGapText('overSlowing', 'km/h', 3)).toBe('3 km/h under');
    expect(habitGapText('exitSpeed', 'km/h', -2)).toBe('2 km/h over');
    expect(habitGapText('brakeEarly', 'm', 11)).toBe('11 m early');
    expect(habitGapText('brakeEarly', 'm', -4)).toBe('4 m late');
    expect(habitGapText('brakesWhereLift', 'points', 40)).toBe('40 points more');
    expect(habitGapText('overSlowing', 'km/h', 0.3)).toBe('level');
  });

  it('puts the session against the next pace level in one line', () => {
    const goal = analysis.goal as PaceGoal;
    expect(watchOf().goal).toEqual({
      reached: false, level: 'Good', percent: 102.3, next: { level: 'Competitive', toFindSec: 0.76 },
      line: '0.76 s to find for Competitive pace · Good now',
      title: 'Your true pace (the average of your 3 fastest clean dry laps) is 102.3% of the benchmark target of this layout and class, 1:35.000: Good. Competitive starts at 101.5%, 1:36.425',
    });
    // Nothing above the top level.
    expect(watchOf({ goal: { ...goal, percent: 100.3, level: 'Alien', next: null } }).goal).toMatchObject({ reached: true, level: 'Alien', next: null, line: 'Alien pace: the top level' });
    expect(watchOf({ goal: null }).goal).toBeNull();
  });

  it('keeps the biggest one-off the driver caused and compares that lap to their usual there', () => {
    const { mistake } = watchOf();
    // T4's 0.60 s was traffic: not theirs to fix.
    expect(mistake).toMatchObject({ lapNumber: 20, turnLabel: 'T2', lossSec: 0.3, cause: { label: 'a slow exit' } });
    expect(mistake?.cause?.explanation).toBe('At least 5 km/h slower on the way out than on your usual lap.');
    expect(params(mistake?.link)).toMatchObject({ lapOrdinal: '3', baselineDriverOrdinal: '0', baselineLapOrdinal: '2', compareDriver: ME, corner: '2' });
  });

  it('opens no comparison for a mistake on the usual lap itself', () => {
    const { mistake } = watchOf({ mistakes: [analysis.mistakes[2]] });
    expect(mistake?.link).toBeNull();
  });
});
