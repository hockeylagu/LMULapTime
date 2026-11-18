import { describe, expect, it } from 'vitest';
import { CIRCUIT_SPECIFICATIONS } from '../../../shared/domain/circuitDefinitions.js';
import { LAYOUT_TURN_LISTS } from '../../../shared/domain/circuitTurns/turnLists.js';
import { GAME_CORNER_COUNTS } from '../../../shared/domain/circuitTurns/gameCornerCounts.js';

describe('LAYOUT_TURN_LISTS', () => {
  it.each(Object.entries(LAYOUT_TURN_LISTS))('%s is a known layout with sources, in driving order', (layoutKey, list) => {
    expect(CIRCUIT_SPECIFICATIONS[layoutKey]).toBeDefined();
    expect(list.sources.length).toBeGreaterThan(0);
    expect(list.turns.length).toBeGreaterThan(0);
    const numbers = list.turns.flatMap(turn => turn.number === undefined ? [] : [turn.number]);
    // A variant may drive its full layout's turns in another order (Silverstone National: 9, 10, 11, 6, 7, 8).
    if (!list.sources[0].startsWith('Shared turns')) expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    // A number repeats only with letters in order (10A, 10B).
    const labels = list.turns.flatMap(turn => turn.number === undefined ? [] : [`${turn.number}${turn.suffix ?? ''}`]);
    expect(new Set(labels).size).toBe(labels.length);
    for (const [index, turn] of list.turns.entries()) {
      const next = list.turns[index + 1];
      if (turn.number !== undefined && next?.number === turn.number) expect((next.suffix ?? '') > (turn.suffix ?? '')).toBe(true);
    }
    // A list with numbers says where they come from.
    if (numbers.length) expect(list.numberSource ?? list.turns.every(turn => turn.numberSource)).toBeTruthy();
    const positions = list.turns.flatMap(turn => turn.mapM === undefined ? [] : [turn.mapM]);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // An entry without a label is a variant's own bend, known by its position.
    expect(list.turns.every(turn => turn.number !== undefined || turn.name !== undefined || turn.mapM !== undefined)).toBe(true);
  });

  it.each(Object.entries(LAYOUT_TURN_LISTS))('%s has as many turns as the game counts, or says why not', (layoutKey, list) => {
    const count = GAME_CORNER_COUNTS[layoutKey];
    expect(count).toBeDefined();
    if (list.gameCountNote) expect(list.turns.length).not.toBe(count);
    else expect(list.turns.length).toBe(count);
  });
});

describe('GAME_CORNER_COUNTS', () => {
  it('covers exactly the known layouts', () => {
    expect(Object.keys(GAME_CORNER_COUNTS).sort()).toEqual(Object.keys(CIRCUIT_SPECIFICATIONS).sort());
  });
});
