import { describe, it, expect } from 'vitest';
import {
  buildLeaderboard,
  findLayoutBenchmark,
  listLeaderboardLayouts,
  sessionLayoutKey,
} from '../../shared/domain/leaderboard.js';
import type { ReferenceLaptimeEntry } from '../../shared/types/index.js';
import { driver, lap, MONZA_CURVA_GRANDE, session } from './leaderboardFixtures.js';

const MONZA = { layoutKey: 'monza_gp', carClass: 'LMGT3' };

const names = (sessions: Parameters<typeof buildLeaderboard>[0], query = MONZA) =>
  buildLeaderboard(sessions, query).entries.map((e) => e.driverName);

describe('buildLeaderboard', () => {
  it('ranks the real drivers by their best representative lap, with the gap to the leader', () => {
    const board = buildLeaderboard([
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
    expect(board.player?.driverName).toBe('Me');
    expect(board.player?.bestLap).toMatchObject({ sessionId: 'r1', lapNum: 3, lapTime: 108.1 });
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
    expect(sessionLayoutKey(sessions[0])).toBe('monza_gp');
    expect(sessionLayoutKey(sessions[1])).toBe('monza_curvagrande');
    expect(names(sessions)).toEqual(['Me']);
  });

  it('ranks one class at a time, and one car when a car is given', () => {
    const sessions = [
      session('r1', [
        driver('Me', [lap(2, 108)], { isPlayer: true }),
        driver('Porsche', [lap(2, 107)], { carType: 'Porsche 911 GT3 R LMGT3' }),
        driver('Hyper', [lap(2, 95)], { carType: 'Ferrari 499P', carClass: 'Hypercar' }),
      ]),
    ];
    expect(names(sessions)).toEqual(['Porsche', 'Me']);
    expect(names(sessions, { ...MONZA, carClass: 'LMH' })).toEqual(['Hyper']);
    const carBoard = buildLeaderboard(sessions, { ...MONZA, carType: 'ferrari 296 lmgt3' });
    expect(carBoard.scope).toBe('car');
    expect(carBoard.entries.map((e) => e.driverName)).toEqual(['Me']);
  });

  it('only counts representative laps: no start, pit, out, invalid, non-representative or wet laps', () => {
    const board = buildLeaderboard([
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
    expect(board.player?.bestLap.lapNum).toBe(7);
    expect(board.player?.representativeLaps).toBe(1);
  });

  it('builds the theoretical best from the best sectors of different laps, and ranks each sector', () => {
    const board = buildLeaderboard([
      session('r1', [
        driver('Me', [
          lap(2, 110, { s1: 30, s2: 45, s3: 35 }),
          lap(3, 111, { s1: 32, s2: 44, s3: 35 }),
        ], { isPlayer: true }),
        driver('Rival', [lap(2, 109, { s1: 31, s2: 43, s3: 35 })]),
      ]),
    ], MONZA);
    const me = board.player!;
    expect(me.theoreticalBest).toBe(109);
    expect([me.s1Rank, me.s2Rank, me.s3Rank]).toEqual([1, 2, 1]);
    expect(board.entries[0].driverName).toBe('Rival');
  });

  it('gives race pace as the best average of three laps within one session', () => {
    const board = buildLeaderboard([
      session('r1', [driver('Me', [lap(2, 108), lap(3, 109), lap(4, 110), lap(5, 115)], { isPlayer: true })]),
      session('r2', [driver('Me', [lap(2, 107), lap(3, 120)], { isPlayer: true })], { timestamp: 2000 }),
    ], MONZA);
    expect(board.player).toMatchObject({ top3Average: 109, top3AverageRank: 1, sessions: 2, lastDriven: 2000 });
    expect(board.player?.bestLap.lapTime).toBe(107);
  });
});

describe('findLayoutBenchmark', () => {
  const entry = (trackName: string, carClass: string): ReferenceLaptimeEntry => ({
    key: `${trackName}_${carClass}`,
    trackName,
    carClass,
    patch: '1.4',
    target100Sec: 100,
  } as ReferenceLaptimeEntry);

  it('takes the target of the layout and class, and never another class', () => {
    const entries = [entry('Monza', 'Hypercar'), entry('Monza', 'LMGT3')];
    expect(findLayoutBenchmark(entries, 'monza_gp', 'LMGT3')?.carClass).toBe('LMGT3');
    expect(findLayoutBenchmark([entries[0]], 'monza_gp', 'LMGT3')).toBeNull();
  });
});

describe('listLeaderboardLayouts', () => {
  it('lists the layouts the player drove, newest first, with the class driven last and the rank per class', () => {
    const layouts = listLeaderboardLayouts([
      session('old', [driver('Me', [lap(2, 108)], { isPlayer: true }), driver('Fast', [lap(2, 107)])], { timestamp: 1000 }),
      session('new', [driver('Me', [lap(2, 95)], { isPlayer: true, carType: 'Ferrari 499P', carClass: 'Hypercar' })], {
        timestamp: 3000,
      }),
      session('cg', [driver('Me', [lap(2, 90)], { isPlayer: true })], { trackCourse: MONZA_CURVA_GRANDE, timestamp: 2000 }),
      session('others', [driver('Stranger', [lap(2, 100)])], { trackVenue: 'Circuit de Spa-Francorchamps', trackCourse: '' }),
    ]);

    expect(layouts.map((l) => l.layoutKey)).toEqual(['monza_gp', 'monza_curvagrande']);
    const gp = layouts[0];
    expect(gp).toMatchObject({ lastDriven: 3000, lastCarClass: 'LMH', trackName: 'Autodromo Nazionale Monza' });
    expect(gp.classes.map((c) => [c.carClass, c.playerRank, c.fieldSize, c.lastCarType])).toEqual([
      ['LMH', 1, 1, 'Ferrari 499P'],
      ['LMGT3', 2, 2, 'Ferrari 296 LMGT3'],
    ]);
  });
});
