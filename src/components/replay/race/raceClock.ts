/** Playback speeds of the race replay, real time first. */
export const RACE_SPEEDS = [1, 2, 4, 8, 16] as const;

export interface RaceClockState {
  /** Replay clock, seconds. */
  timeSec: number;
  playing: boolean;
  speed: number;
}

/**
 * The race replay's session clock: one time for every car. An external store, so the map can
 * follow it every frame while slower readers (standings, the playback bar) subscribe to coarser values.
 */
export function createRaceClock(startSec: number, endSec: number, initialSec = startSec) {
  const clamp = (t: number) => Math.max(startSec, Math.min(endSec, t));
  let state: RaceClockState = { timeSec: clamp(initialSec), playing: false, speed: 1 };
  const listeners = new Set<() => void>();
  let frame: number | null = null;
  let lastFrameTime: number | null = null;

  const publish = (next: Partial<RaceClockState>) => {
    state = { ...state, ...next };
    listeners.forEach(listener => listener());
  };
  const stopLoop = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastFrameTime = null;
  };
  const step = (frameTime: number) => {
    const elapsed = lastFrameTime === null ? 0 : Math.min(0.25, (frameTime - lastFrameTime) / 1000);
    lastFrameTime = frameTime;
    const timeSec = clamp(state.timeSec + elapsed * state.speed);
    if (timeSec >= endSec) {
      stopLoop();
      publish({ timeSec, playing: false });
      return;
    }
    publish({ timeSec });
    frame = requestAnimationFrame(step);
  };

  return {
    startSec,
    endSec,
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    seek: (timeSec: number) => publish({ timeSec: clamp(timeSec) }),
    setSpeed: (speed: number) => publish({ speed }),
    setPlaying: (playing: boolean) => {
      if (playing === state.playing) return;
      stopLoop();
      const restart = playing && state.timeSec >= endSec;
      publish({ playing, ...(restart ? { timeSec: startSec } : {}) });
      if (playing) frame = requestAnimationFrame(step);
    },
    dispose: stopLoop,
  };
}

export type RaceClock = ReturnType<typeof createRaceClock>;
