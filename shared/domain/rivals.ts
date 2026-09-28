import type { Leaderboard, LeaderboardEntry, RivalKind, RivalStatus, RivalTarget } from '../types/leaderboard.js';

/**
 * The rival system: a small, attainable step at a time. The rival is the real driver ahead whose
 * best lap is closest to 0.3 s faster than the player's (0.1 s to 0.6 s), preferring drivers whose
 * lap has a replay, so the telemetry can show where the time is. When nobody is in that window, a
 * ghost time 0.2 s under the player's best stands in. A rival stays until it is beaten, skipped or
 * replaced: the target does not move each time new laps arrive.
 *
 * The step is in seconds, not a share of the lap: the time is found in the corners, and a long lap
 * is mostly straights (0.3% at Le Mans is 0.7 s, more than twice the step at Daytona).
 */

export const RIVAL_TARGET_STEP = 0.3;
export const RIVAL_MIN_STEP = 0.1;
export const RIVAL_MAX_STEP = 0.6;
export const GHOST_STEP = 0.2;
/** A lap without a replay counts as this much further from the ideal step. */
const NO_REPLAY_PENALTY = 0.1;

/** The driver to chase next, or null when nobody ahead is within the window. */
export function pickRivalEntry(board: Leaderboard, exclude: ReadonlySet<string> = new Set()): LeaderboardEntry | null {
  const player = board.player;
  if (!player) return null;
  const best = player.bestLap.lapTime;
  let pick: LeaderboardEntry | null = null;
  let pickScore = Infinity;
  for (const entry of board.entries) {
    if (entry.isPlayer || exclude.has(entry.driverName)) continue;
    const step = best - entry.bestLap.lapTime;
    if (step < RIVAL_MIN_STEP || step > RIVAL_MAX_STEP) continue;
    const score = Math.abs(step - RIVAL_TARGET_STEP) + (entry.bestLap.replayName ? 0 : NO_REPLAY_PENALTY);
    if (score < pickScore) {
      pick = entry;
      pickScore = score;
    }
  }
  return pick;
}

export function ghostTargetTime(playerBest: number): number {
  return Number((playerBest - GHOST_STEP).toFixed(3));
}

/** A new target to store; the store gives it an id. */
export interface NewRivalTarget {
  kind: RivalKind;
  driverName: string | null;
  targetTime: number;
  startTime: number;
  pinned: boolean;
  setAt: number;
}

/** What resolving the rival changes in the store, and the target active afterwards. */
export interface RivalResolution {
  /** The active target was beaten by the player's best lap. */
  beaten: { id: number; beatenTime: number; beatenSessionId: string; endedAt: number } | null;
  /** The rival improved their best lap: the target follows it. */
  retimed: { id: number; targetTime: number } | null;
  /** A rival picked for the player is now out of reach (it improved, or the step changed): pick again. */
  replaced: { id: number; endedAt: number } | null;
  /** A new target to store, when none is active any more. */
  created: NewRivalTarget | null;
  /** The active target after the changes (id 0 when it is the one to create). */
  active: RivalTarget | null;
}

function newTarget(board: Leaderboard, exclude: ReadonlySet<string>, now: number): NewRivalTarget | null {
  const player = board.player;
  if (!player) return null;
  const entry = pickRivalEntry(board, exclude);
  const startTime = player.bestLap.lapTime;
  return entry
    ? { kind: 'driver', driverName: entry.driverName, targetTime: entry.bestLap.lapTime, startTime, pinned: false, setAt: now }
    : { kind: 'ghost', driverName: null, targetTime: ghostTargetTime(startTime), startTime, pinned: false, setAt: now };
}

const asActive = (target: NewRivalTarget): RivalTarget => ({
  ...target,
  id: 0,
  status: 'active',
  endedAt: null,
  beatenTime: null,
  beatenSessionId: null,
});

/**
 * Brings the stored rival up to date with the board: a driver target follows the rival's current
 * best; a target the player's best lap beats is ended as beaten; and when no target is active a
 * new one is picked, never one of the drivers the player skipped.
 */
export function resolveRival(
  board: Leaderboard,
  active: RivalTarget | null,
  skippedDrivers: ReadonlySet<string>,
  now: number
): RivalResolution {
  const resolution: RivalResolution = { beaten: null, retimed: null, replaced: null, created: null, active };
  const player = board.player;
  if (!player) return resolution;

  let current = active;
  if (current?.kind === 'driver') {
    const rivalTime = board.entries.find((e) => e.driverName === current?.driverName)?.bestLap.lapTime;
    if (rivalTime !== undefined && rivalTime !== current.targetTime) {
      resolution.retimed = { id: current.id, targetTime: rivalTime };
      current = { ...current, targetTime: rivalTime };
    }
  }

  // A rival the player chose stays however far it gets; one picked for them stays within reach.
  if (current?.kind === 'driver' && !current.pinned && player.bestLap.lapTime - current.targetTime > RIVAL_MAX_STEP) {
    resolution.replaced = { id: current.id, endedAt: now };
    current = null;
  }

  if (current && player.bestLap.lapTime < current.targetTime) {
    resolution.beaten = {
      id: current.id,
      beatenTime: player.bestLap.lapTime,
      beatenSessionId: player.bestLap.sessionId,
      endedAt: now,
    };
    current = null;
  }

  if (!current) {
    const beatenDriver = resolution.beaten && active?.driverName ? [active.driverName] : [];
    resolution.created = newTarget(board, new Set([...skippedDrivers, ...beatenDriver]), now);
    current = resolution.created ? asActive(resolution.created) : null;
  }
  resolution.active = current;
  return resolution;
}

/** A target on a driver the player chose, when that driver is ahead; null otherwise. */
export function pinnedTarget(board: Leaderboard, driverName: string, now: number): NewRivalTarget | null {
  const player = board.player;
  const entry = board.entries.find((e) => e.driverName === driverName && !e.isPlayer);
  if (!player || !entry || entry.bestLap.lapTime >= player.bestLap.lapTime) return null;
  return {
    kind: 'driver',
    driverName,
    targetTime: entry.bestLap.lapTime,
    startTime: player.bestLap.lapTime,
    pinned: true,
    setAt: now,
  };
}

/** Where the player stands against the target: the gap, and the share of it closed since it was set. */
export function rivalProgress(target: RivalTarget, playerBest: number): { gap: number; progress: number } {
  const gap = Number((playerBest - target.targetTime).toFixed(3));
  const span = target.startTime - target.targetTime;
  const share = span > 0 ? Math.min(1, Math.max(0, (target.startTime - playerBest) / span)) : playerBest <= target.targetTime ? 1 : 0;
  return { gap, progress: Number(share.toFixed(3)) };
}

/** Sessions shown in the gap trend. */
export const RIVAL_TREND_SESSIONS = 6;

/** The rival status the page shows, from the resolved target and the player's history here. */
export function describeRival(
  board: Leaderboard,
  active: RivalTarget | null,
  beaten: RivalTarget[],
  sessionBests: Array<{ sessionId: string; sessionName: string; timestamp: number; best: number }>
): RivalStatus {
  const player = board.player;
  if (!player || !active) {
    return { rival: active, rivalEntry: null, gap: null, progress: null, theoreticalGap: null, beaten, nextUp: [], trend: [] };
  }
  const { gap, progress } = rivalProgress(active, player.bestLap.lapTime);
  const rivalEntry = active.kind === 'driver' ? board.entries.find((e) => e.driverName === active.driverName) ?? null : null;
  return {
    rival: active,
    rivalEntry,
    gap,
    progress,
    theoreticalGap: player.theoreticalBest !== null ? Number((player.theoreticalBest - active.targetTime).toFixed(3)) : null,
    beaten,
    nextUp: nextRungs(board, active.targetTime),
    trend: sessionBests.slice(-RIVAL_TREND_SESSIONS).map((s) => ({ ...s, gap: Number((s.best - active.targetTime).toFixed(3)) })),
  };
}

/** Up to `count` drivers just ahead of the target, nearest first: the next rungs of the ladder. */
export function nextRungs(board: Leaderboard, targetTime: number, count = 3): LeaderboardEntry[] {
  return board.entries
    .filter((e) => !e.isPlayer && e.bestLap.lapTime < targetTime)
    .slice(-count)
    .reverse();
}
