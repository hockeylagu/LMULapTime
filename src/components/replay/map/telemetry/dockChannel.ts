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

/**
 * Whether the 3D view stands the channel as curtains in place of the racing line: the dock's 3D trace button, the Line menu and a
 * chart's title set it, remembered. Chart titles offer it only while a 3D view is open (`openTraceView`).
 */
const SHOWN_KEY = 'lmu-3d-trace-shown-v1';
let shown = (() => {
  try { return localStorage.getItem(SHOWN_KEY) === 'true'; } catch { return false; }
})();
let openViews = 0;

export function setTraceShown(next: boolean): void {
  shown = next;
  try { localStorage.setItem(SHOWN_KEY, String(next)); } catch { /* Storage may be disabled. */ }
  listeners.forEach(listener => listener());
}

export function useTraceShown(): boolean {
  return useSyncExternalStore(subscribe, () => shown);
}

/** A 3D view is open while the returned close has not run. */
export function openTraceView(): () => void {
  openViews++;
  listeners.forEach(listener => listener());
  return () => { openViews--; listeners.forEach(listener => listener()); };
}

export function useTraceViewOpen(): boolean {
  return useSyncExternalStore(subscribe, () => openViews > 0);
}

/** Stands a channel as the 3D trace, or turns the trace off when it is the one shown. */
export function toggleTraceChannel(channel: DockChannel): void {
  if (shown && chosen === channel) { setTraceShown(false); return; }
  setDockChannel(channel);
  setTraceShown(true);
}
