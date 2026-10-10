import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { DetailedSession } from '../../../../shared/types/index.js';
import { buildLeaderboard, listLeaderboardLayouts, playerSessionBests } from '../../../../shared/domain/leaderboard.js';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { upsertSession } from '../../../../server/core/dbSessionStore.js';
import { queryCompactLeaderboard, queryCompactLeaderboardLayouts, queryCompactPlayerSessionBests } from '../../../../server/core/sessionSummaries/leaderboardQueries.js';
import { driver, lap, session } from '../../../domain/leaderboardFixtures.js';

describe('compact leaderboard queries', () => {
  it('matches deterministic board, layout and player-session results across grouped history', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const sessions: DetailedSession[] = [
      session('race-a', [driver('Me', [lap(2, 108), lap(3, 107.8), lap(4, 107.9)], { isPlayer: true }),
        driver('Rival', [lap(2, 107.7), lap(3, 107.8), lap(4, 107.6)])], { timestamp: 1000 }),
      session('race-b', [driver('Me', [lap(2, 107.5), lap(3, 107.4), lap(4, 107.6)], { isPlayer: true }),
        driver('Other', [lap(2, 109), lap(3, 110), lap(4, 111)])], { timestamp: 2000 }),
    ];
    sessions.forEach(value => upsertSession(db, value, value.filename, value.timestamp, 1));
    const query = { layoutKey: 'monza_gp', carClass: 'LMGT3' };
    expect(queryCompactLeaderboard(db, query)).toEqual(buildLeaderboard(sessions, query));
    expect(queryCompactLeaderboardLayouts(db)).toEqual(listLeaderboardLayouts(sessions));
    expect(queryCompactPlayerSessionBests(db, query)).toEqual(playerSessionBests(sessions, query));
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
    expect(queryCompactLeaderboard(db, { layoutKey: 'monza_gp', carClass: 'LMGT3' }).player?.top3Average).toBe(103);
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
    const entry = queryCompactLeaderboard(db, { layoutKey: 'monza_gp', carClass: 'LMGT3' }).entries[0];
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
    const board = queryCompactLeaderboard(db, { layoutKey: 'monza_gp', carClass: 'LMGT3' });
    const entries = Object.fromEntries(board.entries.map(entry => [entry.driverName, entry]));
    expect(entries.Me?.s1Rank).toBe(1);
    expect(entries.Rival?.s1Rank).toBe(1);
    expect(entries.Third?.s1Rank).toBe(3);
    expect(entries.Me?.top3AverageRank).toBe(1);
    expect(entries.Rival?.top3AverageRank).toBe(1);
    expect(entries.Third?.top3AverageRank).toBe(3);
    expect(board).toEqual(buildLeaderboard([value], { layoutKey: 'monza_gp', carClass: 'LMGT3' }));
    expect(queryCompactLeaderboardLayouts(db)).toEqual(listLeaderboardLayouts([value]));
    expect(queryCompactLeaderboardLayouts(db)[0].classes[0].playerRank).toBe(1);
    db.close();
  });
});
