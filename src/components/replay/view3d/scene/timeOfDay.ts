import { useSyncExternalStore } from 'react';
import type { ReplayDaylightClock } from '../../../../../shared/types/replay.js';

/**
 * The 3D scene's time of day, the viewer's choice, the same in every view and remembered: the session's own (`session`, a night race
 * at night) or a fixed midday (`daylight`, easier to see). The daylight keeps the session's weather and clouds; only the clock moves.
 */
export type SceneTimeOfDay = 'session' | 'daylight';

/** The fixed daylight: midday, minutes past local midnight. */
export const DAYLIGHT_MINUTE = 12 * 60;

const STORAGE_KEY = 'lmu-scene-time-of-day-v1';
const listeners = new Set<() => void>();
let current: SceneTimeOfDay = (() => {
  try { return localStorage.getItem(STORAGE_KEY) === 'daylight' ? 'daylight' : 'session'; } catch { return 'session'; }
})();

export function sceneTimeOfDay(): SceneTimeOfDay { return current; }

export function setSceneTimeOfDay(next: SceneTimeOfDay): void {
  if (next === current) return;
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Storage may be disabled. */ }
  listeners.forEach(listener => listener());
}

/** Calls `listener` when the choice changes; returns the unsubscribe. */
export function onSceneTimeOfDay(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The clock the scene is lit by: the session's, or midday at the session's start under `daylight`. Without a clock, the session default. */
export function shownDaylight(clock: ReplayDaylightClock | undefined): ReplayDaylightClock | undefined {
  return clock && current === 'daylight' ? {...clock, startMinute: DAYLIGHT_MINUTE, sessionTimeSec: 0} : clock;
}

export function useSceneTimeOfDay(): SceneTimeOfDay {
  return useSyncExternalStore(onSceneTimeOfDay, sceneTimeOfDay);
}
