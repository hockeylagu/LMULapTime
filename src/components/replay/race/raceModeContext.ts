import { createContext, useEffect, useEffectEvent } from 'react';
import { replayShortcutBlocked } from '../../../utils/replayShortcuts.js';

/**
 * Opens the race mode of the inspector on a car (replay slot) and lap, `lapSec` seconds into it (the lap view's cursor), from the
 * lap view; null outside an inspector page.
 */
export const RaceModeContext = createContext<((slot: number | null, lapNumber: number | null, lapSec?: number | null) => void) | null>(null);

/**
 * Loads the race's 3D view code (lazy in `RaceReplayView`): the lap view in 3D asks ahead, so the race shows its scene at once
 * instead of a loading card while the code arrives.
 */
export const loadRace3DView = (): Promise<Race3DViewModule> => import('./Race3DView.js').then(module => (loadedRace3DView = module));
type Race3DViewModule = typeof import('./Race3DView.js');
/** The race's 3D view code once loaded: drawn directly, without the lazy view's one fallback render. */
export let loadedRace3DView: Race3DViewModule | null = null;

/** The key that switches between the lap view and the session replay, at the same moment. */
export const MODE_SWITCH_KEY = 'L';

/**
 * Runs `open` on `MODE_SWITCH_KEY` anywhere on the page (the other mode's button: Session in the lap view, Lap view in the race),
 * unless typing or a dialog holds the keys; null while that button is disabled.
 */
export function useModeSwitchKey(open: (() => void) | null): void {
  const run = useEffectEvent(() => open?.());
  const enabled = open !== null;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toUpperCase() !== MODE_SWITCH_KEY || event.repeat || event.shiftKey || replayShortcutBlocked(event)) return;
      event.preventDefault();
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
