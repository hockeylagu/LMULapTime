import { describe, it, expect } from 'vitest';
import { assembleRacePoseWindow, racePoseWindowIndex, resampleLapPoses, type LapPoses } from '../../../server/traffic/racePoses.js';
import { compressTrajectory } from '../../../server/core/replay/replayTrajectoryCodec.js';
import { RACE_POSE_CHANNEL_COUNT } from '../../../shared/domain/raceReplay/poseWindow.js';
import type { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../shared/types/index.js';

/** A stored 50 Hz lap driving +X at 50 m/s from `startSec`, yaw wrapping across pi half way. */
function storedLap(startSec: number, durationSec: number, edit?: (point: ReplayTrajectoryPoint, time: number) => void): ReplayTrajectoryData {
  const points: ReplayTrajectoryPoint[] = [];
  for (let i = 0; i <= durationSec * 50; i++) {
    const time = startSec + i / 50;
    const point: ReplayTrajectoryPoint = { x: 50 * (time - startSec), y: 2, z: 0, timeSec: time, rotX: 0.01, rotY: time < startSec + durationSec / 2 ? 3.1 : -3.1, rotZ: 0, speedKmh: 180 };
    edit?.(point, time);
    points.push(point);
  }
  return {
    replayName: 'Line_R1.Vcr', pointsCount: points.length, vcrRawSampleRateHz: 50, currentLap: 1,
    bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 }, points,
  };
}

const value = (lap: LapPoses, sample: number, channel: number) => lap.data[sample * RACE_POSE_CHANNEL_COUNT + channel];

describe('resampleLapPoses', () => {
  it('puts a lap on the replay clock at 10 Hz', () => {
    const lap = resampleLapPoses(compressTrajectory(storedLap(100.03, 2)));

    expect(lap.firstTick).toBe(1001);
    expect(lap.count).toBe(20);
    expect(value(lap, 0, 0)).toBeCloseTo(50 * 0.07, 3);
    expect(value(lap, 0, 1)).toBeCloseTo(2);
    expect(value(lap, 0, 6)).toBeCloseTo(180);
    expect(Math.abs(Math.cos(value(lap, 10, 4)))).toBeGreaterThan(0.99);
  });

  it('leaves the garage and recording gaps empty', () => {
    const garage = resampleLapPoses(compressTrajectory(storedLap(0, 2, (point, time) => { point.inGarage = time < 1; })));
    expect(Number.isNaN(value(garage, 5, 0))).toBe(true);
    expect(value(garage, 15, 0)).toBeCloseTo(75);

    const gap = storedLap(0, 4);
    gap.points = gap.points.filter(point => point.timeSec! < 1 || point.timeSec! > 3);
    const resampled = resampleLapPoses(compressTrajectory(gap));
    expect(Number.isNaN(value(resampled, 20, 0))).toBe(true);
    expect(value(resampled, 5, 0)).toBeCloseTo(25);
  });
});

describe('assembleRacePoseWindow', () => {
  it('copies each car\'s laps onto the window grid, the next window\'s first sample included', () => {
    const laps = new Map<number, LapPoses[]>([
      [4, [resampleLapPoses(compressTrajectory(storedLap(55, 10))), resampleLapPoses(compressTrajectory(storedLap(65, 10)))]],
    ]);
    const window = assembleRacePoseWindow(1, [2, 4], laps, 10, 60);

    expect(window.fromSec).toBe(60);
    expect(window.count).toBe(601);
    expect(window.slots).toEqual([2, 4]);
    expect(Number.isNaN(window.data[0])).toBe(true);
    const car = (sample: number) => window.data[(601 + sample) * RACE_POSE_CHANNEL_COUNT];
    expect(car(0)).toBeCloseTo(250);
    expect(car(50)).toBeCloseTo(0);
    expect(car(100)).toBeCloseTo(250);
    expect(Number.isNaN(car(200))).toBe(true);
  });

  it('finds the window of a time', () => {
    expect(racePoseWindowIndex(0)).toBe(0);
    expect(racePoseWindowIndex(59.9)).toBe(0);
    expect(racePoseWindowIndex(60)).toBe(1);
    expect(racePoseWindowIndex(-3)).toBe(0);
  });
});
