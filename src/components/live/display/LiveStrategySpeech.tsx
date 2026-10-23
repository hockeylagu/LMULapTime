import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { LiveSnapshot } from '../../../../shared/types/live.js';
import type { LiveConnection } from '../../../api/liveStream.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import type { PedalBuffer } from '../pedalBuffer.js';
import { strategySpeech, type StrategyCall } from './strategySpeech.js';

/**
 * Browser TTS proof of concept. Deliberately opt-in for each dashboard visit. Urgent calls (box now, puncture) speak
 * at once; the others wait for a straight (1 s flat out), like an engineer who keeps quiet in the braking zones.
 * `plan` is a plan change from the strategy engine; an urgent snapshot call still goes first.
 */
export function LiveStrategySpeech({ snapshot, connection, buffer, plan = null }: {
  snapshot: LiveSnapshot | null; connection: LiveConnection; buffer: PedalBuffer; plan?: StrategyCall | null;
}) {
  const supported = typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function';
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState(false);
  const lastKey = useRef<string | null>(null);
  const announced = useRef(new Map<string, number>());
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  const live = strategySpeech(snapshot, connection);
  const call = live?.urgent ? live : plan ?? live;
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
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = 1;
    utterance.onerror = () => {
      if (current.current !== utterance) return;
      current.current = null;
      setError(true);
    };
    utterance.onend = () => { if (current.current === utterance) current.current = null; };
    current.current = utterance;
    try { window.speechSynthesis.speak(utterance); }
    catch { current.current = null; setError(true); }
  }, [stop]);

  useEffect(() => {
    if (!enabled || !call) { stop(); return; }
    if (lastKey.current === call.key || (!call.urgent && !straight)) return;
    lastKey.current = call.key;
    // A fluctuating estimate must not alternate between the same two radio calls.
    const now = Date.now();
    const previous = announced.current.get(call.key);
    if (previous !== undefined && now - previous < 60_000) return;
    for (const [key, at] of announced.current) if (now - at >= 60_000) announced.current.delete(key);
    announced.current.set(call.key, now);
    speak(call.text);
  }, [enabled, call, straight, speak, stop]);
  useEffect(() => stop, [stop]);

  const toggle = () => {
    if (enabled) { stop(); lastKey.current = null; setEnabled(false); return; }
    setEnabled(true);
    // Start from the user's click so the browser can authorize audio immediately.
    lastKey.current = call?.key ?? null;
    if (call) announced.current.set(call.key, Date.now());
    speak(call?.text ?? 'Radio on.');
  };
  const button = `rounded border border-lmu-rule px-4 py-1 text-lmu-text-soft hover:bg-lmu-card ${FOCUS_RING}`;
  return <div aria-label="Strategy voice" className="flex h-12 shrink-0 items-center justify-end gap-5 text-[24px]">
    <span aria-live="polite" className={error ? 'text-lmu-warn' : 'text-lmu-muted'}>
      {!supported ? 'Strategy voice unavailable in this browser' : error ? 'Voice failed. Try Read strategy.' : 'Strategy voice · browser default'}
    </span>
    <button type="button" className={`${button} disabled:cursor-not-allowed disabled:text-lmu-faint`} disabled={!supported} aria-pressed={enabled} onClick={toggle}>
      {enabled ? 'Mute strategy voice' : 'Enable strategy voice'}
    </button>
    <button type="button" className={`${button} disabled:cursor-not-allowed disabled:text-lmu-faint`} disabled={!supported || !enabled || !call} onClick={() => { if (call) speak(call.text); }}>Read strategy</button>
  </div>;
}
