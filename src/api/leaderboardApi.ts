import type { Leaderboard, LeaderboardLayout, LeaderboardWithRival, RivalStatus } from '../../shared/types/leaderboard.js';
import { fetchJson, postJson } from './apiClient.js';

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

const boardBody = (request: LeaderboardRequest) => ({
  layout: request.layoutKey,
  carClass: request.carClass,
  ...(request.carType ? { carType: request.carType } : {}),
});

/** Load standings and the rival from one calculation of the selected board. */
export function loadLeaderboardWithRival(request: LeaderboardRequest, signal?: AbortSignal): Promise<LeaderboardWithRival> {
  const query = new URLSearchParams(boardBody(request));
  query.set('includeRival', 'true');
  return fetchJson<LeaderboardWithRival>(`/api/leaderboard?${query.toString()}`, { signal });
}

/** Makes a driver ahead the player's rival. */
export function pinRival(request: LeaderboardRequest, driverName: string): Promise<RivalStatus> {
  return postJson<RivalStatus>('/api/rivals/pin', { ...boardBody(request), driverName });
}

export function loadLeaderboard(request: LeaderboardRequest, signal?: AbortSignal): Promise<Leaderboard> {
  const query = new URLSearchParams({ layout: request.layoutKey, carClass: request.carClass });
  if (request.carType) query.set('carType', request.carType);
  return fetchJson<Leaderboard>(`/api/leaderboard?${query.toString()}`, { signal });
}
