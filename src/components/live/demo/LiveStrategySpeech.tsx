import { useState } from 'react';
import type { LiveSnapshot } from '../../../../shared/types/live.js';
import type { LiveConnection } from '../../../api/liveStream.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import type { PedalBuffer } from '../pedalBuffer.js';
import type { LiveCall } from '../../../../shared/domain/live/radio/liveCalls.js';
import { radioVoiceSupported } from '../voice/browserVoice.js';
import { useStrategyRadio } from './useStrategyRadio.js';

/** The demo's voice controls: opt-in for each visit, with a button to read the current call again. */
export function LiveStrategySpeech({ snapshot, connection, buffer, plan = null, volume = 100 }: {
  snapshot: LiveSnapshot | null; connection: LiveConnection; buffer: PedalBuffer; plan?: LiveCall | null; volume?: number;
}) {
  const supported = radioVoiceSupported();
  const [enabled, setEnabled] = useState(false);
  const { call, error, speak, stop, mark } = useStrategyRadio({ snapshot, connection, buffer, plan, enabled, volume });

  const toggle = () => {
    if (enabled) { stop(); mark(null); setEnabled(false); return; }
    setEnabled(true);
    // Start from the user's click so the browser can authorize audio immediately.
    mark(call?.key ?? null);
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
