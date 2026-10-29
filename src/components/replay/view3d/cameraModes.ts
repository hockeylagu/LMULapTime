import { useEffect, useEffectEvent } from 'react';
import { replayShortcutBlocked } from '../../../utils/replayShortcuts.js';

export type CameraMode = 'follow' | 'chase' | 'orbit' | 'trackside' | 'top';
export const CAMERA_MODES: ReadonlyArray<{value: CameraMode; label: string; shortcut: string}> = [
  {value: 'follow', label: 'Follow', shortcut: '1'}, {value: 'chase', label: 'Chase', shortcut: '2'},
  {value: 'orbit', label: 'Orbit', shortcut: '3'}, {value: 'trackside', label: 'Trackside', shortcut: '4'},
  {value: 'top', label: 'Overhead', shortcut: '5'},
];

/** Mode keys belong to the active 3D map, with the same typing/dialog guards as replay keys. */
export function useCameraModeShortcuts(map: React.RefObject<HTMLElement | null>, onMode: (mode: CameraMode) => void): void {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (event.repeat || replayShortcutBlocked(event)) return;
    const container = map.current, expanded = document.querySelector('[data-map-expanded]');
    if (!container || container.closest('[inert]') || expanded && expanded !== container) return;
    if (!(event.target instanceof Node && container.contains(event.target))) return;
    const mode = CAMERA_MODES.find(option => option.shortcut === event.key);
    if (mode) { event.preventDefault(); onMode(mode.value); }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handle(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
