import { afterEach } from 'vitest';
import { SessionDatabase } from '../../server/core/db.js';

const open: SessionDatabase[] = [];
afterEach(() => { for (const db of open.splice(0)) db.close(); });

/** An in-memory session database, closed after the test that opened it. */
export function memoryDatabase(): SessionDatabase {
  const db = new SessionDatabase(':memory:');
  open.push(db);
  return db;
}
