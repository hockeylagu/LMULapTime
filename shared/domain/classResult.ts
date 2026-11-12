import type { DriverData } from '../types/session.js';

type ResultSource = Pick<DriverData, 'position'>
  & Partial<Pick<DriverData, 'classPosition' | 'gridPosition' | 'classGridPosition' | 'positionGain' | 'classPositionGain'>>;

export interface ClassResult { position: number; gridPosition: number | null; positionGain: number | null; }

/**
 * A driver's result among the cars of their class. The overall figures stand in only when the
 * source has no class position; class and overall figures are never mixed in one result.
 */
export function classResult(driver: ResultSource): ClassResult {
  if (driver.classPosition && driver.classPosition > 0) {
    return { position: driver.classPosition, gridPosition: driver.classGridPosition ?? null, positionGain: driver.classPositionGain ?? null };
  }
  return { position: driver.position, gridPosition: driver.gridPosition ?? null, positionGain: driver.positionGain ?? null };
}
