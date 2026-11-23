import { describe, expect, it } from 'vitest';
import { layoutTurnNamer } from '../../../../server/live/radio/layoutTurns.js';
import type { PlacedLayout } from '../../../../server/corners/cornerPassService.js';
import type { PlacedTurn } from '../../../../shared/domain/circuitTurns/placeTurns.js';

const turn = (id: number, startM: number, endM: number, patch: Partial<PlacedTurn> = {}): PlacedTurn => ({
  id, direction: 'left', apexM: (startM + endM) / 2, startM, endM, ...patch,
});
const layout: PlacedLayout = {
  layoutKey: 'test', centerline: [], startStationM: 0, lengthM: 1000, turnsKey: 'k',
  turns: [turn(0, 100, 200, { number: 1 }), turn(1, 400, 450, { number: 6, suffix: 'a' }), turn(2, 780, 830, { name: 'The Hairpin' }), turn(3, 900, 950)],
};

describe('layout turn names', () => {
  it('names the turn at a lap distance, scaled from the game lap onto the centre line, or one within 150 m', () => {
    const name = layoutTurnNamer('test', () => layout)!;
    expect(name(150, 1000)).toBe('Turn 1');
    // The game's lap is twice the centre line here.
    expect(name(850, 2000)).toBe('Turn 6a');
    expect(name(800, 1000)).toBe('The Hairpin');
    expect(name(250, 1000)).toBe('Turn 1');
    expect(name(590, 1000)).toBeNull();
    expect(name(920, 1000)).toBeNull();
    expect(name(100, 0)).toBeNull();
    expect(layoutTurnNamer('none', () => null)).toBeNull();
  });
});
