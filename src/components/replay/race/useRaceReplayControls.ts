import { useEffect, useEffectEvent } from 'react';
import { replayShortcutBlocked } from '../../../utils/replayShortcuts.js';
import type { RaceClock } from './raceClock.js';

/** Seconds an arrow key moves the clock; Shift moves it further. */
const SEEK_SEC = 5;
const SEEK_FAR_SEC = 30;

/** Space plays or pauses the race replay; Left and Right step the clock back and forward. */
export function useRaceReplayKeys(clock: RaceClock): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (replayShortcutBlocked(event)) return;
      if (event.key === ' ' && !event.repeat) {
        event.preventDefault();
        clock.setPlaying(!clock.getState().playing);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const step = (event.shiftKey ? SEEK_FAR_SEC : SEEK_SEC) * (event.key === 'ArrowLeft' ? -1 : 1);
        clock.seek(clock.getState().timeSec + step);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clock]);
}

/** Wait after the last move before writing the URL, so scrubbing does not rewrite history on every step. */
const URL_DELAY_MS = 400;

/** Keeps the clock (whole tenths) and the followed car in the URL while paused. */
export function useRaceUrlSync(clock: RaceClock, followSlot: number | null, onStateChange: (timeSec: number, slot: number | null) => void): void {
  const write = useEffectEvent(() => {
    const { timeSec } = clock.getState();
    onStateChange(Math.round(timeSec * 10) / 10, followSlot);
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = clock.getState().playing ? null : setTimeout(write, URL_DELAY_MS);
    };
    schedule();
    const unsubscribe = clock.subscribe(schedule);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [clock, followSlot]);
}
