import { describe, expect, it } from 'vitest';
import { cornerNumbering, watchNextSession } from '../../../../src/components/session-detail/debrief/watchNextSession.js';
import type { LayoutCorners } from '../../../../shared/types/corners/cornerPasses.js';
import { analysis, layout, ME, session } from './debriefFixtures.js';

const lapNumberOf = (lapOrdinal: number) => session.drivers[0].laps[lapOrdinal]?.lapNumber ?? null;
const numbers = cornerNumbering(layout as unknown as LayoutCorners);
const params = (link: string | null) => Object.fromEntries(new URLSearchParams((link ?? '').split('?')[1]));

describe('watchNextSession', () => {
  it('numbers the corners as the lap view does: by where they start on the lap', () => {
    expect([3, 5, 9, 7].map(numbers)).toEqual([1, 2, 3, null]);
    expect(cornerNumbering(null)(5)).toBeNull();
  });

  it('lists the top habits, then the unexplained losses, each opening the usual laps at the corner', () => {
    const watch = watchNextSession(analysis, ME, numbers, lapNumberOf);
    expect(watch.reference).toEqual({ sessionId: 'R1', driverOrdinal: 2, name: 'Bob Quick', car: 'Car B', sameSession: true, laps: 8 });
    expect(watch.habits.map(habit => [habit.line, habit.share])).toEqual([
      ['Brake 10 m later into T1', 0.75], ['Carry 4 km/h more through T2', 1], ['T4 loses 0.08 s in: no clear cause', null],
    ]);
    expect(params(watch.habits[0].link)).toEqual({
      sessionId: 'R1', driverOrdinal: '0', lapOrdinal: '2', baselineSessionId: 'R1', baselineDriverOrdinal: '2', baselineLapOrdinal: '6',
      compareDriver: 'Bob Quick', corner: '2', view: '2d',
    });
    expect(params(watch.habits[2].link)).toMatchObject({ lapOrdinal: '1', baselineLapOrdinal: '4', corner: '3' });
    // Against the practice before: a cue that moved, a new habit, and a loss the practice had no note for.
    expect(watch.habits.map(habit => habit.since)).toEqual([
      expect.stringMatching(/^vs Oct 21 Practice: brake 6 m later$/), expect.stringMatching(/^New since Oct 21 Practice$/), null,
    ]);
    expect(watchNextSession({ ...analysis, sinceLast: null }, ME, numbers, lapNumberOf).habits[0].since).toBeNull();
  });

  it('keeps the three biggest mistakes, each lap against the usual lap at the corner, and names the car turns', () => {
    const watch = watchNextSession(analysis, ME, numbers, lapNumberOf);
    expect(watch.mistakes.map(mistake => [mistake.lapNumber, mistake.line])).toEqual([
      [20, 'T4 +0.60 s: traffic'], [20, 'T2 +0.30 s: 5 km/h slower out'], [16, 'T1 +0.20 s: a lockup'],
    ]);
    expect(params(watch.mistakes[0].link)).toMatchObject({ lapOrdinal: '3', baselineDriverOrdinal: '0', baselineLapOrdinal: '1', compareDriver: ME, corner: '3' });
    expect(watch.moreMistakes).toBe(1);
    expect(watch.carTurns).toEqual(['T4 out']);
  });

  it('opens no comparison for a mistake on the usual lap itself', () => {
    const [mistake] = watchNextSession({ ...analysis, mistakes: [{ ...analysis.mistakes[2] }] }, ME, numbers, lapNumberOf).mistakes;
    expect(mistake.link).toBeNull();
  });
});
