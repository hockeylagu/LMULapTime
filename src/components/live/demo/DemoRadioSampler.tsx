import { useEffect, useRef, useState } from 'react';
import { SECONDARY_BUTTON } from '../../common/buttonStyles.js';
import { Select } from '../../common/dropdown/Select.js';
import { RadioPlayer } from '../display/radioPlayer.js';
import { radioVoiceSupported } from '../display/useStrategyRadio.js';
import { ClipVoice } from '../voice/clipVoice.js';
import { KOKORO_VOICES, type KokoroVoiceId } from '../voice/kokoroMessages.js';
import { KokoroVoice, type KokoroStatus } from '../voice/kokoroVoice.js';
import { DEMO_RADIO_CALLS } from './demoRadio.js';

const ALL = DEMO_RADIO_CALLS.flatMap(group => group.calls);
const OPTIONS = DEMO_RADIO_CALLS.map(({ group, calls }) => ({
  group, options: calls.map(entry => ({ value: String(ALL.indexOf(entry)), label: `P${entry.priority} · ${entry.text}` })),
}));
const VOICE_OPTIONS = [{ value: 'browser', label: 'Browser voice' }, ...KOKORO_VOICES.map(voice => ({ value: voice.id, label: `Kokoro · ${voice.label}` })),
  { value: 'clips-sentence', label: 'George clips · by sentence' }, { value: 'clips-whole', label: 'George clips · whole' }];
/** Silence added where prepared pieces join, on top of the 20 ms each clip keeps at its ends. */
const GAP_OPTIONS = ['0', '40', '80', '120'].map(value => ({ value, label: `${value} ms` }));
const SPEED_OPTIONS = ['0.9', '1', '1.1', '1.2', '1.3', '1.4'].map(value => ({ value, label: `${value}×` }));
/** The longest pause kept inside a call: race radio is quick, no full-stop breath. */
const PAUSE_OPTIONS = [{ value: 'natural', label: 'Natural' }, ...['150', '80', '40'].map(value => ({ value, label: `${value} ms` }))];

function statusText(status: KokoroStatus, ms: number | null): string {
  if (status.state === 'loading') return `Loading voice ${status.percent}%`;
  if (status.state === 'error') return `Voice failed: ${status.message}`;
  return ms === null ? '' : `${Math.round(ms)} ms to speak`;
}

/**
 * Plays example radio calls at the Settings volume, to judge voice and wording: the browser voice through the
 * dashboard's own player, a Kokoro neural voice (downloaded once on first use), or George's prepared clips, whole or
 * joined by sentence (`tools/dev/prepareVoiceClips.ts`).
 */
export function DemoRadioSampler({ volume, output = null }: { volume: number; output?: string | null }) {
  const [player] = useState(() => new RadioPlayer(() => {}));
  const [status, setStatus] = useState<KokoroStatus>({ state: 'idle' });
  const [kokoro] = useState(() => new KokoroVoice(setStatus));
  const [clips] = useState(() => new ClipVoice());
  const [gap, setGap] = useState('40');
  const [clipNote, setClipNote] = useState('');
  const [selected, setSelected] = useState('0');
  const [voice, setVoice] = useState('browser');
  const [speed, setSpeed] = useState('1.2');
  const [pause, setPause] = useState('80');
  const [ms, setMs] = useState<number | null>(null);
  const run = useRef(0);
  const supported = radioVoiceSupported();
  useEffect(() => () => { player.stop(); kokoro.dispose(); }, [player, kokoro]);
  useEffect(() => { clips.setOutput(output); kokoro.setOutput(output); }, [clips, kokoro, output]);

  const stop = () => { run.current += 1; player.stop(); kokoro.stop(); clips.stop(); };
  // Each play starts from a click, so the browser lets it speak.
  const play = (indexes: number[]) => {
    stop();
    if (voice === 'browser') {
      player.configure(volume, true);
      for (const index of indexes) {
        const { text, priority } = ALL[index];
        player.play({ id: index, text, priority: indexes.length > 1 ? 3 : priority, expiresAt: Number.POSITIVE_INFINITY });
      }
      return;
    }
    const current = run.current;
    if (voice.startsWith('clips')) {
      let missing = 0;
      const clipFrom = (position: number): void => {
        if (run.current !== current) return;
        if (position >= indexes.length) { setClipNote(missing ? `No clips for ${missing} of ${indexes.length} calls` : ''); return; }
        clips.say(ALL[indexes[position]].text, voice === 'clips-whole', Number(gap), volume)
          .then((heard) => { if (!heard) missing += 1; clipFrom(position + 1); }, () => setClipNote('Clips failed to play'));
      };
      setClipNote('');
      clipFrom(0);
      return;
    }
    // One after another: the next call is synthesized once the one before has been heard.
    const sayFrom = (position: number): void => {
      if (position >= indexes.length || run.current !== current) return;
      kokoro.say(ALL[indexes[position]].text, voice as KokoroVoiceId, Number(speed), volume, pause === 'natural' ? null : Number(pause))
        .then((ms) => { setMs(ms); return kokoro.ended(); })
        .then(() => sayFrom(position + 1), () => { /* The status line shows the failure. */ });
    };
    sayFrom(0);
  };
  return <>
    <label htmlFor="demo-radio">Radio call</label>
    <Select id="demo-radio" value={selected} onChange={setSelected} options={OPTIONS} size="compact" className="w-96" />
    <label htmlFor="demo-voice">Voice</label>
    <Select id="demo-voice" value={voice} onChange={setVoice} options={VOICE_OPTIONS} size="compact" className="w-44" />
    {voice === 'clips-sentence' && <>
      <label htmlFor="demo-gap">Join gap</label>
      <Select id="demo-gap" value={gap} onChange={setGap} options={GAP_OPTIONS} size="compact" className="w-24" />
    </>}
    {KOKORO_VOICES.some(entry => entry.id === voice) && <>
      <label htmlFor="demo-speed">Speed</label>
      <Select id="demo-speed" value={speed} onChange={setSpeed} options={SPEED_OPTIONS} size="compact" className="w-24" />
      <label htmlFor="demo-pause">Pauses</label>
      <Select id="demo-pause" value={pause} onChange={setPause} options={PAUSE_OPTIONS} size="compact" className="w-28" />
    </>}
    <button type="button" className={SECONDARY_BUTTON} disabled={voice === 'browser' && !supported} onClick={() => play([Number(selected)])}>Play</button>
    <button type="button" className={SECONDARY_BUTTON} disabled={voice === 'browser' && !supported} onClick={() => play(ALL.map((_, index) => index))}>Play all</button>
    <button type="button" className={SECONDARY_BUTTON} onClick={stop}>Stop</button>
    {voice !== 'browser' && <span role="status" className="font-mono text-lmu-text-soft">{voice.startsWith('clips') ? clipNote : statusText(status, ms)}</span>}
  </>;
}
