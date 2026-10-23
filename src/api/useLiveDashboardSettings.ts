import { useEffect, useRef, useState } from 'react';
import { DEFAULT_LIVE_SETTINGS, PEDAL_TRACE_SECONDS_CHOICES, RESERVE_SECONDS_CHOICES } from '../../shared/types/live.js';
import { fetchLiveSettings } from './liveStream.js';

/** Shared presentation preferences; the demo remains usable with defaults when the server is offline. */
export function useLiveDashboardSettings(enabled = true) {
  const [settings, setSettings] = useState(DEFAULT_LIVE_SETTINGS);
  const latest = useRef(settings);
  useEffect(() => {
    if (!enabled) return;
    let request: AbortController | null = null;
    const read = () => {
      request?.abort();
      const current = new AbortController();
      request = current;
      void fetchLiveSettings(current.signal).then(next => {
        if (current.signal.aborted) return;
        const pedalTraceSeconds = (PEDAL_TRACE_SECONDS_CHOICES as readonly number[]).includes(next.pedalTraceSeconds) ? next.pedalTraceSeconds : DEFAULT_LIVE_SETTINGS.pedalTraceSeconds;
        const reserveSeconds = (RESERVE_SECONDS_CHOICES as readonly number[]).includes(next.reserveSeconds) ? next.reserveSeconds : DEFAULT_LIVE_SETTINGS.reserveSeconds;
        if (latest.current.pedalTraceSeconds === pedalTraceSeconds && latest.current.reserveSeconds === reserveSeconds) return;
        latest.current = { ...latest.current, pedalTraceSeconds, reserveSeconds };
        setSettings(latest.current);
      }).catch(() => { /* Keep the last known preferences, or defaults while offline. */ });
    };
    read();
    window.addEventListener('focus', read);
    return () => { request?.abort(); window.removeEventListener('focus', read); };
  }, [enabled]);
  return settings;
}
