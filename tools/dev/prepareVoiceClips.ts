// Prepares race engineer clips (Kokoro George, 1.2x, pauses cut to 80 ms) for every demo radio call, whole and in
// the sentences they are joined from, into public/voice/george/ with a manifest. Run it with the game closed: synthesis is
// CPU heavy (~1.5 s a clip), so it never runs during a race. The q8 model comes from Hugging Face once, then the cache.
// Usage: npx tsx tools/dev/prepareVoiceClips.ts
import fs from 'node:fs';
import path from 'node:path';
import { KokoroTTS } from 'kokoro-js';
import { DEMO_RADIO_CALLS } from '../../src/components/live/demo/demoRadio.js';
import { callSentences, clipFile } from '../../src/components/live/voice/callPieces.js';
import { tightenPauses } from '../../src/components/live/voice/tightenPauses.js';

const VOICE = 'bm_george';
const SPEED = 1.2;
const PAUSE_MS = 80;
const OUT = path.resolve('public/voice/george');

/** Every demo call (the sampler's list); "Yellow, Turn 11. …" also plays from pieces made for the other calls. */
const CALLS = DEMO_RADIO_CALLS.flatMap(group => group.calls.map(call => call.text));

/** 16-bit mono PCM WAV. */
function wav(samples: Float32Array, sampleRate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, index) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), index * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const texts = [...new Set([...CALLS, ...CALLS.flatMap(callSentences)])];
fs.mkdirSync(OUT, { recursive: true });
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
const clips: Record<string, string> = {};
for (const text of texts) {
  const file = clipFile(text);
  // Made before with the same voice, pace and pauses: kept.
  if (fs.existsSync(path.join(OUT, file))) { clips[text] = file; continue; }
  const started = performance.now();
  // One clip at a time on purpose: the model already uses every core.
  const audio = await tts.generate(text, { voice: VOICE, speed: SPEED });
  const samples = tightenPauses(new Float32Array(audio.audio), audio.sampling_rate, PAUSE_MS);
  fs.writeFileSync(path.join(OUT, file), wav(samples, audio.sampling_rate));
  clips[text] = file;
  console.log(`${Math.round(performance.now() - started).toString().padStart(5)} ms  ${file}`);
}
// Clips no call uses any more go.
for (const file of fs.readdirSync(OUT)) if (file.endsWith('.wav') && !Object.values(clips).includes(file)) fs.rmSync(path.join(OUT, file));
fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify({ voice: VOICE, speed: SPEED, pauseMs: PAUSE_MS, clips }, null, 2)}\n`);
console.log(`${texts.length} clips in ${OUT}`);
