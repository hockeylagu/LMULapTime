import { describe, it, expect } from 'vitest';
import { buildLeaderboardRows, LeaderboardRow } from '../../../../src/components/compare-laps/leaderboard/leaderboardRows.js';
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
    const rows = buildLeaderboardRows(board(60, 40), 'lap', true);
    const shown = describeRows(rows);
    expect(shown.slice(0, 10)).toEqual(Array.from({ length: 10 }, (_, i) => `${i + 1}:Driver ${i + 1}`));
    expect(shown[10]).toBe('(24 hidden)');
    expect(shown.slice(11, 22)).toContain('40:Me');
    expect(shown[11]).toBe('35:Driver 35');
    expect(shown[21]).toBe('45:Driver 45');
    expect(shown[22]).toBe('(15 hidden)');
    expect(buildLeaderboardRows(board(60, 40), 'lap', false)).toHaveLength(60);
  });

  it('shows a board of up to 25 drivers whole', () => {
    expect(buildLeaderboardRows(board(25, 25), 'lap', true).filter((r) => r.kind === 'driver')).toHaveLength(25);
  });

  it('works without a player on the board', () => {
    const b = board(30, null);
    const rows = describeRows(buildLeaderboardRows(b, 'lap', true));
    expect(rows).toHaveLength(11);
    expect(rows[10]).toBe('(20 hidden)');
  });
});
