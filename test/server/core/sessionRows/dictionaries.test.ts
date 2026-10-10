import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import { readSession } from '../../../../server/core/sessionRows/reader.js';
import { driver, lap, session } from './builders.js';
import type { DetailedSession } from '../../../../server/core/types.js';

function sessionWith(id: string, names: string[], overrides: Partial<DetailedSession> = {}): DetailedSession {
  const drivers = names.map((name, index) => driver(name, [lap(1)], { isPlayer: index === 0, carClass: index === 0 ? 'Hypercar' : 'LMGT3',
    carType: index === 0 ? 'Ferrari 499P' : 'Porsche 911 GT3 R', teamName: index === 0 ? 'Team A' : 'Team B' }));
  return session(drivers, { id, filename: `${id}.xml`, filePath: `${id}.xml`, timestamp: 1_780_000_000_000, ...overrides });
}

describe('session dictionaries', () => {
  let db: SessionDatabase;
  const raw = () => db.getDb();
  const rows = (sql: string) => raw().prepare(sql).all() as Array<Record<string, unknown>>;

  beforeEach(() => { db = new SessionDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('keys drivers by the exact name: case and spacing differences stay different rows', () => {
    db.upsertSession(sessionWith('a', ['Alex Smith', 'alex smith', 'Alex Smith ', 'Alex Smith']), 'a.xml', 1, 10);
    expect(rows('SELECT name, normalized_name FROM drivers ORDER BY name')).toEqual([
      { name: 'Alex Smith', normalized_name: 'alex smith' },
      { name: 'Alex Smith ', normalized_name: 'alex smith' },
      { name: 'alex smith', normalized_name: 'alex smith' },
    ]);
    const ids = rows('SELECT driver_id FROM session_drivers WHERE session_id = \'a\' ORDER BY driver_ordinal').map(row => row.driver_id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe(ids[3]);
    expect(readSession(raw(), 'a')?.drivers.map(item => item.name)).toEqual(['Alex Smith', 'alex smith', 'Alex Smith ', 'Alex Smith']);
  });

  it('shares vehicles and teams across sessions and keeps player and human flags on the session row', () => {
    db.upsertSession(sessionWith('a', ['Alex', 'Ai One']), 'a.xml', 1, 10);
    db.upsertSession(sessionWith('b', ['Alex', 'Ai One'], { timestamp: 1_780_000_100_000 }), 'b.xml', 1, 10);
    expect(rows('SELECT car_type, car_class FROM vehicles ORDER BY car_type')).toEqual([
      { car_type: 'Ferrari 499P', car_class: 'Hypercar' }, { car_type: 'Porsche 911 GT3 R', car_class: 'LMGT3' },
    ]);
    expect(rows('SELECT name FROM teams ORDER BY name')).toEqual([{ name: 'Team A' }, { name: 'Team B' }]);
    expect(rows('SELECT count(*) AS n FROM drivers')).toEqual([{ n: 2 }]);
    expect(rows('SELECT session_id, is_player, is_player_driver FROM session_drivers WHERE driver_ordinal = 0 ORDER BY session_id'))
      .toEqual([{ session_id: 'a', is_player: 1, is_player_driver: 1 }, { session_id: 'b', is_player: 1, is_player_driver: 1 }]);
  });

  it('keeps absent car type, class and team as absent, and one vehicle row per pair', () => {
    const bare = driver('Bare', [lap(1)]);
    delete (bare as Partial<typeof bare>).carClass;
    delete (bare as Partial<typeof bare>).teamName;
    const other = driver('Bare Two', [lap(1)]);
    delete (other as Partial<typeof other>).carClass;
    delete (other as Partial<typeof other>).teamName;
    db.upsertSession(session([bare, other], { id: 'a', filename: 'a.xml', filePath: 'a.xml' }), 'a.xml', 1, 10);
    expect(rows('SELECT count(*) AS n FROM vehicles WHERE car_class IS NULL')).toEqual([{ n: 1 }]);
    expect(rows('SELECT count(*) AS n FROM session_drivers WHERE team_id IS NULL')).toEqual([{ n: 2 }]);
    const read = readSession(raw(), 'a');
    expect(read?.drivers[0]).not.toHaveProperty('carClass');
    expect(read?.drivers[0]).not.toHaveProperty('teamName');
    expect(read?.drivers[0].carType).toBe('Ferrari 499P');
  });

  it('is emptied with the session cache and searched through the normalized-name index', () => {
    db.upsertSession(sessionWith('a', ['Alex', 'Ai One']), 'a.xml', 1, 10);
    const plan = rows("EXPLAIN QUERY PLAN SELECT driver_id FROM drivers WHERE normalized_name = 'alex'").map(row => String(row.detail)).join(' ');
    expect(plan).toContain('idx_drivers_normalized_name');
    db.clearCache();
    for (const table of ['drivers', 'vehicles', 'teams']) expect(rows(`SELECT count(*) AS n FROM ${table}`)).toEqual([{ n: 0 }]);
  });
});
