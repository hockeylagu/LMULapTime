import type { LiveRadioCallEvent, LiveRadioPageOutcome } from '../../../../shared/types/live.js';
import { radioVoiceSupported, speakRadio } from './useStrategyRadio.js';

type Report = (id: number, outcome: LiveRadioPageOutcome) => void;

/**
 * Says the server's radio calls one at a time in the browser voice: a P1 cuts in (the call it cuts is reported
 * `interrupted`), the others wait their turn. Calls that arrive while audio is locked are reported `locked`, late
 * ones are skipped. One per dashboard page.
 */
export class RadioPlayer {
  private volume = 80;
  private unlocked = true;
  /** The call being said; `token` tells its own end from a later call's. */
  private current: { call: LiveRadioCallEvent; token: object } | null = null;
  private queue: LiveRadioCallEvent[] = [];

  public constructor(private readonly report: Report, private readonly now: () => number = Date.now) {}

  public configure(volume: number, unlocked: boolean): void {
    this.volume = volume;
    this.unlocked = unlocked;
  }

  public play(call: LiveRadioCallEvent): void {
    if (call.expiresAt < this.now()) return;
    if (!radioVoiceSupported()) { this.report(call.id, 'failed'); return; }
    if (!this.unlocked) { this.report(call.id, 'locked'); return; }
    if (call.priority === 1) {
      for (const waiting of this.queue) this.report(waiting.id, 'interrupted');
      this.queue = [];
      this.cut();
      this.start(call);
      return;
    }
    if (this.current) this.queue.push(call);
    else this.start(call);
  }

  /** Stops speaking (the page closes or the voice is turned off). */
  public stop(): void {
    for (const waiting of this.queue) this.report(waiting.id, 'interrupted');
    this.queue = [];
    this.cut();
  }

  private cut(): void {
    const current = this.current;
    if (!current) return;
    this.current = null;
    this.report(current.call.id, 'interrupted');
    window.speechSynthesis.cancel();
  }

  private start(call: LiveRadioCallEvent): void {
    const token = {};
    const settle = (outcome: LiveRadioPageOutcome) => {
      if (this.current?.token !== token) return;
      this.current = null;
      this.report(call.id, outcome);
      this.next();
    };
    const utterance = speakRadio(call.text, this.volume, () => settle('failed'));
    if (!utterance) { this.report(call.id, 'failed'); this.next(); return; }
    utterance.onend = () => settle('spoken');
    this.current = { call, token };
  }

  private next(): void {
    const call = this.queue.shift();
    if (call) this.play(call);
  }
}
