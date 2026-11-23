/// <reference lib="webworker" />
// Kokoro neural voice in a worker, on the CPU (WASM): the GPU stays the game's. The runtime is served by the app; the
// model (onnx-community/Kokoro-82M-v1.0-ONNX, q8) and the voices come from Hugging Face once, then the browser cache.
import { env, KokoroTTS } from 'kokoro-js';
import wasm from '../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import mjs from '../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import type { KokoroRequest, KokoroResponse } from './kokoroMessages.js';
import { tightenPauses } from './tightenPauses.js';

env.wasmPaths = { wasm, mjs };
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

let model: Promise<KokoroTTS> | null = null;
/** Calls said before, by voice, pace, pauses and text: a repeated call plays without synthesis. */
const said = new Map<string, { samples: Float32Array<ArrayBuffer>; sampleRate: number }>();
const SAID_MAX = 200;
const reply = (message: KokoroResponse, transfer: Transferable[] = []) => self.postMessage(message, transfer);

function load(): Promise<KokoroTTS> {
  model ??= KokoroTTS.from_pretrained(MODEL, {
    dtype: 'q8', device: 'wasm',
    progress_callback: (progress) => {
      if (progress.status === 'progress') reply({ type: 'progress', file: progress.file, percent: progress.progress });
    },
  });
  return model;
}

self.onmessage = (event: MessageEvent<KokoroRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      const tts = await load();
      if (request.type === 'load') { reply({ type: 'ready' }); return; }
      const started = performance.now();
      const key = [request.voice, request.speed, request.pauseMs, request.text].join('|');
      let clip = said.get(key);
      if (!clip) {
        const audio = await tts.generate(request.text, { voice: request.voice, speed: request.speed });
        const raw = new Float32Array(audio.audio);
        clip = { samples: request.pauseMs === null ? raw : tightenPauses(raw, audio.sampling_rate, request.pauseMs), sampleRate: audio.sampling_rate };
        if (said.size >= SAID_MAX) said.delete(said.keys().next().value!);
        said.set(key, clip);
      }
      const samples = clip.samples.slice();
      reply({ type: 'audio', id: request.id, samples, sampleRate: clip.sampleRate, ms: performance.now() - started }, [samples.buffer]);
    } catch (error) {
      model = null;
      reply({ type: 'error', id: request.type === 'say' ? request.id : null, message: error instanceof Error ? error.message : String(error) });
    }
  })();
};
