import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { playbackSampleFraction, type PlaybackClock } from './replayPlaybackClock.js';

interface PlaybackPosition extends PlaybackClock {
  points: ReplayTrajectoryPoint[];
  fraction: number;
}

/** Frame updates go only to moving visuals; the inspector still reads real samples. */
export function createPlaybackCursor() {
  let position: PlaybackPosition | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => position,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish: (points: ReplayTrajectoryPoint[], clock: PlaybackClock) => {
      position = { ...clock, points, fraction: playbackSampleFraction(points, clock) };
      listeners.forEach(listener => listener());
    },
    clear: () => {
      if (!position) return;
      position = null;
      listeners.forEach(listener => listener());
    },
  };
}

type PlaybackCursor = ReturnType<typeof createPlaybackCursor>;
export const ReplayPlaybackCursorContext = createContext<PlaybackCursor | null>(null);
const emptySnapshot = () => null;
const emptySubscribe = () => () => {};

export function usePlaybackPosition(points: ReplayTrajectoryPoint[], currentIndex: number) {
  const cursor = useContext(ReplayPlaybackCursorContext);
  const position = useSyncExternalStore(cursor?.subscribe ?? emptySubscribe, cursor?.getSnapshot ?? emptySnapshot, emptySnapshot);
  return position?.points === points && position.index === currentIndex ? position : null;
}
