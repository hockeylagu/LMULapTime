import type { LiveForecast } from '../../types/liveStrategy.js';

/** One forecast node of the loaded session (`sessions/weather`): its place as a share of the session length. */
export interface LiveForecastNode {
  fraction: number;
  /** Percent. */
  rainChance: number;
}

/** Rain above this (0..1, `raining`) counts as wet now. */
const WET_NOW = 0.05;

export interface ForecastInput {
  nodes: readonly LiveForecastNode[];
  sessionSeconds: number;
  elapsedSeconds: number;
  raining: number;
  /** Lap time and position, for the lap the change lands on; null lap time gives no lap. */
  lapSeconds: number | null;
  lapNumber: number | null;
  lapFraction: number;
}

/**
 * The next change of the forecast within the session: rain arriving when dry now, or ending when wet now.
 * Rain is interpolated between nodes. It arrives early in its window: seen live 2026-10-16 rising from the start toward
 * the storm node, and on 2026-10-27 (offline practice, light rain) 59 s into a window ending at 451 s, where the halfway
 * point said 226 s. So rain is due from the node before the rain node (now, once that time has passed and it is still
 * dry). It ends near halfway toward the next dry node (2026-10-27: 20 s off), so the end stays placed halfway. The
 * chance is the forecast's: rain chance of the rain node, dry chance (100 - rain chance) of the dry one.
 * `none` when nothing changes before the end; null without nodes or a session length (the forecast is unknown).
 */
export function nextForecastChange(input: ForecastInput): LiveForecast | null {
  const { nodes, sessionSeconds, elapsedSeconds } = input;
  if (!(sessionSeconds > 0) || nodes.length === 0) return null;
  const sorted = [...nodes].sort((a, b) => a.fraction - b.fraction);
  const wet = input.raining > WET_NOW;
  for (let i = 1; i < sorted.length; i++) {
    const node = sorted[i];
    const changes = wet ? node.rainChance === 0 : node.rainChance > 0;
    if (!changes) continue;
    const due = wet ? (sorted[i - 1].fraction + node.fraction) / 2 : sorted[i - 1].fraction;
    if (wet ? due * sessionSeconds <= elapsedSeconds : node.fraction * sessionSeconds <= elapsedSeconds) continue;
    const atSeconds = Math.max(Math.round(due * sessionSeconds), Math.round(elapsedSeconds));
    const { lapSeconds, lapNumber } = input;
    const lap = lapSeconds !== null && lapSeconds > 0 && lapNumber !== null
      ? lapNumber + Math.floor(Math.min(Math.max(input.lapFraction, 0), 1) + (atSeconds - elapsedSeconds) / lapSeconds)
      : null;
    return { change: wet ? 'dry' : 'rain', chance: Math.round(wet ? 100 - node.rainChance : node.rainChance), atSeconds, lap };
  }
  return { change: 'none', chance: Math.round(sorted[sorted.length - 1].rainChance), atSeconds: sessionSeconds, lap: null };
}
