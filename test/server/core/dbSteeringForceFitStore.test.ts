import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { initDbSchema } from '../../../server/core/dbSchema.js';
import { readSteeringForceFit, replaceSteeringForceFits } from '../../../server/core/dbSteeringForceFitStore.js';

const row = (carModel: string, c1: number) => ({ carModel, c1, c2: 10, heldOutR2: 0.93, lapsCount: 12, newestSession: 's', fittedAt: 1 });

it('reads a car\'s fit, and a new fit run replaces every car', () => {
  const db = new Database(':memory:');
  initDbSchema(db);
  replaceSteeringForceFits(db, [row('Ferrari 296 LMGT3', 24), row('Ginetta G61-LT-P325 Evo', 20)]);
  expect(readSteeringForceFit(db, 'Ferrari 296 LMGT3')).toEqual({ c1: 24, c2: 10 });
  expect(readSteeringForceFit(db, null)).toBeUndefined();
  replaceSteeringForceFits(db, [row('Ginetta G61-LT-P325 Evo', 21)]);
  expect(readSteeringForceFit(db, 'Ferrari 296 LMGT3')).toBeUndefined();
  expect(readSteeringForceFit(db, 'Ginetta G61-LT-P325 Evo')?.c1).toBe(21);
  db.close();
});
