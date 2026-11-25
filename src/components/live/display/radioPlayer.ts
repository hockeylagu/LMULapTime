import type { LiveRadioCallEvent, LiveRadioPageOutcome } from '../../../../shared/types/live.js';
import { radioVoiceSupported, speakRadio } from '../voice/browserVoice.js';
import type { ClipVoice } from '../voice/clipVoice.js';

type Report = (id: number, outcome: LiveRadioPageOutcome) => void;

/**
 * After a cut the next call is spoken this much later, never in the same task: Chrome's online voices (what `en-GB`
 * gives on a PC with no British Windows voice) drop a call spoken right after `cancel()`, with no event at all.
 * Sebring 2026-11-22: eight such calls, none reported its end, six held every later call for up to five minutes.
 * Checked in Chrome 2026-11-23: at once, 6 of 6 never started; 1 ms or more later, 14 of 14 played.
 */
const CUT_GAP_MS = 50;
/** A call the browser has not started this long after it was asked is taken as dropped. */
const START_LIMIT_MS = 2000;
/** The longest a started call may take: the slowest voice measured needs 150 ms a character. */
const speakLimitMs = (text: string): number => 3000 + text.length * 200;
/** Silence where two sentence clips join: with the 20 ms each clip keeps at its ends, a 90 ms pause (driver, 2026-11-24: 80 a little short). */
const CLIP_GAP_MS = 50;

/** The call being said: its time limit, and its utterance held so the browser keeps its events alive. */
interface Playing { call: LiveRadioCallEvent; timer?: ReturnType<typeof setTimeout>; utterance?: SpeechSynthesisUtterance }

/**
 * Says the server's radio calls one at a time: in the engineer's prepared clips (`clips`, on the radio output) when
 * every sentence of the call has one, else in the browser voice. A P1 cuts a P2 or P3 (reported `interrupted`, as are
 * the ones waiting) and waits for a P1 already speaking; the others wait their turn. A call that never starts or never
 * ends is reported `failed` and the next one goes on. Calls that arrive while audio is locked are reported `locked`,
 * the ones past their time `late`. One per dashboard page.
 */
export class RadioPlayer {
  private volume = 80;
  private unlocked = true;
  private current: Playing | null = null;
  private queue: LiveRadioCallEvent[] = [];

  public constructor(private readonly report: Report, private readonly now: () => number = Date.now,
    private readonly clips: Pick<ClipVoice, 'say' | 'stop' | 'setOutput' | 'dispose'> | null = null) {}

  /** The Settings volume and radio output (null: the Windows default), and whether the page may play audio yet. */
  public configure(volume: number, unlocked: boolean, output: string | null = null): void {
    this.volume = volume;
    this.unlocked = unlocked;
    this.clips?.setOutput(output);
  }

  public play(call: LiveRadioCallEvent): void {
    if (call.expiresAt < this.now()) { this.report(call.id, 'late'); return; }
    if (!this.clips && !radioVoiceSupported()) { this.report(call.id, 'failed'); return; }
    if (!this.unlocked) { this.report(call.id, 'locked'); return; }
    if (call.priority !== 1) {
      if (this.current) this.queue.push(call);
      else this.start(call);
      return;
    }
    for (const waiting of this.queue) if (waiting.priority !== 1) this.report(waiting.id, 'interrupted');
    this.queue = this.queue.filter(waiting => waiting.priority === 1);
    if (this.current?.call.priority === 1) { this.queue.push(call); return; }
    this.start(call, this.cut() ? CUT_GAP_MS : 0);
  }

  /** Stops speaking (the voice is turned off). */
  public stop(): void {
    for (const waiting of this.queue) this.report(waiting.id, 'interrupted');
    this.queue = [];
    this.cut();
  }

  /** Stops and frees the audio output (the page closes). */
  public dispose(): void {
    this.stop();
    this.clips?.dispose();
  }

  /** Cuts the call being said; false when none was. */
  private cut(): boolean {
    const playing = this.current;
    if (!playing) return false;
    clearTimeout(playing.timer);
    this.current = null;
    this.report(playing.call.id, 'interrupted');
    this.silence();
    return true;
  }

  private silence(): void {
    this.clips?.stop();
    if (radioVoiceSupported()) window.speechSynthesis.cancel();
  }

  private start(call: LiveRadioCallEvent, delayMs = 0): void {
    const playing: Playing = { call };
    this.current = playing;
    /** Ends this call, unless a later one took over; `reset` silences a voice that stopped answering. */
    const settle = (outcome: LiveRadioPageOutcome, reset = false) => {
      if (this.current !== playing) return;
      clearTimeout(playing.timer);
      this.current = null;
      this.report(call.id, outcome);
      if (reset) this.silence();
      this.next(reset ? CUT_GAP_MS : 0);
    };
    const limit = (ms: number) => {
      clearTimeout(playing.timer);
      playing.timer = setTimeout(() => settle('failed', true), ms);
    };
    const browserVoice = () => {
      const utterance = radioVoiceSupported() ? speakRadio(call.text, this.volume, () => settle('failed')) : null;
      if (!utterance) { settle('failed'); return; }
      utterance.onstart = () => { if (this.current === playing) limit(speakLimitMs(call.text)); };
      utterance.onend = () => settle('spoken');
      playing.utterance = utterance;
      limit(START_LIMIT_MS);
    };
    const speak = () => {
      if (!this.clips) { browserVoice(); return; }
      limit(speakLimitMs(call.text));
      // False: a sentence of the call has no clip. Rejected: the clips could not be read. Either way the browser says it.
      void this.clips.say(call.text, false, CLIP_GAP_MS, this.volume).then(
        (heard) => { if (this.current === playing) { if (heard) settle('spoken'); else browserVoice(); } },
        () => { if (this.current === playing) browserVoice(); });
    };
    if (delayMs > 0) playing.timer = setTimeout(speak, delayMs);
    else speak();
  }

  /** The next waiting call still in time; the others are reported `late`. */
  private next(delayMs = 0): void {
    let call = this.queue.shift();
    while (call && call.expiresAt < this.now()) {
      this.report(call.id, 'late');
      call = this.queue.shift();
    }
    if (call) this.start(call, delayMs);
  }
}
