import { fetchBinary, fetchJson } from '../../../api/apiClient.js';
import { routeAudio } from './audioOutput.js';
import { callSentences } from './callPieces.js';

/** `public/voice/george/manifest.json`, written by `tools/dev/prepareVoiceClips.ts`. */
interface ClipManifest { clips: Record<string, string> }

const BASE = 'voice/george/';

/**
 * Prepared engineer clips: a call plays from its own clip (`whole`) or joined from the clips of its sentences, with
 * `gapMs` of silence added at each join. Nothing is synthesized: a call starts in
 * milliseconds and costs no CPU to speak.
 */
export class ClipVoice {
  private manifest: Promise<ClipManifest | null> | null = null;
  private context: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private source: AudioBufferSourceNode | null = null;
  /** Counts the calls and stops: a call still loading when a later one or a stop came does not play. */
  private run = 0;
  private output: string | null = null;
  private routed: string | null | undefined;

  public constructor(private readonly readJson: (path: string) => Promise<unknown> = path => fetchJson(path, { cache: 'no-store' }),
    private readonly readBinary: (path: string) => Promise<ArrayBuffer> = fetchBinary) {}

  /** The audio output to play on (Settings → Radio output), null for the Windows default. */
  public setOutput(output: string | null): void {
    this.output = output;
  }

  /** The clip files a call needs, or null when one is missing even after reading the manifest again. */
  public async files(text: string, whole: boolean): Promise<string[] | null> {
    const found = await this.lookup(text, whole);
    if (found) return found;
    // Clips prepared since the page opened are in the manifest on disk.
    this.manifest = null;
    return this.lookup(text, whole);
  }

  private async lookup(text: string, whole: boolean): Promise<string[] | null> {
    const manifest = await this.load();
    if (!manifest) return null;
    const files = (whole ? [text] : callSentences(text)).map(piece => manifest.clips[piece]);
    return files.every(Boolean) ? files : null;
  }

  /** Plays the call; resolves once heard (or stopped), false when the clips for it are missing. */
  public async say(text: string, whole: boolean, gapMs: number, volume: number): Promise<boolean> {
    this.run += 1;
    const run = this.run;
    // Created from the click that asked for it, so the browser lets it play.
    this.context ??= new AudioContext();
    const context = this.context;
    void context.resume();
    if (this.routed !== this.output) {
      this.routed = this.output;
      await routeAudio(context, this.output);
    }
    const files = await this.files(text, whole);
    if (!files || files.length === 0) return false;
    const clips = await Promise.all(files.map(file => this.buffer(context, file)));
    if (run !== this.run) return true;
    const gap = Math.round((gapMs / 1000) * clips[0].sampleRate);
    const joined = context.createBuffer(1, clips.reduce((sum, clip) => sum + clip.length, 0) + gap * (clips.length - 1), clips[0].sampleRate);
    let offset = 0;
    for (const clip of clips) {
      joined.copyToChannel(clip.getChannelData(0), 0, offset);
      offset += clip.length + gap;
    }
    this.source?.stop();
    const gain = context.createGain();
    gain.gain.value = Math.min(1, Math.max(0, volume / 100));
    const source = context.createBufferSource();
    source.buffer = joined;
    source.connect(gain).connect(context.destination);
    this.source = source;
    await new Promise<void>(resolve => {
      source.onended = () => resolve();
      source.start();
    });
    if (this.source === source) this.source = null;
    return true;
  }

  public stop(): void {
    this.run += 1;
    this.source?.stop();
    this.source = null;
  }

  /** Stops and frees the audio output (the page that owned the voice closes). */
  public dispose(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
    this.routed = undefined;
  }

  private load(): Promise<ClipManifest | null> {
    // No manifest yet (the clips are not prepared): every call falls back.
    this.manifest ??= this.readJson(`${BASE}manifest.json`).then(manifest => manifest as ClipManifest, () => null);
    return this.manifest;
  }

  private buffer(context: AudioContext, file: string): Promise<AudioBuffer> {
    let buffer = this.buffers.get(file);
    if (!buffer) {
      buffer = this.readBinary(`${BASE}${file}`).then(data => context.decodeAudioData(data));
      this.buffers.set(file, buffer);
      // A clip that failed to load is read again the next time, not failed for good.
      buffer.catch(() => this.buffers.delete(file));
    }
    return buffer;
  }
}
