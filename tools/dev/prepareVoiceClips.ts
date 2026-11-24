// Prepares race engineer clips (Kokoro George, 1.2x, pauses cut to 80 ms) into public/voice/george/ with a manifest:
// every sentence the race calls can say (`radioSentences`, the most useful first) and every demo radio call, whole and
// in its sentences. Run it with the game closed: synthesis is CPU heavy, so it never runs during a race. Clips already
// made are kept, so a run that was stopped goes on where it was. The q8 model comes from Hugging Face once, then the
// cache.
// Usage: npx tsx tools/dev/prepareVoiceClips.ts
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { KokoroTTS } from 'kokoro-js';
import { radioSentences } from '../../shared/domain/live/radio/radioSentences.js';
import { DEMO_RADIO_CALLS } from '../../src/components/live/demo/demoRadio.js';
import { callSentences, clipFile } from '../../src/components/live/voice/callPieces.js';
import { tightenPauses } from '../../src/components/live/voice/tightenPauses.js';

const VOICE = 'bm_george';
const SPEED = 1.2;
const PAUSE_MS = 80;
const OUT = path.resolve('public/voice/george');
/**
 * Processes synthesizing at once, each with its own model. One model keeps several cores busy, so on 16 cores 24 clips
 * took 72 s alone, 43 s in 2, 37 s in 4 and 37 s in 8. Worker threads crash onnxruntime-node, hence processes.
 */
const JOBS = 4;

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

const texts = [...new Set([...CALLS, ...CALLS.flatMap(callSentences), ...radioSentences()])];
// Two texts under one file name would play each other's clip.
const owners = new Map<string, string>();
for (const text of texts) {
  const owner = owners.get(clipFile(text));
  if (owner !== undefined) throw new Error(`"${owner}" and "${text}" share the file ${clipFile(text)}`);
  owners.set(clipFile(text), text);
}
fs.mkdirSync(OUT, { recursive: true });
const [mode, shard] = process.argv.slice(2);

if (mode === '--shard') {
  // One of the JOBS processes: makes every JOBS-th missing clip, read from stdin, and names each as it is written.
  const missing = (JSON.parse(fs.readFileSync(0, 'utf8')) as string[]).filter((_, index) => index % JOBS === Number(shard));
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  for (const text of missing) {
    const started = performance.now();
    const audio = await tts.generate(text, { voice: VOICE, speed: SPEED });
    const samples = tightenPauses(new Float32Array(audio.audio), audio.sampling_rate, PAUSE_MS);
    const file = path.join(OUT, clipFile(text));
    // Written aside then renamed: a stopped run never leaves half a clip that the next run would keep.
    fs.writeFileSync(`${file}.part`, wav(samples, audio.sampling_rate));
    fs.renameSync(`${file}.part`, file);
    console.log(`${Math.round(performance.now() - started).toString().padStart(5)} ms  ${clipFile(text)}`);
  }
} else {
  const made = () => Object.fromEntries(texts.filter(text => fs.existsSync(path.join(OUT, clipFile(text)))).map(text => [text, clipFile(text)]));
  const writeManifest = () => fs.writeFileSync(path.join(OUT, 'manifest.json'),
    `${JSON.stringify({ voice: VOICE, speed: SPEED, pauseMs: PAUSE_MS, clips: made() }, null, 2)}
`);
  // Made before with the same voice, pace and pauses: kept.
  const missing = texts.filter(text => !fs.existsSync(path.join(OUT, clipFile(text))));
  let count = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, missing.length) }, (_, index) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, process.argv[1], '--shard', String(index)], { stdio: ['pipe', 'pipe', 'inherit'] });
    child.stdin.end(JSON.stringify(missing));
    createInterface({ input: child.stdout }).on('line', (line) => {
      count += 1;
      // A stopped run leaves a manifest of what it made.
      if (count % 25 === 0) writeManifest();
      console.log(`${line}  (${count}/${missing.length})`);
    });
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`clip process ${index} stopped with ${code}`))));
  })));
  // Clips no call uses any more go, and any half-written clip.
  const used = new Set(texts.map(clipFile));
  for (const file of fs.readdirSync(OUT)) if (file.endsWith('.part') || (file.endsWith('.wav') && !used.has(file))) fs.rmSync(path.join(OUT, file));
  writeManifest();
  console.log(`${texts.length} clips in ${OUT}`);
}
