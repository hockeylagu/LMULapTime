import type { LapSamples } from '../../../server/traffic/racePositions.js';

/** A round test track: radius 159.15 m, so one lap is 1000 m along its 400-point centreline. */
export const RADIUS_M = 1000 / (2 * Math.PI);
export const TRACK_LENGTH_M = 1000;

export const circleCenterline = (): Array<[number, number]> =>
  Array.from({ length: 400 }, (_, i) => {
    const angle = (i / 400) * 2 * Math.PI;
    return [RADIUS_M * Math.cos(angle), RADIUS_M * Math.sin(angle)];
  });

/** Where a car is on the circle after `distanceM` metres from the line. */
export const pointAt = (distanceM: number) => {
  const angle = (distanceM / TRACK_LENGTH_M) * 2 * Math.PI;
  return { x: RADIUS_M * Math.cos(angle), z: RADIUS_M * Math.sin(angle) };
};

/**
 * One lap sampled at 5 Hz for a car whose distance from the race start is `distanceAt(time)`:
 * the lap runs from `startSec` to `endSec` on the replay clock.
 */
export function lapOnCircle(lapNumber: number, startSec: number, endSec: number, distanceAt: (time: number) => number): LapSamples {
  const lap: LapSamples = { lapNumber, times: [], x: [], z: [], onTrack: [] };
  for (let time = startSec; time <= endSec + 1e-9; time += 0.2) {
    const { x, z } = pointAt(distanceAt(time));
    lap.times.push(Math.round(time * 1000) / 1000);
    lap.x.push(x);
    lap.z.push(z);
    lap.onTrack.push(true);
  }
  return lap;
}
