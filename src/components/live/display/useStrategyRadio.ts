import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { LiveSnapshot } from '../../../../shared/types/live.js';
import type { LiveConnection } from '../../../api/liveStream.js';
import type { PedalBuffer } from '../pedalBuffer.js';
import { liveCalls, type LiveCall } from '../../../../shared/domain/live/radio/liveCalls.js';

/** A fluctuating estimate must not alternate between the same two radio calls. */
const REPEAT_GUARD_MS = 60_000;

export const radioVoiceSupported = (): boolean =>
  typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function';

/** Speaks one text in the browser's English voice at `volume` percent; null when the browser refused it. */
export function speakRadio(text: string, volume: number, onError?: () => void): SpeechSynthesisUtterance | null {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-GB';
  utterance.rate = 1;
  utterance.volume = Math.min(1, Math.max(0, volume / 100));
  if (onError) utterance.onerror = onError;
  try { window.speechSynthesis.speak(utterance); }
  catch { return null; }
  return utterance;
}

/**
 * The strategy calls as radio: urgent calls (box now, puncture) speak at once; the others wait for a straight
 * (1 s flat out), like an engineer who keeps quiet in the braking zones. `plan` is a plan change from the strategy
 * engine; an urgent snapshot call still goes first. Each call is said once while its key holds.
 */
export function useStrategyRadio({ snapshot, connection, buffer, plan = null, enabled, volume }: {
  snapshot: LiveSnapshot | null; connection: LiveConnection; buffer: PedalBuffer; plan?: LiveCall | null; enabled: boolean; volume: number;
}) {
  const [error, setError] = useState(false);
  const lastKey = useRef<string | null>(null);
  const announced = useRef(new Map<string, number>());
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const live = connection === 'live' ? liveCalls(snapshot)[0] ?? null : null;
  const call = live?.priority === 1 ? live : plan ?? live;
  // Pedals are watched only while the voice is on: muted, a pedal batch never renders the dashboard. Without pedal
  // data there is no way to tell a straight; speak rather than stay silent.
  const watch = useCallback((listener: () => void) => enabled ? buffer.subscribe(listener) : () => undefined, [enabled, buffer]);
  const straight = useSyncExternalStore(watch, () => !enabled || buffer.latest === null || buffer.flatOutFor(1));
  const stop = useCallback(() => {
    if (current.current) {
      current.current = null;
      window.speechSynthesis.cancel();
    }
  }, []);
  const speak = useCallback((text: string) => {
    stop();
    setError(false);
    const utterance = speakRadio(text, volume, () => {
      if (current.current !== utterance) return;
      current.current = null;
      setError(true);
    });
    current.current = utterance;
    if (!utterance) { setError(true); return; }
    utterance.onend = () => { if (current.current === utterance) current.current = null; };
  }, [stop, volume]);
  /** Marks a call as said now, so the same key stays quiet until it changes. */
  const mark = useCallback((key: string | null) => {
    lastKey.current = key;
    if (key) announced.current.set(key, Date.now());
  }, []);

  useEffect(() => {
    if (!enabled || !call) { stop(); return; }
    if (lastKey.current === call.key || (call.priority !== 1 && !straight)) return;
    lastKey.current = call.key;
    const now = Date.now();
    const previous = announced.current.get(call.key);
    if (previous !== undefined && now - previous < REPEAT_GUARD_MS) return;
    for (const [key, at] of announced.current) if (now - at >= REPEAT_GUARD_MS) announced.current.delete(key);
    announced.current.set(call.key, now);
    speak(call.text);
  }, [enabled, call, straight, speak, stop]);
  useEffect(() => stop, [stop]);

  return { call, error, speak, stop, mark };
}
