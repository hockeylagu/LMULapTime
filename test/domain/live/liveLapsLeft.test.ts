import { describe, expect, it } from 'vitest';
import { computeLapsLeft } from '../../../shared/domain/live/liveLapsLeft.js';
import { vehicleReading } from '../../helpers/liveReadings.js';
import { VEHICLE_CLASS_OPTIONS } from '../../../shared/domain/vehicleMapping.js';

const race = { kind: 'race' as const, endSeconds: null, elapsedSeconds: 500 };
const timedRace = { ...race, endSeconds: 1200 };

describe('laps left', () => {
  it.each(VEHICLE_CLASS_OPTIONS.filter(option => option.id !== 'All'))('uses the current player canonical class: $id', ({ id }) => {
    const overallClass = id === 'Hyper' ? 'LMP2' : 'Hyper';
    const overall = vehicleReading({ id: 1, vehicleClass: overallClass, lapStartEt: 2400, estimatedLapTime: 100 });
    const player = vehicleReading({ id: 7, vehicleClass: id, lapStartEt: 2460, estimatedLapTime: 150 });
    const classLeader = vehicleReading({ id: 9, vehicleClass: id, lapStartEt: 2460, estimatedLapTime: 120 });
    expect(computeLapsLeft({ kind: 'race', endSeconds: 3600, elapsedSeconds: 2500 }, player, overall, classLeader)).toEqual({ laps: 10, estimated: true });
  });
  it('accepts canonical aliases and keeps WEC and ELMS LMP2 separate', () => {
    const overall = vehicleReading({ id: 1, vehicleClass: 'Hyper', lapStartEt: 2400, estimatedLapTime: 100 });
    const player = vehicleReading({ id: 7, vehicleClass: 'LMP2 (ELMS)', lapStartEt: 2460, estimatedLapTime: 150 });
    const leader = vehicleReading({ id: 9, vehicleClass: 'LMP2_ELMS', lapStartEt: 2460, estimatedLapTime: 120 });
    const session = { kind: 'race' as const, endSeconds: 3600, elapsedSeconds: 2500 };
    expect(computeLapsLeft(session, player, overall, leader)).toEqual({ laps: 10, estimated: true });
    expect(computeLapsLeft(session, player, overall, { ...leader, vehicleClass: 'LMP2' })).toEqual({ laps: 8, estimated: true });
  });
  it('uses the overall leader for the flag and GT3-class pace for GT3 laps, without adding laps already lost', () => {
    const session = { kind: 'race' as const, endSeconds: 3600, elapsedSeconds: 2500 };
    const overall = vehicleReading({ id: 1, vehicleClass: 'Hyper', totalLaps: 24, lapStartEt: 2400, estimatedLapTime: 100 });
    const gt3Leader = vehicleReading({ id: 9, vehicleClass: 'GT3', totalLaps: 20, lapStartEt: 2460, estimatedLapTime: 120 });
    const gt3 = vehicleReading({ id: 7, vehicleClass: 'GT3', totalLaps: 18, lapsBehindLeader: 6, lapStartEt: 2460, estimatedLapTime: 150 });
    expect(computeLapsLeft(session, overall, overall)).toEqual({ laps: 12, estimated: true });
    expect(computeLapsLeft(session, gt3, overall, gt3Leader)).toEqual({ laps: 10, estimated: true });
    expect(computeLapsLeft(session, { ...gt3, lapsBehindLeader: 12 }, overall, gt3Leader)).toEqual({ laps: 10, estimated: true });
    expect(computeLapsLeft(session, gt3, overall, { ...gt3Leader, vehicleClass: 'Hyper' })).toEqual({ laps: 8, estimated: true });
    expect(computeLapsLeft(session, { ...gt3, estimatedLapTime: 0 }, overall, gt3Leader)).toEqual({ laps: 10, estimated: true });
    expect(computeLapsLeft(session, gt3, { ...overall, finishStatus: 1 }, gt3Leader)).toEqual({ laps: 1, estimated: false });
  });
  it('counts qualifying laps from the player own lap start and estimate, the lap in progress at the clock end included', () => {
    // The clock ends at 1200 s; laps of 100 s from 950 s: this lap, then the one from 1050 s, which runs past the end.
    const player = vehicleReading({ id: 7, totalLaps: 8, lapStartEt: 950, estimatedLapTime: 100 });
    expect(computeLapsLeft({ ...timedRace, kind: 'qualifying' }, player, null)).toEqual({ laps: 3, estimated: true });
    expect(computeLapsLeft({ ...timedRace, kind: 'qualifying' }, vehicleReading({ id: 7, lapStartEt: 950, estimatedLapTime: 0 }), null)).toBeNull();
  });

  it('is null off a race and qualifying, without a player and after the flag', () => {
    const leader = vehicleReading({ id: 1, place: 1, lapStartEt: 0, estimatedLapTime: 100 });
    const player = vehicleReading({ id: 7, totalLaps: 21, lapStartEt: 5 });
    expect(computeLapsLeft(timedRace, player, leader)).toEqual({ laps: 12, estimated: true });
    expect(computeLapsLeft({ ...timedRace, kind: 'practice' }, player, leader)).toBeNull();
    expect(computeLapsLeft(null, player, leader)).toBeNull();
    expect(computeLapsLeft(timedRace, null, leader)).toBeNull();
    expect(computeLapsLeft(timedRace, vehicleReading({ id: 7, finishStatus: 1 }), leader)).toBeNull();
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

    it('counts the crossings a car still makes up to the leader flag, however many laps it is down', () => {
      // The leader started its lap at 10: 12 laps left, the flag at 10 + 12 * 100 = 1210.
      // A lapped car just behind it on the road, at the same pace, still runs 12 laps.
      expect(computeLapsLeft(timedRace, { ...player, lapsBehindLeader: 1, lapStartEt: 15 }, leader(10))).toEqual({ laps: 12, estimated: true });
      // A lapped car just ahead of it on the road crosses the line before the flag and runs one more.
      expect(computeLapsLeft(timedRace, { ...player, lapsBehindLeader: 1, lapStartEt: 5 }, leader(10))).toEqual({ laps: 13, estimated: true });
      // A slower car runs fewer: (1210 - 10) / 120 = 10.
      expect(computeLapsLeft(timedRace, { ...player, lapsBehindLeader: 2, lapStartEt: 10, estimatedLapTime: 120 }, leader(10))).toEqual({ laps: 10, estimated: true });
      // Never under the lap in progress.
      expect(computeLapsLeft(timedRace, { ...player, lapStartEt: 1250 }, leader(1150))).toEqual({ laps: 1, estimated: true });
    });

    it('is null for a car behind the leader without its own lap start or estimate', () => {
      expect(computeLapsLeft(timedRace, { ...player, lapStartEt: -1 }, leader(0))).toBeNull();
      expect(computeLapsLeft(timedRace, { ...player, estimatedLapTime: 0 }, leader(0))).toBeNull();
    });

    it('is exactly one lap for a car still running once the leader has the flag', () => {
      expect(computeLapsLeft(timedRace, player, leader(1500, 100, { finishStatus: 1 }))).toEqual({ laps: 1, estimated: false });
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
