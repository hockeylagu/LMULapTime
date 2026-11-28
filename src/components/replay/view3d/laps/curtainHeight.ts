import { useSyncExternalStore } from 'react';
import { CURTAIN_HEIGHT_M } from './traceCurtain.js';

/** The trace curtains' full height (m) at their current step (`curtainStep`), for the legend: set by the curtain layer on a change. */
let height: number = CURTAIN_HEIGHT_M;
const listeners = new Set<() => void>();

export function setCurtainHeight(heightM: number): void {
  if (heightM === height) return;
  height = heightM;
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useCurtainHeight(): number {
  return useSyncExternalStore(subscribe, () => height);
}
