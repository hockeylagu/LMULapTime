import type { Leaderboard, LeaderboardLayout } from '../../shared/types/leaderboard.js';
import { fetchJson } from './apiClient.js';

export interface LeaderboardRequest {
  layoutKey: string;
  carClass: string;
  /** Limits the board to one car; the whole class otherwise. */
  carType?: string | null;
}

/** The layouts the player drove, newest first: the track ribbon. */
export function loadLeaderboardLayouts(signal?: AbortSignal): Promise<LeaderboardLayout[]> {
  return fetchJson<LeaderboardLayout[]>('/api/leaderboard/layouts', { signal });
}

export function loadLeaderboard(request: LeaderboardRequest, signal?: AbortSignal): Promise<Leaderboard> {
  const query = new URLSearchParams({ layout: request.layoutKey, carClass: request.carClass });
  if (request.carType) query.set('carType', request.carType);
  return fetchJson<Leaderboard>(`/api/leaderboard?${query.toString()}`, { signal });
}
