import type { ReferenceLaptimeEntry } from '../types/index.js';
import type { Leaderboard, LeaderboardEntry } from '../types/leaderboard.js';
import { findMatchingTrackBenchmarkEntries } from './paceCategory.js';

/**
 * Leaderboards of the drivers met on a layout, one car class at a time.
 *
 * Only real people are ranked: the player's own laps from any session, and the other drivers of
 * online (Multiplayer) sessions. Offline sessions are raced against AI, whose laps never count.
 * Only representative laps count: valid flying laps at racing speed, not marked non-representative
 * by the parser (contact, traffic, off pace), and dry (no wet tyres or rain). Layouts of one facility are
 * never mixed: every session is keyed by its circuit specification's layoutKey.
 */

export interface LeaderboardQuery {
  layoutKey: string;
  carClass: string;
  /** Limits the board to one car (scope 'car'); the whole class otherwise. */
  carType?: string | null;
}

/** The player's line on a board, when the player has a representative lap there. */
export function playerEntry(board: Pick<Leaderboard, 'entries'>): LeaderboardEntry | null {
  return board.entries.find((entry) => entry.isPlayer) ?? null;
}

/** A multiplayer session: its mode says so, or it names the server it ran on. */
export const isOnlineSession = (session: { settings?: { modeSetting?: string; serverName?: string } }): boolean =>
  (session.settings?.modeSetting ?? '').trim().toLowerCase() === 'multiplayer' || Boolean(session.settings?.serverName);

/**
 * The community benchmark for a layout in one class. Unlike a track-only lookup it never falls
 * back to another class: a GT3 target on a Hypercar board would be meaningless.
 */
export function findLayoutBenchmark(
  entries: Record<string, ReferenceLaptimeEntry> | ReferenceLaptimeEntry[],
  layoutKey: string,
  carClass: string,
  findTrackEntries = (venue: string) => findMatchingTrackBenchmarkEntries(entries, venue)
): ReferenceLaptimeEntry | null {
  const onLayout = findTrackEntries(layoutKey);
  return onLayout.find((e) => e.carClass === carClass) ?? null;
}
