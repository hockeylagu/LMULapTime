import { describe, expect, it } from 'vitest';
import type { PlacedTurn } from '../../../shared/domain/circuitTurns/placeTurns.js';
import { numberedTurnNames, sequenceTurnsText } from '../../../shared/domain/cornerSequences/sequenceLabel.js';

const placed = (id: number, fields: Partial<PlacedTurn>): PlacedTurn => ({ id, direction: 'left', apexM: id * 100, startM: id * 100 - 50, endM: id * 100 + 50, ...fields });

describe('sequenceTurnsText', () => {
  it('puts the familiar names before the turn range', () => {
    const turns = [placed(0, { number: 6, name: 'Prima Curva di Lesmo' }), placed(1, { number: 7, name: 'Seconda Curva di Lesmo' })];
    expect(sequenceTurnsText('monza_gp', turns, [0, 1])).toBe('Lesmo 1, Lesmo 2 (T6–T7)');
    // A variant goes by its full layout's names.
    expect(sequenceTurnsText('monza_curvagrande', turns, [1])).toBe('Lesmo 2 (T7)');
  });

  it('names a run of turns sharing one name once', () => {
    const turns = [8, 9, 10].map((number, id) => placed(id, { number, name: 'Variante Ascari' }));
    expect(sequenceTurnsText('monza_gp', turns, [0, 1, 2])).toBe('Variante Ascari (T8–T10)');
    // An exit turn whose name the sequence already gave goes by its number.
    expect(sequenceTurnsText('monza_gp', turns, [2], numberedTurnNames('monza_gp', turns, [0, 1]))).toBe('T10');
  });

  it("falls back to the turn list's names, then to the range alone", () => {
    expect(sequenceTurnsText('spa_gp', [placed(0, { number: 1, name: 'La Source' })], [0])).toBe('La Source (T1)');
    expect(sequenceTurnsText('portimao_wec', [placed(0, { number: 5 })], [0])).toBe('T5');
    expect(sequenceTurnsText('sebring_full', [placed(0, { number: 5 }), placed(1, { number: 6 })], [0, 1])).toBe('Gurney Bend (T5–T6)');
  });

  it('keeps a named turn of no number as its label, not twice', () => {
    const turns = [placed(0, { name: 'Tertre Rouge' }), placed(1, { name: 'Porsche Curves' })];
    expect(sequenceTurnsText('sarthe_full', turns, [0, 1])).toBe('Tertre Rouge–Porsche Curves');
    expect(sequenceTurnsText('sarthe_full', turns, [])).toBe('');
  });
});
