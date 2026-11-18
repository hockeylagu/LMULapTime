import { describe, expect, it } from 'vitest';
import { findCenterlineBends, placeTurns } from '../../../shared/domain/circuitTurns/placeTurns.js';
import type { LayoutTurnList } from '../../../shared/domain/circuitTurns/turnLists.js';

/** A closed centre line from pieces of constant curvature (1/m, positive = left), sampled every metre. */
function trackFrom(pieces: Array<{ lengthM: number; curvature: number }>): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let x = 0, z = 0, heading = 0;
  for (const piece of pieces) {
    for (let s = 0; s < piece.lengthM; s++) {
      points.push([x, z]);
      heading += piece.curvature;
      x += Math.cos(heading); z += Math.sin(heading);
    }
  }
  return points;
}

const straight = (lengthM: number) => ({ lengthM, curvature: 0 });
/** A bend of exactly `degrees` (positive = left), its radius rounded to whole metres of length. */
const bend = (degrees: number, radiusM: number) => {
  const lengthM = Math.round(Math.abs(degrees) * Math.PI / 180 * radiusM);
  return { lengthM, curvature: degrees * Math.PI / 180 / lengthM };
};

// A clockwise oval: a left-right-left chicane on each straight, a 180° right hairpin at each end.
const OVAL = trackFrom([
  straight(200), bend(30, 100), bend(-60, 100), bend(30, 100), straight(200),
  bend(-180, 50),
  straight(200), bend(30, 100), bend(-60, 100), bend(30, 100), straight(200),
  bend(-180, 50),
]);

describe('findCenterlineBends', () => {
  it('finds every bend in driving order with its direction and angle', () => {
    const { bends } = findCenterlineBends(OVAL);
    expect(bends.map(b => b.direction)).toEqual(['left', 'right', 'left', 'right', 'left', 'right', 'left', 'right']);
    // Smoothing blends a chicane's halves where they meet, so its bends read a few degrees short.
    [30, 60, 30, 180, 30, 60, 30, 180].forEach((nominal, index) => expect(Math.abs(bends[index].angleDeg - nominal)).toBeLessThan(8));
    expect(bends[3].minRadiusM).toBeGreaterThan(45);
    expect(bends[3].minRadiusM).toBeLessThan(60);
  });

  it('measures positions from the start line', () => {
    const plain = findCenterlineBends(OVAL).bends;
    const shifted = findCenterlineBends(OVAL, 100).bends;
    expect(shifted[0].apexM).toBeCloseTo(plain[0].apexM - 100, -1);
  });

  it('splits a long bend with two apexes', () => {
    const track = trackFrom([straight(300), bend(-40, 30), bend(-10, 200), bend(-40, 30), straight(300), bend(-270, 60)]);
    const { bends } = findCenterlineBends(track);
    expect(bends.filter(b => b.direction === 'right' && b.apexM > 250 && b.apexM < 400)).toHaveLength(2);
  });
});

describe('placeTurns', () => {
  it('takes the largest bends for a list without positions, leaving the kinks over', () => {
    const list: LayoutTurnList = { numberSource: 'series', sources: ['test'], turns: [{ number: 1 }, { number: 2 }] };
    const { turns, unplaced } = placeTurns(OVAL, list);
    expect(unplaced).toEqual([]);
    expect(turns.map(t => [t.number, Math.round(t.angleDeg ?? 0)])).toEqual([[1, 180], [2, 180]]);
    expect(turns[0].numberSource).toBe('series');
  });

  it('keeps a stated direction', () => {
    const list: LayoutTurnList = { sources: ['test'], turns: [{ name: 'Chicane', direction: 'left' }, { name: 'Hairpin' }] };
    const { turns } = placeTurns(OVAL, list);
    expect(turns[0].direction).toBe('left');
    expect(turns[1].angleDeg).toBeGreaterThan(150);
  });

  it('takes the bend nearest a map position over a larger one', () => {
    const { bends } = findCenterlineBends(OVAL);
    const list: LayoutTurnList = { sources: ['test'], turns: [{ number: 1, mapM: bends[2].apexM + 30 }] };
    expect(placeTurns(OVAL, list).turns[0].apexM).toBe(bends[2].apexM);
  });

  it('reports the entries no bend fits', () => {
    const hairpin = findCenterlineBends(OVAL).bends[3];
    // The second entry can neither take the right-hand hairpin nor sit at its map position, which is the first's apex.
    const list: LayoutTurnList = { sources: ['test'], turns: [{ number: 1, mapM: hairpin.apexM }, { number: 2, direction: 'left', mapM: hairpin.apexM }] };
    expect(placeTurns(OVAL, list).unplaced).toEqual([1]);
  });

  it('keeps a flat kink the map numbers at its position, and its neighbours on their own sides of it', () => {
    const { bends } = findCenterlineBends(OVAL);
    const kinkM = bends[3].apexM + 170; // on the straight after the first hairpin
    const list: LayoutTurnList = { sources: ['test'], turns: [
      { number: 1, mapM: bends[1].apexM }, { number: 2, mapM: kinkM }, { number: 3 }, { number: 4, mapM: bends[7].apexM }] };
    const { turns, unplaced } = placeTurns(OVAL, list);
    expect(unplaced).toEqual([]);
    // Turn 3 has no position: it takes the largest bend between turns 2 and 4, not the hairpin before the kink.
    expect(turns.map(t => t.apexM)).toEqual([bends[1].apexM, kinkM, bends[5].apexM, bends[7].apexM]);
  });

  it('places a turn the map numbers inside another turn\'s bend at its map position', () => {
    const hairpin = findCenterlineBends(OVAL).bends[3];
    const list: LayoutTurnList = { sources: ['test'], turns: [{ number: 1, mapM: hairpin.apexM }, { number: 2, mapM: hairpin.apexM + 40 }] };
    const { turns, unplaced } = placeTurns(OVAL, list);
    expect(unplaced).toEqual([]);
    expect(turns.map(t => [t.apexM, t.direction, t.angleDeg === undefined])).toEqual([
      [hairpin.apexM, hairpin.direction, false], [hairpin.apexM + 40, hairpin.direction, true]]);
  });

  it('cuts segments midway between apexes, from the start line to the end of the lap', () => {
    const { lengthM, turns } = placeTurns(OVAL, null);
    expect(turns[0].startM).toBe(0);
    expect(turns[turns.length - 1].endM).toBe(lengthM);
    for (let i = 1; i < turns.length; i++) {
      expect(turns[i].startM).toBe(turns[i - 1].endM);
      expect(turns[i].startM).toBeCloseTo((turns[i - 1].apexM + turns[i].apexM) / 2);
    }
  });

  it('without a list, keeps bends of at least 20° unnumbered', () => {
    const { turns } = placeTurns(OVAL, null);
    expect(turns).toHaveLength(8);
    expect(turns.every(t => t.number === undefined && t.name === undefined)).toBe(true);
    expect(turns.map(t => t.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
