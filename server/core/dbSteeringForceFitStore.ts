import { Database as DatabaseType } from 'better-sqlite3';
import type { SteeringForceFit } from '../../shared/types/index.js';

/** One car's stored fit, with what it was fitted on. */
export interface SteeringForceFitRow extends SteeringForceFit {
  carModel: string;
  heldOutR2: number;
  lapsCount: number;
  /** The newest session id among the laps fitted on. */
  newestSession: string;
  fittedAt: number;
}

/** The car's FFB fit; none for a car the driver has no fitted laps in. */
export function readSteeringForceFit(db: DatabaseType, carModel: string | null): SteeringForceFit | undefined {
  if (!carModel) return undefined;
  const row = db.prepare('SELECT c1, c2 FROM steering_force_fit WHERE car_model = ?').get(carModel) as SteeringForceFit | undefined;
  return row ? { c1: row.c1, c2: row.c2 } : undefined;
}

/** Replaces every stored fit with these: a car left out (no longer passing) loses its estimate. */
export function replaceSteeringForceFits(db: DatabaseType, rows: readonly SteeringForceFitRow[]): void {
  const insert = db.prepare(`INSERT INTO steering_force_fit (car_model, c1, c2, held_out_r2, laps_count, newest_session, fitted_at)
    VALUES (@carModel, @c1, @c2, @heldOutR2, @lapsCount, @newestSession, @fittedAt)`);
  db.transaction(() => {
    db.prepare('DELETE FROM steering_force_fit').run();
    for (const row of rows) insert.run(row);
  })();
}
