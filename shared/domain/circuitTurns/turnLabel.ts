import type { PlacedTurn } from './placeTurns.js';
import type { TurnLabelSource } from './turnLists.js';

/** What a turn's number is, by where it comes from. */
const NUMBER_MEANS: Record<TurnLabelSource, string> = {
  official: "the circuit's own number for this turn, from its track map",
  series: "the number on the track map of a racing series held here; the circuit's own map has none",
  filled: "the circuit's map leaves this turn unnumbered; counted on in order from the turn before",
};

/**
 * How a placed turn is named: "T7" (its number and suffix), else its official name, else nothing (it is then named
 * by position). The title adds the name and how the number was found.
 */
export function describeTurn(turn: Pick<PlacedTurn, 'number' | 'suffix' | 'name' | 'numberSource'>): { label: string; title: string; name: string; filled: boolean } {
  const number = turn.number === undefined ? undefined : `${turn.number}${turn.suffix ?? ''}`;
  const label = number !== undefined ? `T${number}` : turn.name ?? '';
  const head = [number !== undefined ? `Turn ${number}` : null, turn.name].filter(Boolean).join(' · ');
  // A number of no recorded source claims none.
  const title = number !== undefined ? (turn.numberSource ? `${head}: ${NUMBER_MEANS[turn.numberSource]}` : head)
    : turn.name ? `${head}: the circuit's map names this turn but gives it no number`
      : "The circuit's map neither numbers nor names this turn: it goes by its distance from the start line";
  return { label, title, name: head, filled: turn.numberSource === 'filled' };
}
