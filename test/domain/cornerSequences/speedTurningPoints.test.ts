import { describe, expect, it } from 'vitest';
import {
  CORNER_MIN_PROMINENCE_KMH, findSpeedTurningPoints, maxAbsSteer, STEER_REVERSAL_FRACTION,
} from '../../../shared/domain/cornerSequences/speedTurningPoints.js';

const dists = (count: number) => Array.from({ length: count }, (_, i) => i * 10);

describe('findSpeedTurningPoints', () => {
  it('finds alternating peaks and dips, ignoring swings under the prominence', () => {
    // A 3 km/h wiggle on the way in, then a corner and a small lift after it.
    const speed = [200, 210, 207, 220, 150, 100, 160, 230, 225, 220];
    const points = findSpeedTurningPoints(speed, [], dists(speed.length), CORNER_MIN_PROMINENCE_KMH);
    expect(points.map(point => [point.type, point.index, point.distM])).toEqual([['max', 3, 30], ['min', 5, 50], ['max', 7, 70]]);
  });

  it('splits two linked corners at a steering reversal from a 2 km/h rise', () => {
    const speed = [200, 150, 120, 122, 124, 100, 130, 200];
    const steer = [0, 0.5, 0.8, 0.5, -0.6, -0.8, -0.2, 0];
    const split = findSpeedTurningPoints(speed, steer, dists(speed.length), CORNER_MIN_PROMINENCE_KMH, maxAbsSteer(steer) * STEER_REVERSAL_FRACTION);
    expect(split.map(point => [point.type, point.index])).toEqual([['min', 2], ['max', 4], ['min', 5]]);
    // Speed alone: one corner.
    const one = findSpeedTurningPoints(speed, steer, dists(speed.length), CORNER_MIN_PROMINENCE_KMH);
    expect(one.map(point => [point.type, point.index])).toEqual([['min', 5]]);
  });

  it('needs three samples', () => {
    expect(findSpeedTurningPoints([100, 200], [], [0, 10], CORNER_MIN_PROMINENCE_KMH)).toEqual([]);
  });
});

describe('maxAbsSteer', () => {
  it('is the largest steering either way', () => {
    expect(maxAbsSteer([0.2, -0.7, null, 0.5])).toBe(0.7);
  });
});
