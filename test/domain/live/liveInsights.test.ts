import { describe, expect, it } from 'vitest';
import { planFuelRatio, savingToFinish, tyreCoverage } from '../../../shared/domain/live/liveInsights.js';

describe('saving scenarios', () => {
  it('preserves the reserve at the target consumption and recalculates after a refill', () => {
    const plan = savingToFinish(29, 3, 9.5, 0.5, 'measured');
    expect(plan).toEqual({ targetPerLap: 2.9, savePerLap: 0.1, savePercent: 3.3, shortfall: 1, source: 'measured' });
    expect(savingToFinish(40, 3, 9.5, 0.5, 'measured')).toMatchObject({ savePercent: 0, shortfall: 0 });
    expect(savingToFinish(0, 3, 2, 0, 'game')).toMatchObject({ targetPerLap: 0, savePercent: 100 });
    expect(savingToFinish(5, 0, 2, 0.5, 'game')).toBeNull();
    expect(savingToFinish(5, 3, 0, 0.5, 'game')).toBeNull();
  });
});

describe('fuel ratio', () => {
  const input = { ratios: [0.832, 0.845, 0.83], fuelPerLap: 2.1, vePerLap: 2.5,
    garageSetting: 0.86, mfdSetting: null, options: [0.83, 0.84, 0.85, 0.86], veTarget: 50, fuelNow: 20, veNow: 30 };
  it('uses the thirstiest paired lap and rounds up to an available setting', () => {
    expect(planFuelRatio(input)).toMatchObject({ recommended: 0.85, source: 'measured', pairedLaps: 3, excessLitres: 0.5 });
    expect(planFuelRatio({ ...input, ratios: [0.86, 0.86, 0.86] })?.recommended).toBe(0.86);
    expect(planFuelRatio({ ...input, options: [0.83, 0.86] })?.recommended).toBe(0.86);
  });
  it('labels the game fallback and refuses to invent settings or clamp a too-high ratio', () => {
    expect(planFuelRatio({ ...input, ratios: [0.82] })).toMatchObject({ recommended: 0.84, source: 'game' });
    // A measured lap above the game's estimate lifts it before three laps are paired.
    expect(planFuelRatio({ ...input, ratios: [0.846] })).toMatchObject({ recommended: 0.85, source: 'game' });
    expect(planFuelRatio({ ...input, options: [] })?.recommended).toBeNull();
    expect(planFuelRatio({ ...input, ratios: [2, 2, 2] })?.recommended).toBeNull();
    expect(planFuelRatio({ ...input, fuelPerLap: null, ratios: [] })).toBeNull();
  });
  it('warns when physical fuel expires before virtual energy', () => {
    expect(planFuelRatio({ ...input, fuelNow: 10 })?.fuelBiasLaps).toBeLessThan(0);
  });
});

describe('tyre projections', () => {
  it('projects the fitted set to the next pit and the inventory across the race', () => {
    expect(tyreCoverage(0.8, 0.02, 10, 100, 'pit', 1)).toEqual({ target: 'pit', projectedTread: 0.6, setsNeeded: 3, availableSetsCover: false });
    expect(tyreCoverage(0.8, 0.02, 10, 100, 'pit', null)?.availableSetsCover).toBeNull();
    expect(tyreCoverage(0.1, 0.02, 10, 10, 'finish', 1)?.projectedTread).toBe(0);
  });
  it('does not extrapolate missing, zero or increasing tread', () => {
    expect(tyreCoverage(0.8, null, 10, 10, 'finish', 1)).toBeNull();
    expect(tyreCoverage(0.8, 0, 10, 10, 'finish', 1)).toBeNull();
    expect(tyreCoverage(0.8, -0.02, 10, 10, 'finish', 1)).toBeNull();
  });
  it('plans replacement sets against a 40% tread floor, including the exact boundary', () => {
    expect(tyreCoverage(0.8, 0.02, 20, 20, 'finish', 0)).toMatchObject({ projectedTread: 0.4, setsNeeded: 0, availableSetsCover: true });
    expect(tyreCoverage(0.8, 0.02, 21, 21, 'finish', 0)).toMatchObject({ projectedTread: 0.38, setsNeeded: 1, availableSetsCover: false });
    expect(tyreCoverage(0.35, 0.02, 1, 1, 'finish', 1)).toMatchObject({ setsNeeded: 1, availableSetsCover: true });
  });
});
