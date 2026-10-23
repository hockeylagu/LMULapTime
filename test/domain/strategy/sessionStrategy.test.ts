import { describe, expect, it } from 'vitest';
import type { LapData, StrategyLapState } from '../../../shared/types/index.js';
import { measureSessionStrategy } from '../../../shared/domain/strategy/sessionStrategy.js';

const lap = (lapNumber: number, lapTime: number, extra: Partial<LapData> = {}): LapData => ({
  lapNumber, position: 1, lapTime, s1: null, s2: null, s3: null, topSpeed: null, fCompound: 'Medium', rCompound: 'Medium',
  flCompound: 'Medium', isPitStop: false, isValid: true, ...extra,
});
const state = (lapNumber: number, fuel: number, ve: number | null, tread: [number, number, number, number]): StrategyLapState => ({ lap: lapNumber, fuel, ve, tread });

// Modelled on the Le Mans race of 2026-10-22: a front-right flat on lap 1 (tread 0), a slow lap 2, a stop on lap 3
// for VE and the two fronts, then clean laps.
const states = [
  state(0, 84, 100, [1, 1, 1, 1]),
  state(1, 77, 92, [0.99, 0, 0.99, 0.99]),
  state(2, 70.5, 84, [0.98, 0, 0.98, 0.985]),
  state(3, 64, 76, [0.97, 0, 0.97, 0.98]),
  state(4, 72, 86, [1, 1, 0.96, 0.975]),
  state(5, 65.5, 78, [0.99, 0.99, 0.95, 0.97]),
  state(6, 59, 70, [0.98, 0.98, 0.94, 0.965]),
];
const laps = [
  lap(1, 238), lap(2, 327, { nonRepresentativeReason: 'offPace' }), lap(3, 230, { isPitStop: true }),
  lap(4, 260, { isOutLap: true }), lap(5, 212), lap(6, 211),
];

describe('session strategy measured from the native telemetry', () => {
  it('measures use, the ratio and the wear on clean laps only, and each stop from the rise over its lap', () => {
    expect(measureSessionStrategy(states, laps)).toEqual({
      kind: 've',
      laps: 6,
      start: { fuel: 84, ve: 100 },
      flag: { fuel: 59, ve: 70, laps: 8.8 },
      perLap: { fuel: 6.5, ve: 8, laps: 2 },
      fuelRatio: { set: 0.84, needed: 0.82 },
      tyres: { compound: 'Medium', corner: 'RL', wearPerLap: 0.01, treadAtFlag: 0.94 },
      stops: [{ lap: 3, fuelAdded: 14.5, veAdded: 18, levelAfter: 94, tyres: ['FL', 'FR'] }],
      pace: { clean: 211.5, first: 211.5, last: 211.5, laps: 2 },
    });
  });

  it('measures a fuel sprint with no stop, the same figures but the VE and the ratio', () => {
    const sprint = [state(0, 31, 0, [1, 1, 1, 1]), state(1, 28.2, 0, [0.99, 1, 0.985, 0.99]),
      state(2, 25.9, 0, [0.987, 0.996, 0.982, 0.99]), state(3, 23.6, 0, [0.982, 0.987, 0.979, 0.987])];
    const strategy = measureSessionStrategy(sprint, [lap(1, 121.7), lap(2, 102.5), lap(3, 103.1)]);
    expect(strategy).toMatchObject({ kind: 'fuel', laps: 3, start: { fuel: 31, ve: null }, flag: { fuel: 23.6, ve: null },
      perLap: { fuel: 2.3, ve: null, laps: 2 }, fuelRatio: { set: null, needed: null }, stops: [],
      tyres: { corner: 'RL', wearPerLap: 0.003, treadAtFlag: 0.979 } });
    expect(strategy?.flag.laps).toBe(10.3);
  });

  it('never leaves a stop past full VE', () => {
    const full = states.map(item => (item.lap === 4 ? { ...item, ve: 99 } : item));
    expect(measureSessionStrategy(full, laps)?.stops[0]).toMatchObject({ levelAfter: 100 });
  });

  it('needs the start state and a completed lap', () => {
    expect(measureSessionStrategy(states.slice(1), laps)).toBeNull();
    expect(measureSessionStrategy(states, [])).toBeNull();
  });
});
