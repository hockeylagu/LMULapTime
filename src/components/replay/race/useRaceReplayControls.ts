import { useEffect, useEffectEvent } from 'react';
import { replayShortcutBlocked } from '../../../utils/replayShortcuts.js';
import { RACE_SPEEDS, type RaceClock } from './raceClock.js';

/** Seconds an arrow key moves the clock; Shift moves it further. */
const SEEK_SEC = 5;
const SEEK_FAR_SEC = 30;

/** Space plays or pauses the race replay; Left and Right step the clock, Home and End jump to its ends, comma and period change the speed. */
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
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        clock.seek(event.key === 'Home' ? clock.startSec : clock.endSec);
      } else if (event.key === ',' || event.key === '.') {
        event.preventDefault();
        const at = RACE_SPEEDS.indexOf(clock.getState().speed as typeof RACE_SPEEDS[number]);
        const next = RACE_SPEEDS[Math.max(0, Math.min(RACE_SPEEDS.length - 1, at + (event.key === ',' ? -1 : 1)))];
        clock.setSpeed(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clock]);
}

/** The race map's camera, as useGpsMapPanZoom gives it. */
export interface RaceMapCamera {
  zoomIn: () => void;
  zoomOut: () => void;
  resetPanZoom: () => void;
  centerOnCar: () => void;
  setFollowCar: (value: boolean | ((current: boolean) => boolean)) => void;
  panBy: (horizontal: number, vertical: number) => void;
}

const PAN_KEYS: Record<string, [number, number]> = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] };

/**
 * The lap map's keys on the race map or 3D camera, from anywhere on the race replay: + and − zoom, 0 or R shows the circuit (resets
 * the camera), C centres and F follows the followed car, W/A/S/D pan, E switches between the 2D map and the 3D view. The camera's own
 * C and F (map focused) and these act once: the first prevents the other. Off while `active` is false (a view kept loaded, hidden).
 */
export function useRaceMapKeys(camera: RaceMapCamera, onToggleView?: () => void, active = true): void {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (!active || replayShortcutBlocked(event)) return;
    const key = event.key.toLowerCase(), pan = PAN_KEYS[key];
    if (pan) camera.panBy(...pan);
    else if (key === '+' || key === '=') camera.zoomIn();
    else if (key === '-') camera.zoomOut();
    else if (key === '0' || key === 'r') camera.resetPanZoom();
    else if (key === 'c' && !event.repeat) camera.centerOnCar();
    else if (key === 'f' && !event.repeat) camera.setFollowCar(value => !value);
    else if (key === 'e' && !event.repeat && onToggleView) onToggleView();
    else return;
    event.preventDefault();
  });
  useEffect(() => {
    const handle = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
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
