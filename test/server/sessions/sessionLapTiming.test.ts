import { describe, expect, it } from 'vitest';
import { applyLapTiming } from '../../../server/sessions/sessionLapTiming.js';
import type { LapData } from '../../../server/core/types.js';

const lap = (lapNum: number, lapTime: number | null, extra: Partial<LapData> = {}): LapData => ({
  lapNum, position: 1, lapTime, lapTimeString: '', s1: null, s2: null, s3: null, topSpeed: null,
  fCompound: '', rCompound: '', isValid: true, ...extra,
} as LapData);

describe('applyLapTiming', () => {
  it('infers a missing lap time from its three sectors', () => {
    const laps = [lap(1, 100), lap(2, null, { s1: 30, s2: 40, s3: 30.5 })];
    applyLapTiming(laps, 100);
    expect(laps[1]).toMatchObject({ lapTime: 100.5, isInferred: true });
  });

  it('infers a missing lap time from the elapsed time and deduces the missing S3', () => {
    const laps = [lap(1, 100, { elapsedSeconds: 100 }), lap(2, null, { elapsedSeconds: 200, s1: 30, s2: 40 })];
    applyLapTiming(laps, 100);
    expect(laps[1]).toMatchObject({ lapTime: 100, s3: 30, isInferred: true });
  });

  it('marks the lap after a completed stop as the out-lap, even when the in-lap time was inferred', () => {
    const laps = [lap(1, 100), lap(2, null, { isPitStop: true, s1: 50, s2: 40, s3: 30 }), lap(3, 200), lap(4, 100)];
    applyLapTiming(laps, 100);
    expect(laps.map((l) => Boolean(l.isOutLap))).toEqual([false, false, true, false]);
  });

  it('puts the pit loss of a stop on the in-lap, counting the out-lap against two average laps', () => {
    const laps = [lap(1, 100), lap(2, 100), lap(3, 120, { isPitStop: true }), lap(4, 180), lap(5, 100), lap(6, 100)];
    applyLapTiming(laps, 100);
    expect(laps[2]).toMatchObject({ pitStopDuration: 100, pitStopDurationString: '+100s' });
    expect(laps[3].pitStopDuration).toBeUndefined();
  });
});
