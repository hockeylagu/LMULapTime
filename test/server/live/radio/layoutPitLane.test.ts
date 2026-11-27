import { describe, expect, it } from 'vitest';
import { layoutPitLane } from '../../../../server/live/radio/layoutPitLane.js';

/** A 400 x 100 m rectangle lap from (0, 0), driven along +x first: 1000 m. */
const centerline: Array<[number, number]> = [[0, 0], [100, 0], [200, 0], [300, 0], [400, 0], [400, 100], [300, 100], [200, 100], [100, 100], [0, 100]];

describe('layout pit lane', () => {
  it('places the lane ends on the lap from the package, the entry the end it is driven from, and its side', () => {
    // Beside the start straight, 10 m off it: from 50 m to 350 m along the lap.
    const lane: Array<[number, number]> = [[50, -10], [150, -10], [250, -10], [350, -10]];
    const ends = layoutPitLane('test', () => ({ centerline, pitLane: { centerline: lane } }))!;
    expect(ends.entry * 1000).toBeCloseTo(50);
    expect(ends.exit * 1000).toBeCloseTo(350);
    // On the right of the track, as the track projection signs it; across the straight, on the left.
    expect(ends.side).toBe('right');
    const across = lane.map(([x]): [number, number] => [x, 10]);
    expect(layoutPitLane('test', () => ({ centerline, pitLane: { centerline: across } }))!.side).toBe('left');
    // Stored the other way round, the same ends.
    const reversed = layoutPitLane('test', () => ({ centerline, pitLane: { centerline: lane.toReversed() } }))!;
    expect(reversed).toEqual(ends);
    // Measured from the start line, and over it: entry before the line, exit after it.
    const shifted = layoutPitLane('test', () => ({ centerline, pitLane: { centerline: lane }, timingGates: { startFinish: { stationM: 200 } } }))!;
    expect(shifted.entry * 1000).toBeCloseTo(850);
    expect(shifted.exit * 1000).toBeCloseTo(150);
    expect(layoutPitLane('test', () => ({ centerline }))).toBeNull();
    expect(layoutPitLane('none', () => null)).toBeNull();
  });
});
