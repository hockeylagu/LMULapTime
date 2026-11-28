import { useSyncExternalStore } from 'react';

/**
 * The lap distance (m) the pointer is over on the track, the 2D map's line or a 3D trace curtain (null: none). The strip charts draw a
 * hover line there; the car and the lap cursor stay where they are (driver, 2026-11-28). One way: hovering a chart sets nothing.
 */
let hovered: number | null = null;
const listeners = new Set<() => void>();

export function setTrackHover(distanceM: number | null): void {
  if (distanceM === hovered) return;
  hovered = distanceM;
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useTrackHover(): number | null {
  return useSyncExternalStore(subscribe, () => hovered);
}
