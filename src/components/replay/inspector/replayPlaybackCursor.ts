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
  let reactPosition: PlaybackPosition | null = null;
  const listeners = new Set<() => void>();
  const reactListeners = new Set<() => void>();
  return {
    getSnapshot: () => position,
    getReactSnapshot: () => reactPosition,
    subscribeReact: (listener: () => void) => {
      reactListeners.add(listener);
      return () => { reactListeners.delete(listener); };
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish: (points: ReplayTrajectoryPoint[], clock: PlaybackClock, updateReact = true) => {
      position = { ...clock, points, fraction: playbackSampleFraction(points, clock) };
      listeners.forEach(listener => listener());
      if (updateReact) {
        reactPosition = position;
        reactListeners.forEach(listener => listener());
      }
    },
    clear: () => {
      if (!position) return;
      position = null;
      reactPosition = null;
      listeners.forEach(listener => listener());
      reactListeners.forEach(listener => listener());
    },
  };
}

type PlaybackCursor = ReturnType<typeof createPlaybackCursor>;
export const ReplayPlaybackCursorContext = createContext<PlaybackCursor | null>(null);
const emptySnapshot = () => null;
const emptySubscribe = () => () => {};

export function usePlaybackPosition(points: ReplayTrajectoryPoint[], currentIndex?: number) {
  const cursor = useContext(ReplayPlaybackCursorContext);
  const position = useSyncExternalStore(cursor?.subscribeReact ?? emptySubscribe, cursor?.getReactSnapshot ?? emptySnapshot, emptySnapshot);
  if (!position || position.points !== points) return null;
  if (currentIndex !== undefined && position.index < currentIndex) return null;
  return position;
}

