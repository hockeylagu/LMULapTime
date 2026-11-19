import { useSyncExternalStore } from 'react';
import { useReplayKeys } from '../../../utils/replayShortcuts.js';

const STORAGE_KEY = 'lmu-corner-card-v1';
const listeners = new Set<() => void>();
let shown = (() => {
  try { return localStorage.getItem(STORAGE_KEY) !== 'false'; } catch { return true; }
})();

/** Shows or hides the corner card in every view at once; remembered (storage may be unavailable). */
export function toggleCornerCard(): void {
  shown = !shown;
  try { localStorage.setItem(STORAGE_KEY, String(shown)); } catch { /* Storage may be disabled. */ }
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const COMPARE_KEY = 'lmu-corner-card-compare-v1';
let compare = (() => {
  try { return localStorage.getItem(COMPARE_KEY) !== 'false'; } catch { return true; }
})();

/** Measures the lap view's card against the compare lap (true) or the car's usual; the same in every view, remembered. */
export function setCornerCardCompare(value: boolean): void {
  compare = value;
  try { localStorage.setItem(COMPARE_KEY, String(compare)); } catch { /* Storage may be disabled. */ }
  listeners.forEach(listener => listener());
}

/** Whether the lap view's card measures against the compare lap when there is one (the default). */
export function useCornerCardCompare(): boolean {
  return useSyncExternalStore(subscribe, () => compare);
}

/**
 * Whether the corner card shows: open until closed, closed until reopened, the same in every view. `keys`: this view
 * takes K (only the view shown, so a view kept loaded behind another does not toggle it twice).
 */
export function useCornerCardShown(keys: boolean): boolean {
  useReplayKeys({ k: { run: toggleCornerCard, noShift: true } }, 'page', keys);
  return useSyncExternalStore(subscribe, () => shown);
}
