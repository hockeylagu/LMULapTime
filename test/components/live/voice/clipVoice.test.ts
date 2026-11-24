import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callSentences, clipFile } from '../../../../src/components/live/voice/callPieces.js';
import { ClipVoice } from '../../../../src/components/live/voice/clipVoice.js';

const MANIFEST = { clips: { 'Yellow, Turn 11.': 'yellow-turn11.wav', 'Box this lap.': 'box-this-lap-stop.wav' } };
/** Each clip decodes to as many samples as its name is long, at 1 kHz. */
const clip = (length: number) => ({ length, sampleRate: 1000, getChannelData: () => new Float32Array(length) });
let joined: { length: number; copies: number[] } | null = null;
const gains: number[] = [];
const sinks: string[] = [];
let closed = 0;

class FakeContext {
  public destination = {};
  public resume = () => Promise.resolve();
  public close = () => { closed += 1; return Promise.resolve(); };
  public setSinkId = (id: string) => { sinks.push(id); return Promise.resolve(); };
  public decodeAudioData = (data: ArrayBuffer) => Promise.resolve(clip(data.byteLength));
  public createBuffer(_channels: number, length: number) {
    joined = { length, copies: [] };
    const target = joined;
    return { length, copyToChannel: (_data: Float32Array, _channel: number, offset: number) => target.copies.push(offset) };
  }
  public createGain() { return { gain: { value: 1 }, connect: (target: unknown) => target }; }
  public createBufferSource() {
    const source = {
      buffer: null as unknown, onended: null as (() => void) | null,
      connect: (gain: { gain: { value: number } }) => { gains.push(gain.gain.value); return gain; },
      start: () => queueMicrotask(() => source.onended?.()), stop: vi.fn(),
    };
    return source;
  }
}

const json = () => Promise.resolve(MANIFEST);
const binary = (path: string) => Promise.resolve(new ArrayBuffer(path.split('/').pop()!.length * 10));

describe('prepared engineer clips', () => {
  beforeEach(() => { vi.stubGlobal('AudioContext', FakeContext); joined = null; gains.length = 0; sinks.length = 0; });
  afterEach(() => vi.unstubAllGlobals());

  it("cuts a call into its sentences and names each clip's file", () => {
    expect(callSentences('Yellow, Turn 6. Car stopped on track, left, in your path. Set 0.90.'))
      .toEqual(['Yellow, Turn 6.', 'Car stopped on track, left, in your path.', 'Set 0.90.']);
    expect(clipFile('Turn 6.')).toBe('turn-6-stop.wav');
    expect(clipFile('?')).toBe('blank.wav');
  });

  it('joins the sentences with the gap between them, at the volume, and says when a clip is missing', async () => {
    const voice = new ClipVoice(json, binary);
    expect(await voice.say('Yellow, Turn 11. Box this lap.', false, 40, 50)).toBe(true);
    // 170 + 40 gap + 210 samples, the second sentence copied after the first and the gap.
    expect(joined).toEqual({ length: 420, copies: [0, 210] });
    expect(gains).toEqual([0.5]);
    expect(await voice.say('Box this lap.', true, 40, 50)).toBe(true);
    expect(await voice.files('Yellow, Turn 6.', false)).toBeNull();
    expect(await voice.say('Turn 12.', true, 0, 50)).toBe(false);
    voice.stop();
  });

  it('plays on the chosen output, set once until it changes', async () => {
    const voice = new ClipVoice(json, binary);
    voice.setOutput('headset');
    await voice.say('Box this lap.', true, 0, 50);
    await voice.say('Box this lap.', true, 0, 50);
    voice.setOutput(null);
    await voice.say('Box this lap.', true, 0, 50);
    expect(sinks).toEqual(['headset', '']);
  });

  it('does not play a call still loading when a stop or a later call came, and reads a failed clip again', async () => {
    const voice = new ClipVoice(json, binary);
    const first = voice.say('Yellow, Turn 11.', true, 0, 50);
    voice.stop();
    expect(await first).toBe(true);
    expect(joined).toBeNull();
    const early = voice.say('Yellow, Turn 11.', true, 0, 50);
    const late = voice.say('Box this lap.', true, 0, 50);
    await Promise.all([early, late]);
    expect(joined).toEqual({ length: 210, copies: [0] });
    let fail = true;
    const flaky = new ClipVoice(json, path => fail ? Promise.reject(new Error('offline')) : binary(path));
    await expect(flaky.say('Box this lap.', true, 0, 50)).rejects.toThrow('offline');
    fail = false;
    expect(await flaky.say('Box this lap.', true, 0, 50)).toBe(true);
    flaky.dispose();
    expect(closed).toBe(1);
  });

  it('reads the manifest again for clips prepared since the page opened', async () => {
    const manifests = [{ clips: {} }, MANIFEST];
    const voice = new ClipVoice(() => Promise.resolve(manifests.shift() ?? MANIFEST), binary);
    expect(await voice.files('Box this lap.', true)).toEqual(['box-this-lap-stop.wav']);
  });

  it('has no clips when the manifest is missing', async () => {
    const voice = new ClipVoice(() => Promise.reject(new Error('404')), binary);
    expect(await voice.files('Box this lap.', true)).toBeNull();
  });
});
