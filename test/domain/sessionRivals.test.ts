import { describe, it, expect } from 'vitest';
import { compareWithSameCarRivals } from '../../shared/domain/sessionRivals.js';
import type { DriverData } from '../../shared/types/index.js';

function driver(name: string, carType: string, carClass: string, s1: number, s2: number, s3: number, lap: number): DriverData {
  return {
    name,
    carType,
    carClass,
    carNumber: '1',
    teamName: '',
    isPlayer: false,
    position: 1,
    classPosition: 1,
    bestLapTime: lap,
    bestLapTimeString: '',
    bestS1: s1,
    bestS2: s2,
    bestS3: s3,
    theoreticalBest: null,
    theoreticalBestString: '',
    laps: [],
  } as unknown as DriverData;
}

// Best sectors from a Daytona Hypercar race (2026-09-25): three Peugeot 9x8s and a Cadillac.
const me = driver('Samuel Lague', 'Peugeot 9x8', 'Hyper', 25.184, 42.062, 28.648, 95.894);
const malynych = driver('Alexandr Malynych', 'Peugeot 9x8', 'Hyper', 25.098, 42.394, 28.255, 95.746);
const lesko = driver('Nikita Lesko', 'Peugeot 9x8', 'Hyper', 25.345, 42.501, 28.815, 96.661);
const pearmain = driver('Mack Pearmain', 'Cadillac V-Series.R', 'Hyper', 24.964, 41.808, 28.054, 94.825);
const gt3 = driver('Luke Littleford', 'Lexus RCF LMGT3', 'GT3', 27.728, 47.785, 32.822, 108.335);

describe('compareWithSameCarRivals', () => {
  it('compares each best sector with the fastest other driver in the same car', () => {
    const result = compareWithSameCarRivals([me, malynych, lesko, pearmain, gt3], me)!;

    expect(result.scope).toBe('car');
    expect(result.rivalCount).toBe(2);
    const byKey = Object.fromEntries(result.rows.map(r => [r.key, r]));
    expect(byKey.s1).toMatchObject({ rival: 25.098, rivalName: 'Alexandr Malynych', gap: 0.086 });
    // Faster than both other Peugeots in S2: a negative gap.
    expect(byKey.s2).toMatchObject({ rival: 42.394, gap: -0.332 });
    expect(byKey.s3).toMatchObject({ rival: 28.255, rivalName: 'Alexandr Malynych', gap: 0.393 });
    expect(byKey.lap).toMatchObject({ rival: 95.746, gap: 0.148 });
    expect(result.biggestGap?.key).toBe('s3');
  });

  it('falls back to the car class when nobody else drove the car, never to another class', () => {
    const result = compareWithSameCarRivals([pearmain, malynych, gt3], pearmain)!;

    expect(result.scope).toBe('class');
    expect(result.rows.find(r => r.key === 'lap')?.rivalName).toBe('Alexandr Malynych');
    expect(result.rows.some(r => r.rivalName === 'Luke Littleford')).toBe(false);
  });

  it('has no biggest gap when the driver is fastest everywhere', () => {
    const result = compareWithSameCarRivals([pearmain, driver('Other', 'Cadillac V-Series.R', 'Hyper', 25, 42, 28.1, 95)], pearmain)!;

    expect(result.biggestGap).toBeNull();
  });

  it('returns nothing without a rival in the class', () => {
    expect(compareWithSameCarRivals([me, gt3], gt3)).toBeNull();
  });
});
