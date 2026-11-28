import { useEffect, useEffectEvent } from 'react';
import { useReplayKeys } from '../../../utils/replayShortcuts.js';
import { RACE_SPEEDS, type RaceClock } from './raceClock.js';
import { heldKeyOf } from '../view3d/camera/heldKeys.js';
import { useHeldCameraKeys, type HeldKeyActions } from '../view3d/camera/useHeldCameraKeys.js';

/** Seconds an arrow key moves the clock; Shift moves it further, Ctrl less. */
const SEEK_SEC = 5;
const SEEK_FAR_SEC = 30;
const SEEK_NEAR_SEC = 1;

/** Space plays or pauses the race replay; Left and Right step the clock (Shift further, Ctrl less), Home and End jump to its ends, comma and period change the speed. */
export function useRaceReplayKeys(clock: RaceClock): void {
  const seek = (event: KeyboardEvent) => {
    const step = (event.ctrlKey ? SEEK_NEAR_SEC : event.shiftKey ? SEEK_FAR_SEC : SEEK_SEC) * (event.key === 'ArrowLeft' ? -1 : 1);
    clock.seek(clock.getState().timeSec + step);
  };
  const speed = (event: KeyboardEvent) => {
    const at = RACE_SPEEDS.indexOf(clock.getState().speed as typeof RACE_SPEEDS[number]);
    clock.setSpeed(RACE_SPEEDS[Math.max(0, Math.min(RACE_SPEEDS.length - 1, at + (event.key === ',' ? -1 : 1)))]);
  };
  useReplayKeys({
    ' ': () => clock.setPlaying(!clock.getState().playing),
    ArrowLeft: { run: seek, repeat: true, ctrl: true }, ArrowRight: { run: seek, repeat: true, ctrl: true },
    Home: { run: () => clock.seek(clock.startSec), repeat: true }, End: { run: () => clock.seek(clock.endSec), repeat: true },
    ',': { run: speed, repeat: true }, '.': { run: speed, repeat: true },
  }, 'page');
}

/** The race map's camera, as useGpsMapPanZoom gives it. */
export interface RaceMapCamera {
  zoomIn: () => void;
  zoomOut: () => void;
  resetPanZoom: () => void;
  centerOnCar: () => void;
  setFollowCar: (value: boolean | ((current: boolean) => boolean)) => void;
  panBy?: (horizontal: number, vertical: number) => void;
  /** 9, the 3D view: the whole circuit from the air at an angle. */
  overview?: () => void;
  /** The 3D view's held movement and zoom controls. */
  heldKeys?: HeldKeyActions;
}

const PAN_KEYS: Record<string, [number, number]> = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] };

/**
 * The lap map's keys on the race map or 3D camera, from anywhere on the race replay: + and − zoom, 0 shows the circuit (resets the
 * camera), C centres and F follows the followed car, W/A/S/D pan (3D: fly, with E/Q up/down and Shift faster), R switches between the 2D map and the
 * 3D view, 9 (3D) shows the whole circuit from the air. The camera's own
 * C and F (map focused) and these act once: the first prevents the other. Off while `active` is false (a view kept loaded, hidden).
 */
export function useRaceMapKeys(camera: RaceMapCamera, onToggleView?: () => void, active = true): void {
  const pan = camera.panBy;
  const reset = { run: () => camera.resetPanZoom(), repeat: true };
  const { heldKeys } = camera;
  useHeldCameraKeys(heldKeys, active);
  const hold = heldKeys && { run: (event: KeyboardEvent) => { const key = heldKeyOf(event.key); if (key) heldKeys.onHoldKey(key, true); } };
  const panKey = hold ?? (pan && { run: (event: KeyboardEvent) => pan(...PAN_KEYS[event.key.toLowerCase()]), repeat: true });
  const zoomIn = hold ?? { run: () => camera.zoomIn(), repeat: true }, zoomOut = hold ?? { run: () => camera.zoomOut(), repeat: true };
  useReplayKeys({
    w: panKey, a: panKey, s: panKey, d: panKey,
    ...(hold && { q: hold, e: hold, Shift: hold }),
    '+': zoomIn, '=': zoomIn, '-': zoomOut, '_': hold ? zoomOut : undefined, '0': reset,
    c: () => camera.centerOnCar(), f: () => camera.setFollowCar(value => !value),
    ...(onToggleView && { r: onToggleView }),
    ...(camera.overview && { '9': camera.overview }),
  }, 'page', active);
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
