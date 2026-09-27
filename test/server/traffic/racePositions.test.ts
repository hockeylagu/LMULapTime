import { describe, it, expect } from 'vitest';
import { buildDriverPositions, distanceAt, lapProgressAt } from '../../../server/traffic/racePositions.js';
import { buildCenterlineSpatialIndex } from '../../../server/tracks/trackProjection.js';
import { circleCenterline, lapOnCircle, TRACK_LENGTH_M } from './circleTrack.js';

const centerline = buildCenterlineSpatialIndex(circleCenterline());
// 50 m/s from the line: a 20 s lap on the 1000 m circle.
const steady = (time: number) => 50 * time;

describe('buildDriverPositions', () => {
  it('carries the distance on across the line instead of wrapping back to 0', () => {
    const positions = buildDriverPositions(3, [lapOnCircle(2, 20, 40, steady), lapOnCircle(1, 0, 19.8, steady)], centerline);

    expect(positions.slot).toBe(3);
    expect(positions.laps).toEqual([
      { lapNumber: 1, startSec: 0, endSec: 19.8 },
      { lapNumber: 2, startSec: 20, endSec: 40 },
    ]);
    expect(positions.distances[0]).toBeCloseTo(0, 0);
    expect(distanceAt(positions, 30)).toBeCloseTo(1500, 0);
    expect(positions.distances[positions.distances.length - 1]).toBeCloseTo(2000, 0);
    expect(positions.distances.every((d, i) => i === 0 || d > positions.distances[i - 1])).toBe(true);
  });

  it('drops samples off the track, and reads no position across the gap they leave', () => {
    const lap = lapOnCircle(1, 0, 19.8, steady);
    for (let i = 20; i < 40; i++) lap.onTrack[i] = false; // 4 s in the pit lane

    const positions = buildDriverPositions(1, [lap], centerline);

    expect(positions.times).not.toContain(5);
    expect(distanceAt(positions, 3.7)).toBeCloseTo(185, 0);
    expect(distanceAt(positions, 3.9)).toBeNull(); // between the last sample before the pits and the first after
    expect(distanceAt(positions, 5)).toBeNull();
    expect(distanceAt(positions, 100)).toBeNull();
    expect(distanceAt(positions, -1)).toBeNull();
  });
});

describe('lapProgressAt', () => {
  const positions = buildDriverPositions(1, [lapOnCircle(1, 0, 19.8, steady), lapOnCircle(2, 20, 40, steady)], centerline);

  it('adds how far round the lap the car is to the laps it has done', () => {
    expect(lapProgressAt(positions, distanceAt(positions, 10)!, 10, TRACK_LENGTH_M)).toBeCloseTo(0.5, 2);
    expect(lapProgressAt(positions, distanceAt(positions, 30)!, 30, TRACK_LENGTH_M)).toBeCloseTo(1.5, 2);
  });

  it('keeps a station a few metres short of the line in the lap that is ending', () => {
    // The lap 2 cut landed 5 m before the line: the car is still finishing lap 1.
    expect(lapProgressAt(positions, 995, 20.1, TRACK_LENGTH_M)).toBeCloseTo(0.995, 3);
    // And a lap cut a few metres late still counts as the next lap.
    expect(lapProgressAt(positions, 1005, 19.7, TRACK_LENGTH_M)).toBeCloseTo(1.005, 3);
    expect(lapProgressAt(positions, 0, -5, TRACK_LENGTH_M)).toBeNull();
  });
});
