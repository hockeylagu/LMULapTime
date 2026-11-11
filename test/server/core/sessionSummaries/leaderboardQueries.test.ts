import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { DetailedSession } from '../../../../shared/types/index.js';
import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';
import { playerEntry, type LeaderboardQuery } from '../../../../shared/domain/leaderboard.js';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { upsertSession } from '../../../../server/core/dbSessionStore.js';
import { queryCompactLeaderboard, queryCompactLeaderboardLayouts, queryCompactPlayerSessionBests } from '../../../../server/core/sessionSummaries/leaderboardQueries.js';
import { driver, lap, MONZA_CURVA_GRANDE, session } from '../../../domain/leaderboardFixtures.js';

const MONZA = { layoutKey: 'monza_gp', carClass: 'GT3' };

function dbOf(sessions: DetailedSession[]): Database.Database {
  const db = new Database(':memory:');
  initDbSchema(db);
  sessions.forEach(value => upsertSession(db, value, value.filename, value.timestamp, 1));
  return db;
}

function boardOf(sessions: DetailedSession[], query: LeaderboardQuery) {
  const db = dbOf(sessions);
  try { return queryCompactLeaderboard(db, query); } finally { db.close(); }
}

function layoutsOf(sessions: DetailedSession[]) {
  const db = dbOf(sessions);
  try { return queryCompactLeaderboardLayouts(db); } finally { db.close(); }
}

const names = (sessions: DetailedSession[], query: LeaderboardQuery = MONZA) =>
  boardOf(sessions, query).entries.map((e) => e.driverName);


describe('compact leaderboard queries', () => {
  it('removes the legacy class-first index when an existing database opens', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    db.exec('CREATE INDEX idx_session_drivers_class ON session_drivers(driver_class, vehicle_id)');
    initDbSchema(db);
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name='idx_session_drivers_class'").get()).toBeUndefined();
    db.close();
  });
  it("lists the player's best lap of each session, oldest first", () => {
    const db = dbOf([
      session('race-b', [driver('Me', [lap(2, 107.5), lap(3, 107.4), lap(4, 107.6)], { isPlayer: true }),
        driver('Other', [lap(2, 109)])], { timestamp: 2000 }),
      session('race-a', [driver('Me', [lap(2, 108), lap(3, 107.8)], { isPlayer: true }),
        driver('Rival', [lap(2, 107.7)])], { timestamp: 1000 }),
    ]);
    expect(queryCompactPlayerSessionBests(db, MONZA)).toEqual([
      { sessionId: 'race-a', sessionName: 'R1', timestamp: 1000, best: 107.8 },
      { sessionId: 'race-b', sessionName: 'R1', timestamp: 2000, best: 107.4 },
    ]);
    db.close();
  });

  it('requires three representative laps in the same session for the top-three average', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const sessions = [
      session('two-laps', [driver('Me', [lap(2, 100), lap(3, 101)], { isPlayer: true })]),
      session('three-laps', [driver('Me', [lap(2, 102), lap(3, 103), lap(4, 104)], { isPlayer: true })], { timestamp: 2000 }),
    ];
    sessions.forEach(value => upsertSession(db, value, value.filename, value.timestamp, 1));
    expect(playerEntry(queryCompactLeaderboard(db, { layoutKey: 'monza_gp', carClass: 'GT3' }))?.top3Average).toBe(103);
    db.close();
  });

  it('does not combine separate same-name stints to make a session top-three average', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const value = session('duplicate-name', [
      driver('Same Name', [lap(2, 100), lap(3, 101)]),
      driver('Same Name', [lap(2, 102), lap(3, 103)]),
    ]);
    upsertSession(db, value, value.filename, value.timestamp, 1);
    const entry = queryCompactLeaderboard(db, { layoutKey: 'monza_gp', carClass: 'GT3' }).entries[0];
    expect(entry.representativeLaps).toBe(4);
    expect(entry.sessions).toBe(1);
    expect(entry.top3Average).toBeNull();
    db.close();
  });

  it('uses competition ranks when sector and top-three values tie', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const value = session('tied-ranks', [
      driver('Me', [lap(2, 100, { s1: 30, s2: 40, s3: 30 }), lap(3, 101), lap(4, 102)], { isPlayer: true }),
      driver('Rival', [lap(2, 100, { s1: 30, s2: 40, s3: 30 }), lap(3, 101), lap(4, 102)]),
      driver('Third', [lap(2, 105, { s1: 31, s2: 41, s3: 31 }), lap(3, 106), lap(4, 107)]),
    ]);
    upsertSession(db, value, value.filename, value.timestamp, 1);
    const board = queryCompactLeaderboard(db, { layoutKey: 'monza_gp', carClass: 'GT3' });
    const entries = Object.fromEntries(board.entries.map(entry => [entry.driverName, entry]));
    expect(entries.Me?.s1Rank).toBe(1);
    expect(entries.Rival?.s1Rank).toBe(1);
    expect(entries.Third?.s1Rank).toBe(3);
    expect(entries.Me?.top3AverageRank).toBe(1);
    expect(entries.Rival?.top3AverageRank).toBe(1);
    expect(entries.Third?.top3AverageRank).toBe(3);
    expect(queryCompactLeaderboardLayouts(db)[0].classes[0].playerRank).toBe(1);
    db.close();
  });

  it('uses session_driver_condition_summaries index for compact leaderboard queries and produces compact entries', () => {
    const db = new Database(':memory:');
    try {
      initDbSchema(db);
      const value = session('board-plan', [driver('Me', [lap(2, 100)], { isPlayer: true })]);
      upsertSession(db, value, value.filename, value.timestamp, 1);
      const boardPlan = db.prepare(`EXPLAIN QUERY PLAN SELECT s.id,c.best_lap_time FROM session_driver_condition_summaries c
        JOIN session_drivers d ON d.session_id=c.session_id AND d.driver_ordinal=c.driver_ordinal
        JOIN sessions s ON s.id=d.session_id WHERE s.layout_key=? AND d.driver_class=? AND c.condition_group='dry' AND d.is_human=1`)
        .all('monza_gp', 'GT3') as Array<{ detail: string }>;
      expect(boardPlan.some(row => row.detail.includes('session_driver_condition_summaries'))).toBe(true);
      const board = queryCompactLeaderboard(db, { layoutKey: 'monza_gp', carClass: 'GT3' });
      expect(board.entries[0].bestLap).not.toHaveProperty('laps');
    } finally {
      db.close();
    }
  });
});

describe('leaderboard board query', () => {
  it('ranks the real drivers by their best representative lap, with the gap to the leader', () => {
    const board = boardOf([
      session('r1', [
        driver('Me', [lap(2, 108.4), lap(3, 108.1)], { isPlayer: true }),
        driver('Fast', [lap(2, 107.5)]),
        driver('Slow', [lap(2, 109.0)]),
      ]),
    ], MONZA);

    expect(board.entries.map((e) => [e.rank, e.driverName, e.gapToLeader])).toEqual([
      [1, 'Fast', 0],
      [2, 'Me', 0.6],
      [3, 'Slow', 1.5],
    ]);
    expect(playerEntry(board)?.driverName).toBe('Me');
    expect(playerEntry(board)?.bestLap).toMatchObject({ sessionId: 'r1', lapNumber: 3, lapTime: 108.1 });
  });

  it('never ranks AI drivers: offline sessions only count the player', () => {
    const sessions = [
      session('offline', [driver('Me', [lap(2, 108)], { isPlayer: true }), driver('AI Bot', [lap(2, 100)])], { online: false }),
      session('online', [driver('Human', [lap(2, 107)])]),
    ];
    expect(names(sessions)).toEqual(['Human', 'Me']);
  });

  it('keeps the laps of another layout of the same facility off the board', () => {
    const sessions = [
      session('gp', [driver('Me', [lap(2, 108)], { isPlayer: true })]),
      session('cg', [driver('Curva', [lap(2, 90)])], { trackCourse: MONZA_CURVA_GRANDE }),
    ];
    expect(getCircuitSpecification(sessions[0].trackVenue, sessions[0].trackCourse, null, null, null, sessions[0].trackLengthMeters).layoutKey).toBe('monza_gp');
    expect(getCircuitSpecification(sessions[1].trackVenue, sessions[1].trackCourse, null, null, null, sessions[1].trackLengthMeters).layoutKey).toBe('monza_curvagrande');
    expect(names(sessions)).toEqual(['Me']);
  });

  it('ranks one class at a time, and one car when a car is given', () => {
    const sessions = [
      session('r1', [
        driver('Me', [lap(2, 108)], { isPlayer: true }),
        driver('Porsche', [lap(2, 107)], { carType: 'Porsche 911 GT3 R LMGT3' }),
        driver('Hyper', [lap(2, 95)], { carType: 'Ferrari 499P', carClass: 'Hyper' }),
      ]),
    ];
    expect(names(sessions)).toEqual(['Porsche', 'Me']);
    expect(names(sessions, { ...MONZA, carClass: 'Hyper' })).toEqual(['Hyper']);
    const carBoard = boardOf(sessions, { ...MONZA, carType: 'ferrari 296 lmgt3' });
    expect(carBoard.scope).toBe('car');
    expect(carBoard.entries.map((e) => e.driverName)).toEqual(['Me']);
  });

  it('only counts representative laps: no start, pit, out, invalid, non-representative or wet laps', () => {
    const board = boardOf([
      session('r1', [
        driver('Me', [
          lap(2, 100, { isValid: false }),
          lap(3, 100.5, { isPitStop: true }),
          lap(4, 101, { isOutLap: true }),
          lap(5, 101.5, { nonRepresentativeReason: 'traffic' }),
          lap(6, 102, { conditions: { wetTyres: true } }),
          lap(8, 102.5, { conditions: { rain: 18 } }),
          lap(7, 108),
        ], { isPlayer: true }),
      ]),
    ], MONZA);
    expect(playerEntry(board)?.bestLap.lapNumber).toBe(7);
    expect(playerEntry(board)?.representativeLaps).toBe(1);
  });

  it('builds the theoretical best from the best sectors of different laps, and ranks each sector', () => {
    const board = boardOf([
      session('r1', [
        driver('Me', [
          lap(2, 110, { s1: 30, s2: 45, s3: 35 }),
          lap(3, 111, { s1: 32, s2: 44, s3: 35 }),
        ], { isPlayer: true }),
        driver('Rival', [lap(2, 109, { s1: 31, s2: 43, s3: 35 })]),
      ]),
    ], MONZA);
    const me = playerEntry(board)!;
    expect(me.theoreticalBest).toBe(109);
    expect([me.s1Rank, me.s2Rank, me.s3Rank]).toEqual([1, 2, 1]);
    expect(board.entries[0].driverName).toBe('Rival');
  });

  it('preserves competition rank gaps for tied sectors and pace, leaving missing values unranked', () => {
    const board = boardOf([session('ties', [
      driver('First', [2, 3, 4].map((n) => lap(n, 108, { s1: 30 }))),
      driver('Tied', [2, 3, 4].map((n) => lap(n, 108, { s1: 30 }))),
      driver('Third', [2, 3, 4].map((n) => lap(n, 110, { s1: 32 }))),
      driver('Missing', [lap(2, 111, { s1: null })]),
    ])], MONZA);
    expect(board.entries.map((e) => [e.driverName, e.s1Rank, e.top3AverageRank])).toEqual([
      ['First', 1, 1], ['Tied', 1, 1], ['Third', 3, 3], ['Missing', null, null],
    ]);
  });

  it('gives race pace as the best average of three laps within one session', () => {
    const board = boardOf([
      session('r1', [driver('Me', [lap(2, 108), lap(3, 109), lap(4, 110), lap(5, 115)], { isPlayer: true })]),
      session('r2', [driver('Me', [lap(2, 107), lap(3, 120)], { isPlayer: true })], { timestamp: 2000 }),
    ], MONZA);
    expect(playerEntry(board)).toMatchObject({ top3Average: 109, top3AverageRank: 1, sessions: 2, lastDriven: 2000 });
    expect(playerEntry(board)?.bestLap.lapTime).toBe(107);
  });
});

describe('leaderboard layouts query', () => {
  it('lists the layouts the player drove, newest first, with the class driven last and the rank per class', () => {
    const layouts = layoutsOf([
      session('old', [driver('Me', [lap(2, 108)], { isPlayer: true }), driver('Fast', [lap(2, 107)])], { timestamp: 1000 }),
      session('new', [driver('Me', [lap(2, 95)], { isPlayer: true, carType: 'Ferrari 499P', carClass: 'Hyper' })], {
        timestamp: 3000,
      }),
      session('cg', [driver('Me', [lap(2, 90)], { isPlayer: true })], { trackCourse: MONZA_CURVA_GRANDE, timestamp: 2000 }),
      session('others', [driver('Stranger', [lap(2, 100)])], { trackVenue: 'Circuit de Spa-Francorchamps', trackCourse: '' }),
    ]);

    expect(layouts.map((l) => l.layoutKey)).toEqual(['monza_gp', 'monza_curvagrande']);
    const gp = layouts[0];
    expect(gp).toMatchObject({ lastDriven: 3000, lastCarClass: 'Hyper', trackName: 'Autodromo Nazionale Monza', circuitName: 'Autodromo Nazionale Monza' });
    // The circuit name never repeats the layout: that is the layout name's job.
    expect(layouts[1]).toMatchObject({ circuitName: 'Autodromo Nazionale Monza', layoutName: 'Curva Grande Circuit' });
    expect(gp.classes.map((c) => [c.carClass, c.playerRank, c.fieldSize, c.lastCarType])).toEqual([
      ['Hyper', 1, 1, 'Ferrari 499P'],
      ['GT3', 2, 2, 'Ferrari 296 LMGT3'],
    ]);
  });
});
