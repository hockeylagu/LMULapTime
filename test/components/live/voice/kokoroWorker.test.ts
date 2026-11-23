import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KokoroRequest, KokoroResponse } from '../../../../src/components/live/voice/kokoroMessages.js';

const kokoro = vi.hoisted(() => {
  const env: { wasmPaths: { wasm?: string } } = { wasmPaths: {} };
  return { env, load: vi.fn(), generate: vi.fn() };
});
vi.mock('kokoro-js', () => ({ env: kokoro.env, KokoroTTS: { from_pretrained: kokoro.load } }));

const replies: KokoroResponse[] = [];
const scope = { onmessage: null as ((event: MessageEvent<KokoroRequest>) => void) | null, postMessage: (message: KokoroResponse) => replies.push(message) };
const send = async (request: KokoroRequest) => {
  scope.onmessage!({ data: request } as MessageEvent<KokoroRequest>);
  await vi.waitFor(() => expect(replies.length).toBeGreaterThan(0));
  return replies.splice(0);
};

describe('Kokoro worker', () => {
  beforeEach(async () => {
    vi.resetModules();
    replies.length = 0;
    vi.stubGlobal('self', scope);
    kokoro.load.mockImplementation((_model: string, options: { progress_callback: (progress: object) => void }) => {
      options.progress_callback({ status: 'progress', file: 'model.onnx', progress: 50 });
      options.progress_callback({ status: 'done', file: 'model.onnx' });
      return Promise.resolve({ generate: kokoro.generate });
    });
    await import('../../../../src/components/live/voice/kokoroWorker.js');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('serves the runtime from the app, loads the q8 model on the CPU and says a call', async () => {
    expect(kokoro.env.wasmPaths.wasm).toContain('ort-wasm-simd-threaded.jsep.wasm');
    expect(await send({ type: 'load' })).toEqual([{ type: 'progress', file: 'model.onnx', percent: 50 }, { type: 'ready' }]);
    expect(kokoro.load).toHaveBeenCalledWith('onnx-community/Kokoro-82M-v1.0-ONNX', expect.objectContaining({ dtype: 'q8', device: 'wasm' }));
    kokoro.generate.mockResolvedValue({ audio: new Float32Array([0.1, 0.2]), sampling_rate: 24_000 });
    const [audio] = await send({ type: 'say', id: 3, text: 'Box this lap.', voice: 'bm_george', speed: 1.1, pauseMs: 80 });
    expect(audio).toMatchObject({ type: 'audio', id: 3, sampleRate: 24_000 });
    expect(kokoro.generate).toHaveBeenCalledWith('Box this lap.', { voice: 'bm_george', speed: 1.1 });
  });

  it('reports a failure with the call it was for', async () => {
    kokoro.load.mockRejectedValueOnce(new Error('offline'));
    expect(await send({ type: 'say', id: 4, text: 'Box.', voice: 'bm_lewis', speed: 1, pauseMs: null })).toEqual([{ type: 'error', id: 4, message: 'offline' }]);
  });
});
