import type { PlacedTurn } from '../circuitTurns/placeTurns.js';
import { familiarName } from '../circuitTurns/familiarNames.js';
import { describeTurn } from '../circuitTurns/turnLabel.js';

/** A turn's label; a bend no source names goes by its distance from the start line, as the Consistency panel shows it. */
export const turnName = (turn: PlacedTurn): string => describeTurn(turn).label || `km ${(turn.apexM / 1000).toFixed(1)}`;

/** A sequence's label from its turns (exit turns left out by the caller): "T5", or "T5–T6" from its first to last. */
export function sequenceLabel(turns: readonly PlacedTurn[], ids: readonly number[]): string {
  const named = ids.flatMap(id => turns.find(turn => turn.id === id) ?? []);
  if (named.length === 0) return '';
  const first = turnName(named[0]);
  const last = turnName(named[named.length - 1]);
  return first === last ? first : `${first}–${last}`;
}

/** The familiar names of the numbered turns, each once; a turn of no number is already labelled by its name. */
export function numberedTurnNames(layoutKey: string, turns: readonly PlacedTurn[], ids: readonly number[]): string[] {
  return [...new Set(ids.flatMap(id => {
    const turn = turns.find(candidate => candidate.id === id);
    const name = turn?.number === undefined ? undefined : familiarName(layoutKey, turn);
    return name ? [name] : [];
  }))];
}

/**
 * A sequence's turns for its title: the familiar names before the range, "Lesmo 1, Lesmo 2 (T6–T7)"; the range alone
 * where none is named, the labels already are the names (Le Mans), or the names were given before (`except`).
 */
export function sequenceTurnsText(layoutKey: string, turns: readonly PlacedTurn[], ids: readonly number[], except: readonly string[] = []): string {
  const range = sequenceLabel(turns, ids);
  const names = numberedTurnNames(layoutKey, turns, ids).filter(name => !except.includes(name));
  return names.length ? `${names.join(', ')} (${range})` : range;
}
