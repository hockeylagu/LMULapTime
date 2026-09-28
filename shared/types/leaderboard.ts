import type { ReferenceLaptimeEntry } from './index.js';

/** One lap on a leaderboard: enough to show it, compare it and open its telemetry. */
export interface LeaderboardLap {
  sessionId: string;
  sessionName: string;
  sessionType: string;
  timestamp: number;
  lapNum: number;
  lapTime: number;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  carType: string;
  /** The replay recording the lap's session, when there is one: telemetry needs it. */
  replayName: string | null;
}

/** One driver's standing on a layout, in one car class (or one car). */
export interface LeaderboardEntry {
  driverName: string;
  isPlayer: boolean;
  /** 1-based rank by best lap. */
  rank: number;
  bestLap: LeaderboardLap;
  /** Best sectors over all the driver's representative laps: they may come from different laps. */
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  s1Rank: number | null;
  s2Rank: number | null;
  s3Rank: number | null;
  /** bestS1 + bestS2 + bestS3, when all three are known. */
  theoreticalBest: number | null;
  /** The best average of three representative laps within one session: race pace. */
  top3Average: number | null;
  top3AverageRank: number | null;
  /** bestLap.lapTime - the leader's, in seconds. */
  gapToLeader: number;
  representativeLaps: number;
  sessions: number;
  lastDriven: number;
}

export type LeaderboardScope = 'class' | 'car';

export interface Leaderboard {
  layoutKey: string;
  layoutName: string;
  carClass: string;
  scope: LeaderboardScope;
  /** The car the board is limited to when scope is 'car'. */
  carType: string | null;
  entries: LeaderboardEntry[];
  /** The player's entry, when the player has a representative lap here. */
  player: LeaderboardEntry | null;
  /** The community benchmark targets for this layout and class, when known. */
  benchmark: ReferenceLaptimeEntry | null;
}

/** A class the player drove on a layout, as the track ribbon shows it. */
export interface LeaderboardLayoutClass {
  carClass: string;
  lastDriven: number;
  /** The car the player drove last in this class on this layout. */
  lastCarType: string;
  playerBest: number | null;
  playerRank: number | null;
  fieldSize: number;
}

/** A layout the player drove: one card of the track ribbon. */
export interface LeaderboardLayout {
  layoutKey: string;
  layoutName: string;
  /** The track name the rest of the app uses for this layout (sessions, benchmarks). */
  trackName: string;
  countryCode: string;
  flagEmoji: string;
  lastDriven: number;
  /** A thumbnail SVG path of the layout in a 100 x 100 box; null when its geometry is not known. */
  outlinePath?: string | null;
  /** The class the player drove last here. */
  lastCarClass: string;
  classes: LeaderboardLayoutClass[];
}
