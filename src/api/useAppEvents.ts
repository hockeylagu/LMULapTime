import { useEffect, useRef } from 'react';
import { APP_EVENTS } from '../../shared/types/live.js';

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
    const source = new EventSource('/api/events');
    source.addEventListener(APP_EVENTS.scanStarted, () => latest.current.onScanStarted());
    source.addEventListener(APP_EVENTS.scanFinished, () => latest.current.onScanFinished());
    source.addEventListener(APP_EVENTS.gameStarted, () => latest.current.onGameStarted?.());
    source.addEventListener(APP_EVENTS.gameRunning, (event: MessageEvent) => latest.current.onGameRunning?.(readRunning(event.data)));
    return () => source.close();
  }, [enabled]);
}
