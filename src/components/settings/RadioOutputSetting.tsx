import { useEffect, useState } from 'react';
import { FOCUS_RING } from '../common/buttonStyles.js';
import { Select } from '../common/dropdown/Select.js';
import { audioOutputChoice, listAudioOutputs, revealAudioOutputNames, routeAudio, type AudioOutput } from '../live/voice/audioOutput.js';

const DEFAULT = 'default';
const BUTTON = `rounded border border-lmu-rule px-3 py-1 text-sm text-lmu-text-soft hover:bg-lmu-card disabled:cursor-not-allowed disabled:text-lmu-faint ${FOCUS_RING}`;

/** Two short beeps on the chosen output, so the driver hears where the radio will play. */
async function testOutput(id: string | null, volume: number): Promise<void> {
  const context = new AudioContext();
  await routeAudio(context, id);
  const gain = context.createGain();
  gain.gain.value = Math.min(1, volume / 100) * 0.3;
  gain.connect(context.destination);
  for (const [start, frequency] of [[0, 880], [0.18, 1320]] as const) {
    const tone = context.createOscillator();
    tone.frequency.value = frequency;
    tone.connect(gain);
    tone.start(context.currentTime + start);
    tone.stop(context.currentTime + start + 0.12);
  }
  setTimeout(() => void context.close(), 600);
}

/**
 * The radio's audio output: the Windows default or a chosen device (headset, speakers). The browser shows device
 * names only after a one-time microphone permission; nothing is recorded.
 */
export function RadioOutputSetting({ value, volume, disabled, onChange }: {
  value: string | null; volume: number; disabled: boolean; onChange: (id: string | null) => void;
}) {
  const [outputs, setOutputs] = useState<AudioOutput[]>([]);
  const [named, setNamed] = useState(true);
  const [refused, setRefused] = useState(false);
  const supported = audioOutputChoice();

  useEffect(() => {
    if (!supported) return;
    const read = () => void listAudioOutputs().then((next) => {
      setOutputs(next);
      setNamed(next.length > 0 && next.every(output => !/^Output \d+$/.test(output.label)));
    }).catch(() => setOutputs([]));
    read();
    navigator.mediaDevices?.addEventListener?.('devicechange', read);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', read);
  }, [supported]);

  if (!supported) return <p className="text-xs text-lmu-muted">This browser plays the radio on the Windows default output only.</p>;
  const options = [{ value: DEFAULT, label: 'Windows default' }, ...outputs.map(output => ({ value: output.id, label: output.label }))];
  if (value && !outputs.some(output => output.id === value)) options.push({ value, label: 'Chosen device (not connected)' });
  const reveal = () => void revealAudioOutputNames().then(() => listAudioOutputs())
    .then((next) => { setOutputs(next); setNamed(true); setRefused(false); }).catch(() => setRefused(true));
  return <div className="flex flex-wrap items-center gap-3 text-sm text-lmu-text">
    <label htmlFor="live-voice-output">Radio output</label>
    <Select id="live-voice-output" value={value ?? DEFAULT} onChange={id => onChange(id === DEFAULT ? null : id)}
      options={options} disabled={disabled} size="compact" className="w-72" />
    <button type="button" className={BUTTON} disabled={disabled} onClick={() => void testOutput(value, volume)}>Test output</button>
    {!named && <button type="button" className={BUTTON} onClick={reveal}>Show device names</button>}
    {refused && <p className="w-full text-xs text-lmu-muted">The browser refused the microphone, so it hides the devices. Allow it from the address bar and try again.</p>}
  </div>;
}
