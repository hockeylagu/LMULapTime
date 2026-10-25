import { describe, expect, it } from 'vitest';
import { fitTyreWear, TYRE_WEAR_MODEL_VERSION } from '../../../shared/domain/strategy/tyreWear.js';
import type { TyreWearLap, TyreWheelValues } from '../../../shared/types/liveStrategy.js';
import facts from '../../fixtures/tyreWearPortimao.json';

const four = (value: number): TyreWheelValues => [value, value, value, value];
const lap = (slip: number, loss: number, sessionKind = 'Race'): TyreWearLap => ({
  sessionId: sessionKind, sessionKind, gameVersion: '1.42', compound: 'Medium', lapNumber: 2,
  loss: four(loss), slip: four(slip), exclusions: [],
});

describe('per-wheel tyre wear fit', () => {
  it('requires eight usable laps, with all four wheels finite', () => {
    expect(fitTyreWear(Array.from({ length: 7 }, () => lap(0, 0.004)))).toBeNull();
    const laps = Array.from({ length: 8 }, () => lap(0, 0.004));
    laps[0].exclusions = ['capture-gap'];
    expect(fitTyreWear(laps)).toBeNull();
    laps[0].exclusions = []; laps[0].loss[3] = NaN;
    expect(fitTyreWear(laps)).toBeNull();
  });

  it('uses the mean wear of the usual laps without a slope and keeps per-wheel differences', () => {
    const laps = Array.from({ length: 8 }, () => ({ ...lap(0, 0.004), loss: [0.002, 0.003, 0.004, 0.005] as TyreWheelValues }));
    const profile = fitTyreWear(laps)!;
    expect(profile.version).toBe(TYRE_WEAR_MODEL_VERSION);
    expect(profile.wheels.map(wheel => wheel.wearPerLap)).toEqual([0.002, 0.003, 0.004, 0.005]);
    expect(profile.wheels.every(wheel => wheel.perSlipSecond === null)).toBe(true);
  });

  it('keeps the slip cost of the usual laps when there is too little slip for a slope', () => {
    const profile = fitTyreWear([...Array.from({ length: 6 }, () => lap(0, 0.004)), lap(1, 0.008), lap(1, 0.008)])!;
    expect(profile.wheels[0].perSlipSecond).toBeNull();
    expect(profile.wheels[0].cleanWear).toBe(0.004);
    expect(profile.wheels[0].usualSlip).toBe(0.25);
    expect(profile.wheels[0].wearPerLap).toBe(0.005);
  });

  it('fits the slip slope but uses usual race slip rather than qualifying slip', () => {
    const profile = fitTyreWear([...Array.from({ length: 8 }, (_, i) => lap(i, 0.003 + i * 0.002, 'Qualifying')),
      lap(0, 0.003), lap(0.2, 0.0034)])!;
    expect(profile.wheels[0].cleanWear).toBeCloseTo(0.003);
    expect(profile.wheels[0].perSlipSecond).toBeCloseTo(0.002);
    expect(profile.wheels[0].usualSlip).toBeCloseTo(0.1);
    expect(profile.wheels[0].wearPerLap).toBe(0.0032);
    expect(profile.sessions).toBe(2);
  });

  it('drops a negative slope to the mean wear and refits a negative intercept through the origin', () => {
    const descending = fitTyreWear(Array.from({ length: 8 }, (_, i) => lap(i + 1, 0.02 - i * 0.001)))!;
    expect(descending.wheels[0].perSlipSecond).toBeNull();
    expect(descending.wheels[0].wearPerLap).toBeCloseTo(0.0165);
    const origin = fitTyreWear(Array.from({ length: 8 }, (_, i) => lap(i + 1, 0.002 * (i + 1) - 0.001)))!;
    expect(origin.wheels[0].cleanWear).toBe(0);
    expect(origin.wheels[0].perSlipSecond).toBeGreaterThan(0);
    expect(origin.wheels[0].perSlipSecond).toBeLessThan(0.002);
  });

  it('falls back from race to practice then qualifying for usual slip', () => {
    const qualifying = Array.from({ length: 8 }, (_, i) => lap(i + 1, 0.004, 'Qualifying'));
    expect(fitTyreWear(qualifying)?.wheels[0].usualSlip).toBe(4.5);
    expect(fitTyreWear([...qualifying, lap(0.5, 0.004, 'Practice')])?.wheels[0].usualSlip).toBe(0.5);
    expect(fitTyreWear([...qualifying, lap(0.5, 0.004, 'Practice'), lap(0, 0.004)])?.wheels[0].usualSlip).toBe(0);
  });

  it('pins the Portimao impact and lockup to XML/native lap 10, raw capture lap 9', () => {
    const impact = facts.find(row => row.sessionId.endsWith('73R1') && row.lapNumber === 10)!;
    expect(impact.captureLapNumbers).toEqual([9]);
    expect(impact.startSeconds).toBeLessThan(1059);
    expect(impact.endSeconds).toBeGreaterThan(1074.8);
    expect(impact.loss[2]).toBeCloseTo(0.01688, 5);
    expect(impact.slip[2]).toBeGreaterThan(2);
    expect(impact.exclusions).toEqual([]);
  });

  it('projects the Portimao race using only the qualifying and earlier race', () => {
    const training = facts.filter(row => !row.sessionId.endsWith('73R1')) as TyreWearLap[];
    const profile = fitTyreWear(training)!;
    expect(profile).not.toBeNull();
    const projected = Math.min(...profile.wheels.map(wheel => 1 - 12 * wheel.wearPerLap));
    expect(Math.abs(projected - 0.944)).toBeLessThan(0.02);
  });
});
