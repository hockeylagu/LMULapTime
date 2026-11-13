import { describe, it, expect } from 'vitest';
import {
  decodeRacePoseWindow, encodeRacePoseWindow, RACE_POSE_CHANNEL_COUNT, racePitSlots, sampleRacePose, type RacePoseWindow,
} from '../../../shared/domain/raceReplay/poseWindow.js';

/** Two cars, three samples at 10 Hz from 60 s; car 3 enters the pit lane at its second, car 7 leaves the track after its first. */
function window(): RacePoseWindow {
  const data = new Float32Array(2 * 3 * RACE_POSE_CHANNEL_COUNT).fill(NaN);
  const put = (car: number, sample: number, values: number[]) => data.set(values, (car * 3 + sample) * RACE_POSE_CHANNEL_COUNT);
  put(0, 0, [0, 1, 0, 0, 3.1, 0, 100, 0]);
  put(0, 1, [10, 1, 20, 0, -3.1, 0, 200, 1]);
  put(0, 2, [20, 1, 40, 0, -3.0, 0, 200, 1]);
  put(1, 0, [5, 0, 5, 0, 0, 0, 50, 0]);
  return { fromSec: 60, hz: 10, count: 3, slots: [3, 7], data };
}

describe('race pose windows', () => {
  it('reads back what was encoded', () => {
    const encoded = encodeRacePoseWindow(window());
    const decoded = decodeRacePoseWindow(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer);

    expect(decoded.fromSec).toBe(60);
    expect(decoded.hz).toBe(10);
    expect(decoded.count).toBe(3);
    expect(decoded.slots).toEqual([3, 7]);
    expect(Array.from(decoded.data.slice(0, 8))).toEqual(Array.from(window().data.slice(0, 8)));
    expect(Number.isNaN(decoded.data[3 * RACE_POSE_CHANNEL_COUNT + RACE_POSE_CHANNEL_COUNT])).toBe(true);
  });

  it('knows the cars in the pit lane, from half way to the first pit sample', () => {
    expect([...racePitSlots(window(), 60.02)]).toEqual([]);
    expect([...racePitSlots(window(), 60.06)]).toEqual([3]);
    expect([...racePitSlots(null, 60)]).toEqual([]);
  });

  it('rejects what is not a window', () => {
    expect(() => decodeRacePoseWindow(new ArrayBuffer(8))).toThrow('Not a race pose window');
    const encoded = encodeRacePoseWindow(window());
    expect(() => decodeRacePoseWindow(encoded.buffer.slice(0, 40) as ArrayBuffer)).toThrow('Truncated');
  });

  it('interpolates between samples, turning the short way round', () => {
    const out = new Float32Array(RACE_POSE_CHANNEL_COUNT);

    expect(sampleRacePose(window(), 0, 60.05, out)).toBe(true);
    expect(out[0]).toBeCloseTo(5);
    expect(out[2]).toBeCloseTo(10);
    expect(out[6]).toBeCloseTo(150);
    // From 3.1 to -3.1 rad through pi, not through 0.
    expect(Math.abs(Math.cos(out[4]))).toBeCloseTo(1, 3);
  });

  it('shows a car leaving the track only at its own sample, and nothing outside the window', () => {
    const out = new Float32Array(RACE_POSE_CHANNEL_COUNT);

    expect(sampleRacePose(window(), 1, 60.02, out)).toBe(true);
    expect(out[0]).toBe(5);
    expect(sampleRacePose(window(), 1, 60.08, out)).toBe(false);
    expect(sampleRacePose(window(), 0, 59.9, out)).toBe(false);
    expect(sampleRacePose(window(), 0, 60.3, out)).toBe(false);
    expect(sampleRacePose(window(), 2, 60.1, out)).toBe(false);
  });
});
