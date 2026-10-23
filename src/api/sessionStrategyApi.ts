import { fetchJson } from './apiClient.js';
import type { SessionStrategy } from '../../shared/types/index.js';
import type { LiveRaceStrategies } from '../../shared/types/liveStrategy.js';

export interface SessionStrategyResult {
  strategy: SessionStrategy;
  /** The plan the live dashboard showed before the start; null when the race was not recorded live. */
  plan: LiveRaceStrategies | null;
}

/** What the session measured for the strategy, from the player's native telemetry, and its plan; null without telemetry. */
export async function fetchSessionStrategy(sessionId: string, signal?: AbortSignal): Promise<SessionStrategyResult | null> {
  const response = await fetchJson<{ strategy: SessionStrategy | null; plan?: LiveRaceStrategies | null }>(
    `/api/session/${encodeURIComponent(sessionId)}/strategy`, { signal });
  return response.strategy ? { strategy: response.strategy, plan: response.plan ?? null } : null;
}
