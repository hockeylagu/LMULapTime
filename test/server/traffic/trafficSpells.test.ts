import { describe, it, expect } from 'vitest';
import { findTrafficSpells, TrafficCarInfo } from '../../../server/traffic/trafficSpells.js';
import type { DriverPositions, RacePositions } from '../../../server/traffic/racePositions.js';

const TRACK = 1000;

/** A car sampled at 5 Hz over [0, 40] s; its laps are cut where its distance crosses the line. */
function car(slot: number, distanceAt: (time: number) => number): DriverPositions {
  const times: number[] = [];
  const distances: number[] = [];
  const laps: DriverPositions['laps'] = [];
  for (let step = 0; step <= 200; step++) {
    const time = step / 5;
    const distance = distanceAt(time);
    const lapNumber = Math.floor(distance / TRACK) + 1;
    const current = laps[laps.length - 1];
    if (current?.lapNumber === lapNumber) current.endSec = time;
    else laps.push({ lapNumber, startSec: time, endSec: time });
    times.push(time);
    distances.push(distance);
  }
  return { slot, times, distances, laps };
}

// The driver: 50 m/s from the line, so a 1 s gap is 50 m.
const me = car(0, (t) => 50 * t);

function spellsAgainst(other: DriverPositions, carClass = 'Hyper') {
  const positions: RacePositions = { version: 'v1', trackLengthM: TRACK, drivers: [me, other] };
  const cars = new Map<number, TrafficCarInfo>([[0, { name: 'Me', carClass: 'Hyper' }], [other.slot, { name: 'Other', carClass }]]);
  return findTrafficSpells(positions, 0, 0, 20, cars);
}

describe('findTrafficSpells', () => {
  it('finds a battle with a same-class car on the same lap, in front', () => {
    const spells = spellsAgainst(car(1, (t) => 50 * t + 30));

    expect(spells).toHaveLength(1);
    expect(spells[0]).toMatchObject({ carName: 'Other', carClass: 'Hyper', kind: 'battle', direction: 'ahead', closestGapSec: 0.6 });
    expect(spells[0].endSec - spells[0].startSec).toBeCloseTo(19.8, 5);
  });

  it('finds a battle with a same-class car right behind (defending)', () => {
    expect(spellsAgainst(car(1, (t) => 50 * t - 25))).toMatchObject([{ kind: 'battle', direction: 'behind', closestGapSec: 0.5 }]);
  });

  it('tells a same-class car a lap down (being lapped by the driver) from a battle', () => {
    expect(spellsAgainst(car(1, (t) => 50 * t + 30 - TRACK))).toMatchObject([{ kind: 'lapping', direction: 'ahead' }]);
  });

  it('keeps a same-class car a lap up that is closing from behind (lapping the driver)', () => {
    expect(spellsAgainst(car(1, (t) => 50 * t - 25 + TRACK))).toMatchObject([{ kind: 'beingLapped', direction: 'behind' }]);
  });

  it('finds a slower class in front until the pass, and ignores it behind afterwards', () => {
    // 105 m ahead at 40 m/s: within 50 m from 5.5 s, passed at 10.5 s, then behind.
    const spells = spellsAgainst(car(1, (t) => 40 * t + 105), 'GT3');

    expect(spells).toHaveLength(1);
    expect(spells[0]).toMatchObject({ kind: 'multiclass', direction: 'ahead', carClass: 'GT3', startStationM: 280, endStationM: 520 });
    expect(spells[0].startSec).toBeCloseTo(5.6, 5);
    expect(spells[0].endSec).toBeCloseTo(10.4, 5);
  });

  it('ignores a car close for under two seconds, and bridges a moment just out of range', () => {
    // 45 m ahead for 1.4 s only, otherwise far up the road.
    expect(spellsAgainst(car(1, (t) => 50 * t + (t >= 5 && t <= 6.4 ? 45 : 300)))).toEqual([]);

    // 45 m ahead, drifting to 55 m for 0.6 s mid-lap: still one spell.
    const flicker = spellsAgainst(car(1, (t) => 50 * t + (t >= 8 && t < 8.6 ? 55 : 45)));
    expect(flicker).toHaveLength(1);
    expect(flicker[0].startSec).toBeCloseTo(0.2, 5);
  });

  it('reads nothing while the driver is stopped, or for a driver without positions', () => {
    const stopped: RacePositions = { version: 'v1', trackLengthM: TRACK, drivers: [car(0, () => 100), car(1, () => 120)] };
    expect(findTrafficSpells(stopped, 0, 0, 20, new Map())).toEqual([]);
    expect(findTrafficSpells(stopped, 7, 0, 20, new Map())).toEqual([]);
  });
});
