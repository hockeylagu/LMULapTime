import { placeLayout, type PlacedLayout } from '../../corners/cornerPassService.js';
import type { PlacedTurn } from '../../../shared/domain/circuitTurns/placeTurns.js';

/** A turn this close to a spot outside every turn's segment still names it. */
const NEAR_TURN_M = 150;

const spoken = (turn: PlacedTurn): string | null => (turn.number !== undefined ? `Turn ${turn.number}${turn.suffix ?? ''}` : turn.name ?? null);

/**
 * Names a lap distance by the layout's placed official turns ("Turn 6"), for the radio's incident calls. The game's
 * lap distance is scaled onto the centre line's length. Null for a layout without a centre line or turn list.
 */
export function layoutTurnNamer(layoutKey: string, place: (layoutKey: string) => PlacedLayout | null = placeLayout):
  ((lapDist: number, trackLength: number) => string | null) | null {
  const layout = place(layoutKey);
  if (!layout || layout.turns.length === 0 || layout.lengthM <= 0) return null;
  const { turns, lengthM } = layout;
  return (lapDist, trackLength) => {
    if (trackLength <= 0) return null;
    const at = (((lapDist % trackLength) + trackLength) % trackLength) * lengthM / trackLength;
    const inside = turns.find(turn => turn.startM <= at && at < turn.endM);
    if (inside) return spoken(inside);
    const apart = (turn: PlacedTurn) => Math.min(Math.abs(turn.apexM - at), lengthM - Math.abs(turn.apexM - at));
    const nearest = turns.reduce((best, turn) => (apart(turn) < apart(best) ? turn : best));
    return apart(nearest) <= NEAR_TURN_M ? spoken(nearest) : null;
  };
}
