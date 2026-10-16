import { describe, expect, it } from 'vitest';
import { computeLapsLeft } from '../../../shared/domain/live/liveLapsLeft.js';
import { vehicleReading } from '../../helpers/liveReadings.js';

const race = { kind: 'race' as const, maxLaps: null, endSeconds: null, elapsedSeconds: 500 };
const lapRace = { ...race, maxLaps: 26 };
const timedRace = { ...race, endSeconds: 1200 };

describe('laps left', () => {
  it('is exact in a lap-count race and counts the lap in progress (lap 22 of 26 leaves 5)', () => {
    expect(computeLapsLeft(lapRace, vehicleReading({ totalLaps: 21 }), null)).toEqual({ laps: 5, estimated: false });
    expect(computeLapsLeft(lapRace, vehicleReading({ totalLaps: 25 }), null)).toEqual({ laps: 1, estimated: false });
    expect(computeLapsLeft(lapRace, vehicleReading({ totalLaps: 0 }), null)).toEqual({ laps: 26, estimated: false });
  });

  it('is null off a race, without a player, after the flag and past the lap limit', () => {
    const player = vehicleReading({ totalLaps: 21 });
    expect(computeLapsLeft({ ...lapRace, kind: 'qualifying' }, player, null)).toBeNull();
    expect(computeLapsLeft(null, player, null)).toBeNull();
    expect(computeLapsLeft(lapRace, null, null)).toBeNull();
    expect(computeLapsLeft(lapRace, vehicleReading({ totalLaps: 21, finishStatus: 1 }), null)).toBeNull();
    expect(computeLapsLeft(lapRace, vehicleReading({ totalLaps: 26 }), null)).toBeNull();
  });

  describe('timed race', () => {
    const player = vehicleReading({ id: 7, place: 3, totalLaps: 4 });
    const leader = (lapStartEt: number, estimatedLapTime = 100, extra = {}) =>
      vehicleReading({ id: 1, place: 1, totalLaps: 5, lapStartEt, estimatedLapTime, ...extra });

    it('counts the laps the leader still starts before the clock ends plus the one it finishes, as an estimate', () => {
      // The leader's lap began at 1050 and ends at 1150 < 1200: another starts at 1150 and is the last (ends 1250).
      expect(computeLapsLeft(timedRace, vehicleReading({ id: 1, place: 1 }), leader(1050))).toEqual({ laps: 2, estimated: true });
      // 1150 -> 1250 crosses the end: this is the last lap.
      expect(computeLapsLeft(timedRace, vehicleReading({ id: 1, place: 1 }), leader(1150))).toEqual({ laps: 1, estimated: true });
      // The lap ending exactly when the clock ends is the last one.
      expect(computeLapsLeft(timedRace, vehicleReading({ id: 1, place: 1 }), leader(1100))).toEqual({ laps: 1, estimated: true });
      expect(computeLapsLeft(timedRace, vehicleReading({ id: 1, place: 1 }), leader(0, 100))).toEqual({ laps: 12, estimated: true });
    });

    it('takes off the laps the player is behind the leader, but never goes under the lap in progress', () => {
      expect(computeLapsLeft(timedRace, { ...player, lapsBehindLeader: 1 }, leader(0))).toEqual({ laps: 11, estimated: true });
      expect(computeLapsLeft(timedRace, { ...player, lapsBehindLeader: 20 }, leader(0))).toEqual({ laps: 1, estimated: true });
    });

    it('is one lap for a car still running once the leader has the flag', () => {
      expect(computeLapsLeft(timedRace, player, leader(1500, 100, { finishStatus: 1 }))).toEqual({ laps: 1, estimated: true });
    });

    it('is null without a timed end, a leader, a lap start or a lap time estimate', () => {
      expect(computeLapsLeft(race, player, leader(0))).toBeNull();
      expect(computeLapsLeft(timedRace, player, null)).toBeNull();
      expect(computeLapsLeft(timedRace, player, leader(-1))).toBeNull();
      expect(computeLapsLeft(timedRace, player, leader(0, -1))).toBeNull();
      expect(computeLapsLeft(timedRace, player, leader(0, 0))).toBeNull();
      expect(computeLapsLeft(timedRace, player, leader(Number.NaN))).toBeNull();
    });

    it('is null when the leader started its lap after the clock ended', () => {
      expect(computeLapsLeft(timedRace, player, leader(1300))).toBeNull();
    });
  });
});
