import type { ReferenceLaptimeEntry } from './index.js';

/** One lap on a leaderboard: enough to show it, compare it and open its telemetry. */
export interface LeaderboardLap {
  sessionId: string;
  sessionName: string;
  sessionType: string;
  timestamp: number;
  /** Zero-based position in the session's source driver list, when hydrated. */
  driverOrdinal?: number;
  /** Zero-based position in that driver's source lap list, when hydrated. */
  lapOrdinal?: number;
  lapNum: number;
  lapTime: number;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  carType: string;
  /** Whether this session currently has a recording available for telemetry. */
  telemetryAvailable: boolean;
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
  /** The circuit's name, without the layout (layoutName says which one). */
  circuitName: string;
  countryCode: string;
  flagEmoji: string;
  lastDriven: number;
  /** The class the player drove last here. */
  lastCarClass: string;
  classes: LeaderboardLayoutClass[];
}

export type RivalKind = 'driver' | 'ghost';
export type RivalTargetStatus = 'active' | 'beaten' | 'skipped' | 'replaced';

/** A rival target as stored: a real driver to beat, or a ghost time when nobody is close enough. */
export interface RivalTarget {
  id: number;
  kind: RivalKind;
  driverName: string | null;
  /** The lap time to beat: the rival's best lap, or the ghost time. */
  targetTime: number;
  /** The player's best when the target was set: where the progress bar starts. */
  startTime: number;
  pinned: boolean;
  status: RivalTargetStatus;
  setAt: number;
  endedAt: number | null;
  /** The player's lap that beat the target. */
  beatenTime: number | null;
  beatenSessionId: string | null;
}

/** One of the player's sessions on the board, with its best lap and the gap to the current target. */
export interface RivalGapPoint {
  sessionId: string;
  sessionName: string;
  timestamp: number;
  best: number;
  gap: number;
}

/** The player's rival on a board, and how the chase is going. */
export interface RivalStatus {
  rival: RivalTarget | null;
  /** The rival driver's line on the board (their lap, replay and sectors); null for a ghost. */
  rivalEntry: LeaderboardEntry | null;
  /** Player best - target: the time still to find (negative once beaten). */
  gap: number | null;
  /** 0 when the target was set, 1 at the target. */
  progress: number | null;
  /** Player theoretical best - target: negative when the best sectors already beat the rival. */
  theoreticalGap: number | null;
  /** Rivals beaten on this board, the latest first. */
  beaten: RivalTarget[];
  /** The drivers just ahead of the rival: the next rungs of the ladder. */
  nextUp: LeaderboardEntry[];
  /** The player's last sessions here, with each one's gap to the current target. */
  trend: RivalGapPoint[];
}
