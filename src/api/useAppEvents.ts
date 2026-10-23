import { useEffect, useEffectEvent } from 'react';
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

/** Validate the game status and the server's auto-open decision. */
function readGameStatus(data: unknown): { running: boolean; autoOpen: boolean } | null {
  try {
    const parsed: unknown = typeof data === 'string' ? JSON.parse(data) : null;
    if (typeof parsed !== 'object' || parsed === null || !('running' in parsed) || typeof parsed.running !== 'boolean') return null;
    return { running: parsed.running, autoOpen: 'autoOpen' in parsed && parsed.autoOpen === true };
  } catch {
    return null;
  }
}

/**
 * Whether this page load has had its first game status. Auto-open answers only that one: the app is unmounted on the
 * live page, and coming back to it must not switch straight back to the dashboard.
 */
let pageLoadStatusSeen = false;

/** Listens to the app-wide server events (`GET /api/events`) while `enabled`; the browser reconnects by itself. */
export function useAppEvents(handlers: AppEventHandlers, enabled: boolean): void {
  const scanStarted = useEffectEvent(() => handlers.onScanStarted());
  const scanFinished = useEffectEvent(() => handlers.onScanFinished());
  const gameStarted = useEffectEvent(() => handlers.onGameStarted?.());
  const gameRunning = useEffectEvent((running: boolean) => handlers.onGameRunning?.(running));

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
      gameRunning(false);
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
      source.addEventListener(APP_EVENTS.scanStarted, () => { heard(); scanStarted(); });
      source.addEventListener(APP_EVENTS.scanFinished, () => { heard(); scanFinished(); });
      source.addEventListener(APP_EVENTS.gameStarted, () => { heard(); gameStarted(); });
      source.addEventListener(APP_EVENTS.gameRunning, (event: MessageEvent) => {
        heard();
        clearTimeout(stale);
        stale = undefined;
        const status = readGameStatus(event.data);
        if (!status) return;
        gameRunning(status.running);
        if (!pageLoadStatusSeen && status.running && status.autoOpen) gameStarted();
        pageLoadStatusSeen = true;
      });
      source.addEventListener('error', () => lost(APP_EVENT_ERROR_GRACE_MS));
    }
    connect();
    return () => { clearTimeout(silence); clearTimeout(retry); clearTimeout(stale); source.close(); };
  }, [enabled]);
}
