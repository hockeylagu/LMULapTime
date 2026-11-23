import { routeAudio } from './audioOutput.js';
import type { KokoroRequest, KokoroResponse, KokoroVoiceId } from './kokoroMessages.js';

/** What the voice is doing: the model download, ready, or the last error. */
export type KokoroStatus = { state: 'idle' | 'ready' } | { state: 'loading'; percent: number } | { state: 'error'; message: string };

interface Pending { resolve: (ms: number) => void; reject: (error: Error) => void; volume: number }

/**
 * The Kokoro voice for the page: synthesis in a worker, playback through Web Audio at `volume` percent. One call at a
 * time: a new one stops the one playing.
 */
export class KokoroVoice {
  private worker: Worker | null = null;
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private done: Promise<void> = Promise.resolve();
  private pending = new Map<number, Pending>();
  private files = new Map<string, number>();
  private next = 1;
  private output: string | null = null;
  private routed: string | null | undefined;

  public constructor(private readonly onStatus: (status: KokoroStatus) => void,
    private readonly createWorker = () => new Worker(new URL('./kokoroWorker.ts', import.meta.url), { type: 'module' })) {}

  /** The audio output to play on (Settings → Radio output), null for the Windows default. */
  public setOutput(output: string | null): void {
    this.output = output;
  }

  /** Starts the model download (once); the browser keeps it for later visits. */
  public load(): void {
    if (this.worker) return;
    if (typeof Worker === 'undefined') { this.onStatus({ state: 'error', message: 'No web workers in this browser' }); return; }
    this.onStatus({ state: 'loading', percent: 0 });
    this.worker = this.createWorker();
    this.worker.onmessage = (event: MessageEvent<KokoroResponse>) => this.receive(event.data);
    this.send({ type: 'load' });
  }

  /** Says `text`, its pauses cut to `pauseMs` (null: as spoken); resolves with the synthesis time in ms once it plays. */
  public say(text: string, voice: KokoroVoiceId, speed: number, volume: number, pauseMs: number | null = null): Promise<number> {
    this.load();
    if (!this.worker) return Promise.reject(new Error('No web workers in this browser'));
    // Created from the click that asked for it, so the browser lets it play.
    this.context ??= new AudioContext();
    void this.context.resume();
    // Synthesis takes seconds: the output is set long before the audio plays.
    if (this.routed !== this.output) {
      this.routed = this.output;
      void routeAudio(this.context, this.output);
    }
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, volume });
      this.send({ type: 'say', id, text, voice, speed, pauseMs });
    });
  }

  /** Resolves when the call playing now ends (or is stopped). */
  public ended(): Promise<void> {
    return this.done;
  }

  public stop(): void {
    this.source?.stop();
    this.source = null;
  }

  public dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    void this.context?.close();
    this.context = null;
  }

  private send(request: KokoroRequest): void {
    this.worker?.postMessage(request);
  }

  private receive(message: KokoroResponse): void {
    if (message.type === 'progress') {
      this.files.set(message.file, message.percent);
      const percents = [...this.files.values()];
      this.onStatus({ state: 'loading', percent: Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length) });
      return;
    }
    if (message.type === 'ready') { this.onStatus({ state: 'ready' }); return; }
    const pending = message.id === null ? null : this.pending.get(message.id);
    if (message.id !== null) this.pending.delete(message.id);
    if (message.type === 'error') {
      this.onStatus({ state: 'error', message: message.message });
      pending?.reject(new Error(message.message));
      return;
    }
    if (!pending || !this.context) return;
    this.onStatus({ state: 'ready' });
    this.play(message.samples, message.sampleRate, pending.volume);
    pending.resolve(message.ms);
  }

  private play(samples: Float32Array<ArrayBuffer>, sampleRate: number, volume: number): void {
    const context = this.context!;
    this.stop();
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const gain = context.createGain();
    gain.gain.value = Math.min(1, Math.max(0, volume / 100));
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(context.destination);
    this.done = new Promise(resolve => {
      source.onended = () => { if (this.source === source) this.source = null; resolve(); };
    });
    source.start();
    this.source = source;
  }
}
