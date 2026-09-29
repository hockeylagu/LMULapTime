import { describe, expect, it } from 'vitest';
import { lapClassPosition, lapPitStop, lapPlaces } from '../../../src/components/session-detail/table/lapPlaces.js';
import type { DetailedSession, DriverData, LapData } from '../../../shared/types/index.js';

const lap = (lapNum: number, position: number) => ({ lapNum, position } as LapData);
const driver = (name: string, carClass: string, positions: number[]) =>
  ({ name, carClass, laps: positions.map((position, i) => lap(i + 1, position)) } as DriverData);

const me = driver('Me', 'GT3', [5, 3]);
const session = {
  drivers: [me, driver('Hyper', 'Hyper', [1, 1]), driver('Rival', 'GT3', [4, 4]), driver('Other', 'GT3', [2, 2])],
} as DetailedSession;

describe('lapPlaces', () => {
  it('counts the places in class in a multiclass session, overall otherwise', () => {
    expect(lapClassPosition(session, me, me.laps[0], true)).toBe(3);
    expect(lapPlaces(session, me, me.laps[1], me.laps[0], true)).toEqual({ from: 3, to: 2, inClass: true });
    expect(lapPlaces(session, me, me.laps[1], me.laps[0], false)).toEqual({ from: 5, to: 3, inClass: false });
  });

  it('knows no places on the first lap or without positions', () => {
    expect(lapPlaces(session, me, me.laps[0], null, true)).toBeUndefined();
    expect(lapPlaces(session, me, me.laps[1], lap(1, 0), true)).toBeUndefined();
  });
});

describe('lapPitStop', () => {
  const laps = [
    { lapNum: 11, incidents: [{ type: 'damage', description: 'New suspension damage reported' }] },
    { lapNum: 12 },
    { lapNum: 13, isPitStop: true, pitService: { pitLaneSec: 120, serviceSec: 70, classMedianServiceSec: 30 } },
    { lapNum: 14, isOutLap: true },
    { lapNum: 15 },
  ] as LapData[];

  it('gives the in-lap and its out-lap the same stop', () => {
    const stop = { inLap: laps[2], outLapNum: 14, damageBefore: { lapNum: 11, description: 'New suspension damage reported' } };
    expect(lapPitStop(laps, laps[2], laps[1])).toEqual(stop);
    expect(lapPitStop(laps, laps[3], laps[2])).toEqual(stop);
  });

  it('has no stop on other laps', () => {
    expect(lapPitStop(laps, laps[4], laps[3])).toBeUndefined();
    expect(lapPitStop(laps, laps[1], laps[0])).toBeUndefined();
  });
});
