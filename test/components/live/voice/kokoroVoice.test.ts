import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KokoroRequest, KokoroResponse } from '../../../../src/components/live/voice/kokoroMessages.js';
import { KokoroVoice, type KokoroStatus } from '../../../../src/components/live/voice/kokoroVoice.js';

class FakeWorker {
  public sent: KokoroRequest[] = [];
  public onmessage: ((event: MessageEvent<KokoroResponse>) => void) | null = null;
  public terminated = false;
  public postMessage(request: KokoroRequest) { this.sent.push(request); }
  public terminate() { this.terminated = true; }
  public reply(message: KokoroResponse) { this.onmessage?.({ data: message } as MessageEvent<KokoroResponse>); }
}

const sinks: string[] = [];
const started: Array<{ gain: number; ended: () => void }> = [];
class FakeContext {
  public destination = {};
  public resume = vi.fn(() => Promise.resolve());
  public close = vi.fn(() => Promise.resolve());
  public setSinkId = (id: string) => { sinks.push(id); return Promise.resolve(); };
  public createBuffer = (_channels: number, length: number, rate: number) => ({ length, rate, copyToChannel: vi.fn() });
  public createGain() { return { gain: { value: 1 }, connect: (target: unknown) => target }; }
  public createBufferSource() {
    const source = {
      buffer: null as unknown, onended: null as (() => void) | null, stop: vi.fn(() => source.onended?.()),
      connect: (gain: { gain: { value: number } }) => { started.push({ gain: gain.gain.value, ended: () => source.onended?.() }); return gain; },
      start: vi.fn(),
    };
    return source;
  }
}

describe('Kokoro voice', () => {
  let worker: FakeWorker;
  let statuses: KokoroStatus[];
  let voice: KokoroVoice;
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('Worker', FakeWorker);
    started.length = 0;
    sinks.length = 0;
    worker = new FakeWorker();
    statuses = [];
    voice = new KokoroVoice(status => statuses.push(status), () => worker as unknown as Worker);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads once with progress, says a call at the volume and reports the synthesis time', async () => {
    const said = voice.say('Box this lap.', 'bm_george', 1.1, 60);
    voice.load();
    expect(worker.sent).toEqual([{ type: 'load' }, { type: 'say', id: 1, text: 'Box this lap.', voice: 'bm_george', speed: 1.1, pauseMs: null }]);
    worker.reply({ type: 'progress', file: 'model.onnx', percent: 40 });
    worker.reply({ type: 'progress', file: 'tokenizer.json', percent: 100 });
    worker.reply({ type: 'ready' });
    expect(statuses).toEqual([{ state: 'loading', percent: 0 }, { state: 'loading', percent: 40 }, { state: 'loading', percent: 70 }, { state: 'ready' }]);
    worker.reply({ type: 'audio', id: 1, samples: new Float32Array(240), sampleRate: 24_000, ms: 812 });
    await expect(said).resolves.toBe(812);
    expect(started).toHaveLength(1);
    expect(started[0].gain).toBeCloseTo(0.6);
    const ended = voice.ended();
    started[0].ended();
    await expect(ended).resolves.toBeUndefined();
  });

  it('plays on the chosen output', async () => {
    voice.setOutput('headset');
    const said = voice.say('Box this lap.', 'bm_george', 1.2, 80);
    worker.reply({ type: 'audio', id: 1, samples: new Float32Array(240), sampleRate: 24_000, ms: 700 });
    await said;
    expect(sinks).toEqual(['headset']);
    voice.dispose();
  });

  it('rejects on a failed synthesis, says why, and stops and closes on dispose', async () => {
    const said = voice.say('Box this lap.', 'bm_lewis', 1, 80);
    worker.reply({ type: 'error', id: 1, message: 'no model' });
    await expect(said).rejects.toThrow('no model');
    expect(statuses.at(-1)).toEqual({ state: 'error', message: 'no model' });
    voice.dispose();
    expect(worker.terminated).toBe(true);
  });
});
