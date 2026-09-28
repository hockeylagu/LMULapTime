import { describe, it, expect } from 'vitest';
import { buildLeaderboardRows, LeaderboardRow } from '../../../../src/components/leaderboard/board/leaderboardRows.js';
import { BENCHMARK, board } from './leaderboardFixtures.js';

const describeRows = (rows: LeaderboardRow[]) =>
  rows.map((r) => (r.kind === 'driver' ? `${r.rank}:${r.entry.driverName}` : r.kind === 'band' ? `[${r.percent}%]` : `(${r.count} hidden)`));

describe('buildLeaderboardRows', () => {
  it('puts the benchmark bands between the drivers on the best-lap order, down to the slowest driver', () => {
    const rows = buildLeaderboardRows(board(6, 3, BENCHMARK), 'lap', true);
    expect(describeRows(rows)).toEqual([
      '1:Driver 1', '[100%]', '2:Driver 2', '3:Me', '[101%]', '4:Driver 4', '5:Driver 5', '[102%]', '6:Driver 6',
    ]);
  });

  it('orders by a sector or race pace, drivers without a value last and unranked', () => {
    const b = board(3, 1, BENCHMARK);
    b.entries[2] = { ...b.entries[2], s2Rank: 1 };
    b.entries[0] = { ...b.entries[0], s2Rank: 2 };
    b.entries[1] = { ...b.entries[1], bestS2: null, s2Rank: null };
    const rows = buildLeaderboardRows(b, 's2', true);
    expect(describeRows(rows)).toEqual(['1:Driver 3', '2:Me', 'null:Driver 2']);
  });

  it('keeps a big board to the top ten and the drivers around the player, counting the hidden ones', () => {
    const shown = describeRows(buildLeaderboardRows(board(60, 20), 'lap', true));
    expect(shown.slice(0, 10)).toEqual(Array.from({ length: 10 }, (_, i) => `${i + 1}:Driver ${i + 1}`));
    expect(shown[10]).toBe('(4 hidden)');
    expect(shown[11]).toBe('15:Driver 15');
    expect(shown[21]).toBe('25:Driver 25');
    expect(shown[22]).toBe('(35 hidden)');
    expect(buildLeaderboardRows(board(60, 40), 'lap', false)).toHaveLength(60);
  });

  it('keeps only the top five when the player is far down the board', () => {
    const shown = describeRows(buildLeaderboardRows(board(60, 40), 'lap', true));
    expect(shown.slice(0, 5)).toEqual(Array.from({ length: 5 }, (_, i) => `${i + 1}:Driver ${i + 1}`));
    expect(shown[5]).toBe('(29 hidden)');
    expect(shown.slice(6, 17)).toContain('40:Me');
    expect(shown[6]).toBe('35:Driver 35');
    expect(shown[16]).toBe('45:Driver 45');
    expect(shown[17]).toBe('(15 hidden)');
  });

  it('shows a board of up to 25 drivers whole', () => {
    expect(buildLeaderboardRows(board(25, 25), 'lap', true).filter((r) => r.kind === 'driver')).toHaveLength(25);
  });

  it('keeps the rival, two drivers either side, and every pace band on a compact board', () => {
    const b = board(60, 40);
    const bands = { alienSec: 0, competitiveSec: 0, goodSec: b.entries[19].bestLap.lapTime + 0.0001, goodMidpackSec: 0, midpackSec: 0, midpackTailSec: 0, tailEnderSec: 0, offlineSec: 0 };
    b.benchmark = { ...BENCHMARK, targets: bands };
    const shown = describeRows(buildLeaderboardRows(b, 'lap', true, 'Driver 25'));
    expect(shown.slice(5, 14)).toEqual([
      '(15 hidden)', '[102%]', '(2 hidden)',
      '23:Driver 23', '24:Driver 24', '25:Driver 25', '26:Driver 26', '27:Driver 27', '(7 hidden)',
    ]);
  });

  it('shows a band below the player only among the drivers shown around them', () => {
    const b = board(60, 40);
    const lap = (i: number) => b.entries[i].bestLap.lapTime + 0.0001;
    const bands = { alienSec: 0, competitiveSec: 0, goodSec: 0, goodMidpackSec: lap(41), midpackSec: lap(54), midpackTailSec: 0, tailEnderSec: 0, offlineSec: 0 };
    b.benchmark = { ...BENCHMARK, targets: bands };
    const shown = describeRows(buildLeaderboardRows(b, 'lap', true));
    expect(shown).toContain('[103%]');
    expect(shown).not.toContain('[104%]');
  });

  it('works without a player on the board', () => {
    const b = board(30, null);
    const rows = describeRows(buildLeaderboardRows(b, 'lap', true));
    expect(rows).toHaveLength(11);
    expect(rows[10]).toBe('(20 hidden)');
  });
});
