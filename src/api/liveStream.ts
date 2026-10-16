import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LIVE_HEARTBEAT_MS, LIVE_STREAM_EVENTS } from '../../shared/types/live.js';
import type { LivePedalBatch, LiveSettings, LiveSnapshot, LiveTiming } from '../../shared/types/live.js';
import { fetchJson, postJson } from './apiClient.js';

/** No message (heartbeats included) for this long means the connection is dead even if the browser has not noticed. */
export const LIVE_SILENCE_MS = LIVE_HEARTBEAT_MS * 2.5;

export type LiveConnection = 'connecting' | 'live' | 'disconnected';

export interface LiveStreamOptions {
  /**
   * Called for every pedal batch (20-30 a second). Deliberately not React state: the caller keeps the samples in a
   * buffer it draws from. Read through a ref, so a new function each render is fine.
   */
  onPedals?: (batch: LivePedalBatch) => void;
}

export interface LiveStreamState {
  /** The latest snapshot; null until the first one arrives. */
  snapshot: LiveSnapshot | null;
  connection: LiveConnection;
  /** The current-lap progress (about 5 Hz). A store, not state: only the parts that read it render again. */
  timing: LiveTimingStore;
}

/** Holds the latest `timing` event for `useLiveTiming`, so 5 Hz updates do not render the whole page. */
export class LiveTimingStore {
  private value: LiveTiming | null = null;
  private readonly listeners = new Set<() => void>();

  public get = (): LiveTiming | null => this.value;

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  public set(next: LiveTiming | null): void {
    if (next === this.value) return;
    this.value = next;
    this.listeners.forEach((listener) => listener());
  }
}

/** The latest timing, or null while off track or before the first event. Renders the caller on every update. */
export function useLiveTiming(store: LiveTimingStore): LiveTiming | null {
  return useSyncExternalStore(store.subscribe, store.get);
}

function parse<T>(event: Event): T | null {
  try { return JSON.parse((event as MessageEvent<string>).data) as T; } catch { return null; }
}

/**
 * Owns the one EventSource of the live page. The browser reconnects by itself; the server sends a snapshot on every
 * connect, which replaces the state. Closes on unmount.
 */
export function useLiveStream(options: LiveStreamOptions = {}): LiveStreamState {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [connection, setConnection] = useState<LiveConnection>('connecting');
  const [timing] = useState(() => new LiveTimingStore());
  const onPedals = useRef(options.onPedals);
  onPedals.current = options.onPedals;

  useEffect(() => {
    const source = new EventSource('/api/live/stream');
    let silence: ReturnType<typeof setTimeout> | undefined;
    const heard = () => {
      clearTimeout(silence);
      silence = setTimeout(() => { timing.set(null); setConnection('disconnected'); }, LIVE_SILENCE_MS);
    };
    heard();
    source.addEventListener(LIVE_STREAM_EVENTS.snapshot, (event) => {
      const next = parse<LiveSnapshot>(event);
      if (!next) return;
      heard();
      // Timing is only sent on track; whatever was left from before must not show on another screen.
      if (next.lifecycle !== 'driving') timing.set(null);
      setSnapshot(next);
      setConnection('live');
    });
    source.addEventListener(LIVE_STREAM_EVENTS.timing, (event) => {
      const next = parse<LiveTiming>(event);
      if (!next) return;
      heard();
      timing.set(next);
    });
    source.addEventListener(LIVE_STREAM_EVENTS.pedals, (event) => {
      const batch = parse<LivePedalBatch>(event);
      if (!batch) return;
      heard();
      onPedals.current?.(batch);
    });
    source.addEventListener(LIVE_STREAM_EVENTS.heartbeat, heard);
    source.addEventListener('error', () => {
      clearTimeout(silence);
      timing.set(null);
      setConnection('disconnected');
    });
    return () => {
      clearTimeout(silence);
      source.close();
    };
  }, [timing]);

  return { snapshot, connection, timing };
}

export function fetchLiveSettings(signal?: AbortSignal): Promise<LiveSettings> {
  return fetchJson<LiveSettings>('/api/live/settings', { signal });
}

export function saveLiveSettings(settings: Partial<LiveSettings>, signal?: AbortSignal): Promise<LiveSettings> {
  return postJson<LiveSettings>('/api/live/settings', settings, { signal });
}
