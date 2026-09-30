import { describe, expect, it } from 'vitest';
import { lapClassPosition, lapClassPositions } from '../../shared/domain/lapPlaces.js';
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

  it('indexes the same ranks with missing laps, tied positions, unknown positions and mixed-case classes', () => {
    const selected = driver('Me', 'GT3', [5, 0, -1, 3]);
    const rival = driver('Rival', 'gt3', [4, 1, 1, 3]);
    const sparse = driver('Sparse', 'GT3', [2]);
    sparse.laps.push({ lapNum: 1, position: 1 } as LapData); // first recorded lap wins
    const field = { drivers: [selected, rival, sparse, driver('Hyper', 'Hyper', [1, 1, 1, 1])] } as DetailedSession;
    for (const multiClass of [true, false]) {
      const positions = lapClassPositions(field, selected, multiClass);
      for (const lap of selected.laps) {
        expect(positions.get(lap)).toBe(lapClassPosition(field, selected, lap, multiClass));
      }
    }
    expect(lapClassPositions(field, undefined, true).size).toBe(0);
    expect(lapClassPositions({ drivers: [] } as unknown as DetailedSession, selected, true).get(selected.laps[0])).toBe(1);
  });
});
