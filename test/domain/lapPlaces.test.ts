import { describe, expect, it } from 'vitest';
import { lapClassPosition } from '../../shared/domain/lapPlaces.js';
import type { DetailedSession, DriverData, LapData } from '../../shared/types/index.js';

const driver = (name: string, carClass: string, positions: number[]) =>
  ({ name, carClass, laps: positions.map((position, i) => ({ lapNum: i + 1, position } as LapData)) } as DriverData);

const me = driver('Me', 'GT3', [5, 3]);
const session = {
  drivers: [me, driver('Hyper', 'Hyper', [1, 1]), driver('Rival', 'GT3', [4, 4]), driver('Other', 'GT3', [2, 2])],
} as DetailedSession;

describe('lapClassPosition', () => {
  it('counts the places in class in a multiclass session, overall otherwise', () => {
    expect(lapClassPosition(session, me, me.laps[0], true)).toBe(3);
    expect(lapClassPosition(session, me, me.laps[0], false)).toBe(5);
  });
});
