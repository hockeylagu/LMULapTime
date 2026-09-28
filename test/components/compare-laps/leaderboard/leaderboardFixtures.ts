import type { ReferenceLaptimeEntry } from '../../../../shared/types/index.js';
import type { Leaderboard, LeaderboardEntry } from '../../../../shared/types/leaderboard.js';

/** A board entry ranked by lap time; sectors split the lap 30/40/30. */
export function entry(rank: number, driverName: string, lapTime: number, extra: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    driverName,
    isPlayer: false,
    rank,
    bestLap: {
      sessionId: `s-${driverName}`,
      sessionName: 'R1',
      sessionType: 'Race',
      timestamp: 1_700_000_000,
      lapNum: 3,
      lapTime,
      s1: lapTime * 0.3,
      s2: lapTime * 0.4,
      s3: lapTime * 0.3,
      carType: 'Ferrari 296 LMGT3',
      replayName: `${driverName}.Vcr`,
    },
    bestS1: lapTime * 0.3,
    bestS2: lapTime * 0.4,
    bestS3: lapTime * 0.3,
    s1Rank: rank,
    s2Rank: rank,
    s3Rank: rank,
    theoreticalBest: lapTime,
    top3Average: lapTime + 0.5,
    top3AverageRank: rank,
    gapToLeader: 0,
    representativeLaps: 5,
    sessions: 1,
    lastDriven: 1_700_000_000,
    ...extra,
  };
}

/** A board of `count` drivers 0.1 s apart from 100 s, the player at `playerRank`. */
export function board(count: number, playerRank: number | null, benchmark: ReferenceLaptimeEntry | null = null): Leaderboard {
  const entries = Array.from({ length: count }, (_, i) =>
    entry(i + 1, i + 1 === playerRank ? 'Me' : `Driver ${i + 1}`, 100 + i * 0.1, {
      isPlayer: i + 1 === playerRank,
      gapToLeader: Number((i * 0.1).toFixed(3)),
    })
  );
  return {
    layoutKey: 'monza_gp',
    layoutName: 'Grand Prix Circuit',
    carClass: 'LMGT3',
    scope: 'class',
    carType: null,
    entries,
    player: entries.find((e) => e.isPlayer) ?? null,
    benchmark,
  };
}

export const BENCHMARK = {
  key: 'Monza_LMGT3',
  trackName: 'Monza',
  carClass: 'LMGT3',
  patch: '1.4',
  target100Sec: 100.05,
  targets: {
    alienSec: 100.05,
    competitiveSec: 100.25,
    goodSec: 100.45,
    goodMidpackSec: 150,
    midpackSec: 151,
    midpackTailSec: 152,
    tailEnderSec: 153,
    offlineSec: 154,
  },
} as ReferenceLaptimeEntry;
