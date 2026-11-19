import { useSyncExternalStore } from 'react';
import type { CornerSegmentKind } from '../../../../shared/types/corners/cornerPasses.js';

const STORAGE_KEY = 'lmu-consistency-segments-v1';
const listeners = new Set<() => void>();
let segments: CornerSegmentKind = (() => {
  try { return localStorage.getItem(STORAGE_KEY) === 'turns' ? 'turns' : 'sequences'; } catch { return 'sequences'; }
})();

/** Shows the Consistency panel's corners as the class's sequences or the official turns; remembered (storage may be unavailable). */
export function setConsistencySegments(value: CornerSegmentKind): void {
  segments = value;
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Storage may be disabled. */ }
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** What the Consistency panel's corners are: the class's sequences (the default) or the official turns. */
export function useConsistencySegments(): CornerSegmentKind {
  return useSyncExternalStore(subscribe, () => segments);
}
