import { describe, expect, it } from 'vitest';
import { applyLapTiming } from '../../../server/sessions/sessionLapTiming.js';
import type { LapData } from '../../../shared/types/index.js';

const lap = (lapNumber: number, lapTime: number | null, extra: Partial<LapData> = {}): LapData => ({
  lapNumber, position: 1, lapTime, s1: null, s2: null, s3: null, topSpeed: null,
  fCompound: '', rCompound: '', isValid: true, ...extra,
} as LapData);

describe('applyLapTiming', () => {
  it('infers a missing lap time from its three sectors', () => {
    const laps = [lap(1, 100), lap(2, null, { s1: 30, s2: 40, s3: 30.5 })];
    applyLapTiming(laps, 100);
    expect(laps[1]).toMatchObject({ lapTime: 100.5, isInferred: true });
  });

  it('infers a missing lap time from its start to the next lap start and deduces the missing S3', () => {
    const laps = [lap(1, 100, { elapsedSeconds: 0 }), lap(2, null, { elapsedSeconds: 100, s1: 30, s2: 40 }), lap(3, 99, { elapsedSeconds: 200 })];
    applyLapTiming(laps, 100);
    expect(laps[1]).toMatchObject({ lapTime: 100, s3: 30, isInferred: true });
  });

  it('times a missing lap by its own start, not the lap before (Silverstone race 2026-10-28, laps 5-7)', () => {
    // `et` is each lap's start: lap 5 (the contact, 82.356 s) ran 408.76 -> 491.12; laps 6 and 7 have no time in the
    // XML. Lap 6 is 491.12 -> 555.32 = 64.2 s, not lap 5's 82.36 s; lap 7 is 555.32 -> 619.80 = 64.48 s.
    const laps = [lap(5, 82.356, { elapsedSeconds: 408.76 }), lap(6, null, { elapsedSeconds: 491.12, s1: 18.048 }),
      lap(7, null, { elapsedSeconds: 555.32, s1: 17.996 }), lap(8, 64.086, { elapsedSeconds: 619.8 })];
    applyLapTiming(laps, 63.274);
    expect(laps.map(l => l.lapTime)).toEqual([82.356, 64.2, 64.48, 64.086]);
  });

  it('leaves the last lap without a time when only its start is known', () => {
    const laps = [lap(1, 63.274, { elapsedSeconds: 1707.68 }), lap(2, null, { elapsedSeconds: 1770.94 })];
    applyLapTiming(laps, 63.274);
    expect(laps[1]).toMatchObject({ lapTime: null });
    expect(laps[1].isInferred).toBeUndefined();
  });

  it('marks the lap after a completed stop as the out-lap, even when the in-lap time was inferred', () => {
    const laps = [lap(1, 100), lap(2, null, { isPitStop: true, s1: 50, s2: 40, s3: 30 }), lap(3, 200), lap(4, 100)];
    applyLapTiming(laps, 100);
    expect(laps.map((l) => Boolean(l.isOutLap))).toEqual([false, false, true, false]);
  });

  it('puts the pit loss of a stop on the in-lap, counting the out-lap against two average laps', () => {
    const laps = [lap(1, 100), lap(2, 100), lap(3, 120, { isPitStop: true }), lap(4, 180), lap(5, 100), lap(6, 100)];
    applyLapTiming(laps, 100);
    expect(laps[2]).toMatchObject({ pitStopDuration: 100 });
    expect(laps[3].pitStopDuration).toBeUndefined();
  });
});
