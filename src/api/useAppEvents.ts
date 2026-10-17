import { useEffect, useRef } from 'react';
import { APP_EVENTS, LIVE_HEARTBEAT_MS } from '../../shared/types/live.js';

/** Allow two missed heartbeats before discarding the last game status and reconnecting. */
export const APP_EVENT_SILENCE_MS = LIVE_HEARTBEAT_MS * 2.5;
const RETRY_MS = 2000;
/** After a stream error the last game status stands this long: the reconnect answers with it at once (no flicker). */
export const APP_EVENT_ERROR_GRACE_MS = RETRY_MS * 2;

export interface AppEventHandlers {
  /** The server started a file scan by itself. */
  onScanStarted: () => void;
  /** Every step of a scan finished. */
  onScanFinished: () => void;
  /** LMU started and the page should switch to the live dashboard (the server checked the setting). */
  onGameStarted?: () => void;
  /** Whether LMU is running: on connect, then whenever it starts or closes. */
  onGameRunning?: (running: boolean) => void;
}

/** The `running` flag of a `game-running` message; false for anything else. */
function readRunning(data: unknown): boolean {
  try {
    const parsed: unknown = typeof data === 'string' ? JSON.parse(data) : null;
    return typeof parsed === 'object' && parsed !== null && 'running' in parsed && parsed.running === true;
  } catch {
    return false;
  }
}

/** Listens to the app-wide server events (`GET /api/events`) while `enabled`; the browser reconnects by itself. */
export function useAppEvents(handlers: AppEventHandlers, enabled: boolean): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    let source: EventSource;
    let silence: ReturnType<typeof setTimeout>;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stale: ReturnType<typeof setTimeout> | undefined;
    const heard = () => {
      clearTimeout(silence);
      silence = setTimeout(() => lost(0), APP_EVENT_SILENCE_MS);
    };
    const clearGameRunning = () => {
      stale = undefined;
      latest.current.onGameRunning?.(false);
    };
    // Silence already waited 2.5 heartbeats: the status is stale now. An error keeps it until the reconnect can answer.
    function lost(graceMs: number): void {
      clearTimeout(silence);
      source.close();
      if (graceMs === 0) { clearTimeout(stale); clearGameRunning(); }
      else stale ??= setTimeout(clearGameRunning, graceMs);
      clearTimeout(retry);
      retry = setTimeout(connect, RETRY_MS);
    }
    function connect(): void {
      source = new EventSource('/api/events');
      heard();
      source.addEventListener(APP_EVENTS.heartbeat, heard);
      source.addEventListener(APP_EVENTS.scanStarted, () => { heard(); latest.current.onScanStarted(); });
      source.addEventListener(APP_EVENTS.scanFinished, () => { heard(); latest.current.onScanFinished(); });
      source.addEventListener(APP_EVENTS.gameStarted, () => { heard(); latest.current.onGameStarted?.(); });
      source.addEventListener(APP_EVENTS.gameRunning, (event: MessageEvent) => {
        heard();
        clearTimeout(stale);
        stale = undefined;
        latest.current.onGameRunning?.(readRunning(event.data));
      });
      source.addEventListener('error', () => lost(APP_EVENT_ERROR_GRACE_MS));
    }
    connect();
    return () => { clearTimeout(silence); clearTimeout(retry); clearTimeout(stale); source.close(); };
  }, [enabled]);
}
