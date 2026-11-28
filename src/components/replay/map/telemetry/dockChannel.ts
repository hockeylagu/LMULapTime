import { useSyncExternalStore } from 'react';
import { AVAILABLE_TELEMETRY_CHANNELS, type TelemetryChannelId } from '../../telemetry/presets/telemetryPresets.js';

/** The fullscreen dock's trace: a chart channel, or throttle and brake together. */
export type DockChannel = TelemetryChannelId | 'pedals';

/**
 * The dock's channel, remembered (storage may be unavailable) and shared: the 2D and 3D docks show the same trace, and the 3D view's
 * curtain stands the one picked here (`Replay3DView.tsx`).
 */
const STORAGE_KEY = 'lmu-map-trace-channel-v1';
const listeners = new Set<() => void>();
let chosen: DockChannel = (() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'pedals' || AVAILABLE_TELEMETRY_CHANNELS.some(channel => channel.id === saved)) return saved as DockChannel;
  } catch { /* Storage may be disabled. */ }
  return 'speed';
})();

export function setDockChannel(next: DockChannel): void {
  chosen = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Storage may be disabled. */ }
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useDockChannel(): DockChannel {
  return useSyncExternalStore(subscribe, () => chosen);
}

/** The channel the dock shows: delta needs a comparison lap, so speed shows without one (the pick stays for the next compare). */
export const shownDockChannel = (channel: DockChannel, hasBaseline: boolean): DockChannel => (channel === 'delta' && !hasBaseline ? 'speed' : channel);
