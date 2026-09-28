import type { ReferenceLaptimeEntry } from '../../../../shared/types/index.js';
import type { Leaderboard, LeaderboardEntry } from '../../../../shared/types/leaderboard.js';

export type LeaderboardSort = 'lap' | 's1' | 's2' | 's3' | 'pace';

export type LeaderboardRow =
  | { kind: 'driver'; entry: LeaderboardEntry; rank: number | null; value: number | null }
  | { kind: 'band'; label: string; percent: number; time: number }
  | { kind: 'hidden'; count: number };

const VALUE: Record<LeaderboardSort, (e: LeaderboardEntry) => number | null> = {
  lap: (e) => e.bestLap.lapTime,
  s1: (e) => e.bestS1,
  s2: (e) => e.bestS2,
  s3: (e) => e.bestS3,
  pace: (e) => e.top3Average,
};

const RANK: Record<LeaderboardSort, (e: LeaderboardEntry) => number | null> = {
  lap: (e) => e.rank,
  s1: (e) => e.s1Rank,
  s2: (e) => e.s2Rank,
  s3: (e) => e.s3Rank,
  pace: (e) => e.top3AverageRank,
};

/** The community pace bands, as ghost rows between the drivers (100% = alien). */
export function benchmarkBands(benchmark: ReferenceLaptimeEntry | null): Array<{ label: string; percent: number; time: number }> {
  const t = benchmark?.targets;
  if (!t) return [];
  return [
    { label: 'Alien', percent: 100, time: t.alienSec },
    { label: 'Competitive', percent: 101, time: t.competitiveSec },
    { label: 'Good', percent: 102, time: t.goodSec },
    { label: 'Good midpack', percent: 103, time: t.goodMidpackSec },
    { label: 'Midpack', percent: 104, time: t.midpackSec },
    { label: 'Midpack tail', percent: 105, time: t.midpackTailSec },
    { label: 'Tail-ender', percent: 106, time: t.tailEnderSec },
    { label: 'Offline', percent: 107, time: t.offlineSec },
  ].filter((band) => band.time > 0);
}

export const COMPACT_TOP = 10;
export const COMPACT_AROUND_PLAYER = 5;
/** Boards up to this many drivers are always shown whole. */
export const COMPACT_THRESHOLD = 25;

/**
 * The rows of the board in the chosen order. Drivers without a value for it (no race pace, a
 * missing sector) come last, unranked. On the best-lap order the benchmark bands sit between the
 * drivers, down to the slowest one. A compact board keeps the top ten and the drivers around the
 * player, and says how many drivers each cut hides.
 */
export function buildLeaderboardRows(board: Leaderboard, sort: LeaderboardSort, compact: boolean): LeaderboardRow[] {
  const value = VALUE[sort];
  const rank = RANK[sort];
  const drivers = board.entries
    .map((entry) => ({ kind: 'driver' as const, entry, rank: rank(entry), value: value(entry) }))
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (a.entry.rank - b.entry.rank));

  const all: LeaderboardRow[] = [];
  const bands = sort === 'lap' ? benchmarkBands(board.benchmark) : [];
  const slowest = drivers.length > 0 ? drivers[drivers.length - 1].value ?? 0 : 0;
  let next = 0;
  for (const driver of drivers) {
    while (next < bands.length && driver.value !== null && bands[next].time <= driver.value) all.push({ kind: 'band', ...bands[next++] });
    all.push(driver);
  }
  while (next < bands.length && bands[next].time <= slowest) all.push({ kind: 'band', ...bands[next++] });

  if (!compact || drivers.length <= COMPACT_THRESHOLD) return all;

  const playerIndex = drivers.findIndex((d) => d.entry.isPlayer);
  const visibleDriver = (index: number) =>
    index < COMPACT_TOP || (playerIndex >= 0 && Math.abs(index - playerIndex) <= COMPACT_AROUND_PLAYER);

  const rows: LeaderboardRow[] = [];
  let driverIndex = -1;
  let hidden = 0;
  for (let i = 0; i < all.length; i++) {
    const row = all[i];
    if (row.kind === 'driver') {
      driverIndex++;
      if (!visibleDriver(driverIndex)) {
        hidden++;
        continue;
      }
    } else if (!visibleDriver(driverIndex + 1)) {
      continue; // a band inside a hidden stretch
    }
    if (hidden > 0) {
      rows.push({ kind: 'hidden', count: hidden });
      hidden = 0;
    }
    rows.push(row);
  }
  if (hidden > 0) rows.push({ kind: 'hidden', count: hidden });
  return rows;
}
