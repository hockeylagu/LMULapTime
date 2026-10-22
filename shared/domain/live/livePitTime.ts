/**
 * The game's stop estimate (`pitstop-estimate`) is for a stop made at the moment it is read: its refuel parts fill the
 * MFD target from the amount in the tank then. The planned stop starts from the amount left at pit entry (Le Mans race
 * 2026-10-22: 0 s shown two laps out with 29 % VE and the MFD at 20 %; the stop then loaded 13 % in 7 s).
 */

/** One refuel part (VE or fuel) of the next stop, in that part's unit. */
export interface RefuelPart {
  /** What the stop adds: the MFD target minus the amount at pit entry (nothing when not positive). */
  added: number;
  /** Seconds per unit added: the inverse of the game's fill rate (`pitStopTimes`). */
  secondsPerUnit: number;
  /** Fixed seconds of a refuel, learned from the game's estimate (`refuelBase`), else the rules' insert time. */
  base: number;
}

export const refuelSeconds = (part: RefuelPart): number => (part.added > 0 ? part.base + part.added * part.secondsPerUnit : 0);

/** The fixed part of a refuel the game estimates for `added` units; null when it adds nothing to learn from. */
export function refuelBase(estimateSeconds: number, added: number, secondsPerUnit: number): number | null {
  return estimateSeconds > 0 && added > 0 ? Math.max(0, estimateSeconds - added * secondsPerUnit) : null;
}

/**
 * The game's service time with its refuel replaced by the planned one. VE and fuel fill at the same time; tyres,
 * repairs and the rest add to them (`total = max(fuel, ve) + tires + damage`, seen in every estimate of that race).
 */
export function plannedServiceSeconds(estimate: { total: number; fuel: number; ve: number }, refuels: readonly RefuelPart[]): number {
  return Math.max(0, estimate.total - Math.max(estimate.fuel, estimate.ve)) + Math.max(0, ...refuels.map(refuelSeconds));
}
