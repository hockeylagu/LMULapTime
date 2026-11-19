import { describe, expect, it } from 'vitest';
import { describeTurn } from '../../../shared/domain/circuitTurns/turnLabel.js';

describe('describeTurn', () => {
  it('names a turn by its number, with its name and how the number was found in the title', () => {
    expect(describeTurn({ number: 7, suffix: 'a', name: 'Hairpin', numberSource: 'official' }))
      .toEqual({ label: 'T7a', title: "Turn 7a · Hairpin: the circuit's own number for this turn, from its track map", filled: false });
    expect(describeTurn({ number: 3, numberSource: 'filled' })).toEqual({ label: 'T3',
      title: "Turn 3: the circuit's map leaves this turn unnumbered; counted on in order from the turn before", filled: true });
    expect(describeTurn({ number: 12, numberSource: 'series' }).title)
      .toBe("Turn 12: the number on the track map of a racing series held here; the circuit's own map has none");
    expect(describeTurn({ number: 4 }).title).toBe('Turn 4');
  });

  it('falls back to the name, or nothing for a turn named by position', () => {
    expect(describeTurn({ name: 'Bus Stop' }))
      .toEqual({ label: 'Bus Stop', title: "Bus Stop: the circuit's map names this turn but gives it no number", filled: false });
    expect(describeTurn({})).toEqual({ label: '',
      title: "The circuit's map neither numbers nor names this turn: it goes by its distance from the start line", filled: false });
  });
});
