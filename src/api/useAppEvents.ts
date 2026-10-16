import { useEffect, useRef } from 'react';
import { APP_EVENTS } from '../../shared/types/live.js';

export interface AppEventHandlers {
  /** The server started a file scan by itself. */
  onScanStarted: () => void;
  /** Every step of a scan finished. */
  onScanFinished: () => void;
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
    return () => source.close();
  }, [enabled]);
}
