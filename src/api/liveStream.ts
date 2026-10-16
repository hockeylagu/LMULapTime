import { useEffect, useRef, useState } from 'react';
import { LIVE_HEARTBEAT_MS, LIVE_STREAM_EVENTS } from '../../shared/types/live.js';
import type { LivePedalBatch, LiveSettings, LiveSnapshot } from '../../shared/types/live.js';
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
  const onPedals = useRef(options.onPedals);
  onPedals.current = options.onPedals;

  useEffect(() => {
    const source = new EventSource('/api/live/stream');
    let silence: ReturnType<typeof setTimeout> | undefined;
    const heard = () => {
      clearTimeout(silence);
      silence = setTimeout(() => setConnection('disconnected'), LIVE_SILENCE_MS);
    };
    heard();
    source.addEventListener(LIVE_STREAM_EVENTS.snapshot, (event) => {
      const next = parse<LiveSnapshot>(event);
      if (!next) return;
      heard();
      setSnapshot(next);
      setConnection('live');
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
      setConnection('disconnected');
    });
    return () => {
      clearTimeout(silence);
      source.close();
    };
  }, []);

  return { snapshot, connection };
}

export function fetchLiveSettings(signal?: AbortSignal): Promise<LiveSettings> {
  return fetchJson<LiveSettings>('/api/live/settings', { signal });
}

export function saveLiveSettings(settings: LiveSettings, signal?: AbortSignal): Promise<LiveSettings> {
  return postJson<LiveSettings>('/api/live/settings', settings, { signal });
}
