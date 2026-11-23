import type { LiveCall } from '../../../shared/domain/live/radio/liveCalls.js';
import type { LivePedalSample, LiveRadioCallEvent, LiveRadioOutcome, LiveSnapshot } from '../../../shared/types/live.js';

/**
 * A P2/P3 key is said once per run: a warning that flickers with the estimate stays quiet once heard (COTA 2026-10-20
 * said "fuel runs out before energy" 18 times on a 60 s guard). A P1 may come back after this many game seconds: a
 * stop not taken is called again the next lap (Le Mans 2026-10-23).
 */
const P1_REPEAT_SECONDS = 60;
/** A P2/P3 call not said within this long no longer helps. */
const WAIT_SECONDS = 120;
/** A straight: this long flat out on the pedals. */
const STRAIGHT_SECONDS = 1;
/** The after-the-line slot: right at the line, for 3 s; later it would land in the first corner (driver, 2026-11-22). */
const LINE_SLOT = { from: 0, to: 3 } as const;
/** At most this many P3 calls per lap; the rest are dropped. */
const P3_PER_LAP = 2;

/** One call as logged: where it was proposed and what became of it. */
export interface RadioLogEntry {
  runId: string | null;
  recordingId: string | null;
  gameTime: number;
  lap: number | null;
  key: string;
  priority: LiveCall['priority'];
  family: LiveCall['family'];
  text: string;
  outcome: LiveRadioOutcome;
}

export interface RadioSink {
  /** Stores a new call and returns its id. */
  log(entry: RadioLogEntry): number;
  /** Records what became of a logged call. */
  settle(id: number, outcome: LiveRadioOutcome): void;
  /** Sends a call to the dashboard pages; false when no page is connected. */
  send(event: LiveRadioCallEvent): boolean;
  /** The recording the calls belong to, when one runs. */
  recordingId(): string | null;
}

interface Waiting { id: number; call: LiveCall; since: number }

/**
 * Decides when each proposed call is said (`docs/plans/proposed/LIVE_VOICE_CALLS.md`, Timing): P1 at once; P2 and P3
 * in a slot (just after the line, or a straight, one call per slot), P3 within a budget per lap, dropped when stale.
 * Runs on the game clock of the pedal samples, so a pause or a slow page changes nothing. Every call is logged, said
 * or not.
 */
export class RadioScheduler {
  private enabled: boolean;
  private run: string | null = null;
  private clock: number | null = null;
  private snapshot: LiveSnapshot | null = null;
  private strategyCalls: LiveCall[] = [];
  private fieldCalls: LiveCall[] = [];
  /** The keys proposed by the snapshot before the current one: a P1 may repeat only after it went away. */
  private previous = new Set<string>();
  private waiting: Waiting | null = null;
  private readonly said = new Map<string, number>();
  private flatSince: number | null = null;
  private lineAt: number | null = null;
  private laps: number | null = null;
  private p3ThisLap = 0;
  private usedSlot: string | null = null;

  public constructor(private readonly sink: RadioSink, enabled: boolean, private readonly propose: (snapshot: LiveSnapshot) => LiveCall[]) {
    this.enabled = enabled;
  }

  /** The voice switch from Settings: off, nothing is proposed, waiting calls expire. */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) { this.drop('expired'); this.strategyCalls = []; this.fieldCalls = []; }
  }

  /** Every candidate, most important first; within a priority the field's (incidents, traffic) before strategy. */
  private candidates(): LiveCall[] {
    return [...this.fieldCalls, ...this.strategyCalls].map((call, index) => ({ call, index }))
      .sort((a, b) => a.call.priority - b.call.priority || a.index - b.index).map(({ call }) => call);
  }

  private remember(): void {
    this.previous = new Set([...this.fieldCalls, ...this.strategyCalls].map(call => call.key));
  }

  /** The field's calls (incidents, traffic, the rejoin), proposed with every scoring change. */
  public observeField(calls: LiveCall[]): void {
    this.remember();
    this.fieldCalls = this.enabled ? calls : [];
    this.select();
  }

  public observeSnapshot(snapshot: LiveSnapshot): void {
    this.snapshot = snapshot;
    const session = snapshot.session;
    const run = session ? `${snapshot.audit?.runId ?? ''}|${session.sessionCode}` : null;
    if (run !== this.run) this.reset(run);
    const laps = session?.playerLapsCompleted ?? null;
    if (laps !== this.laps) {
      if (laps !== null && this.laps !== null) this.lineAt = this.clock;
      this.laps = laps;
      this.p3ThisLap = 0;
    }
    this.remember();
    this.strategyCalls = this.enabled ? this.propose(snapshot) : [];
    this.select();
  }

  /** A call not said yet this run; a P1 again once it went away and came back after a minute. */
  private fresh(call: LiveCall, now: number): boolean {
    const before = this.said.get(call.key);
    // An incident is said once: a car parked for good would come back every lap.
    return before === undefined || (call.priority === 1 && call.family !== 'incident' && now - before >= P1_REPEAT_SECONDS
      && !this.previous.has(call.key));
  }

  /**
   * P1 and immediate calls are said at once (an immediate P3 within the lap's budget); of the rest, the first fresh one
   * waits for its slot, and the next one follows when it is heard.
   */
  private select(): void {
    const now = this.clock;
    if (now === null) return;
    const candidates = this.candidates().filter(candidate => this.fresh(candidate, now));
    for (const call of candidates) {
      if (call.priority !== 1 && !call.immediate) continue;
      const id = this.log(call, now);
      if (call.priority === 3 && this.p3ThisLap >= P3_PER_LAP) {
        this.said.set(call.key, now);
        this.sink.settle(id, 'dropped-budget');
        continue;
      }
      if (call.priority === 3) this.p3ThisLap += 1;
      this.deliver(id, call, now);
    }
    const call = candidates.find(candidate => candidate.priority !== 1 && !candidate.immediate) ?? null;
    if (!call) { this.drop('expired'); return; }
    if (call.key === this.waiting?.call.key) return;
    this.drop('replaced');
    this.waiting = { id: this.log(call, now), call, since: now };
    this.tryDeliver(now);
  }

  public observePedal(sample: LivePedalSample): void {
    if (this.clock !== null && sample.t < this.clock - 1) this.flatSince = null;
    const first = this.clock === null;
    this.clock = sample.t;
    // A snapshot that came before the first clock is proposed now; it may not change again for a while.
    if (first && this.snapshot) this.observeSnapshot(this.snapshot);
    const flat = sample.throttle >= 0.98 && sample.brake <= 0.05;
    if (!flat) this.flatSince = null;
    else this.flatSince ??= sample.t;
    this.tryDeliver(sample.t);
  }

  private slot(now: number): string | null {
    if (this.flatSince !== null && now - this.flatSince >= STRAIGHT_SECONDS) return `straight@${this.flatSince}`;
    if (this.lineAt !== null && now - this.lineAt >= LINE_SLOT.from && now - this.lineAt <= LINE_SLOT.to) return `line@${this.lineAt}`;
    return null;
  }

  private tryDeliver(now: number): void {
    const waiting = this.waiting;
    if (!waiting) return;
    // A call that waited too long or hit the budget is spent for the run, like one said: the next one may follow.
    if (now - waiting.since > (waiting.call.waitSeconds ?? WAIT_SECONDS) || now < waiting.since - 1) {
      this.spend(waiting, 'expired', now);
      return;
    }
    const slot = this.slot(now);
    if (slot === null || slot === this.usedSlot) return;
    if (waiting.call.priority === 3 && this.p3ThisLap >= P3_PER_LAP) { this.spend(waiting, 'dropped-budget', now); return; }
    this.waiting = null;
    this.usedSlot = slot;
    if (waiting.call.priority === 3) this.p3ThisLap += 1;
    this.deliver(waiting.id, waiting.call, now);
    this.select();
  }

  private spend(waiting: Waiting, outcome: LiveRadioOutcome, now: number): void {
    this.waiting = null;
    this.said.set(waiting.call.key, now);
    this.sink.settle(waiting.id, outcome);
    this.select();
  }

  private deliver(id: number, call: LiveCall, now: number): void {
    this.said.set(call.key, now);
    this.sink.settle(id, 'sent');
    const sent = this.sink.send({ id, priority: call.priority, text: call.text, expiresAt: Date.now() + (call.priority === 1 ? 30_000 : 15_000) });
    if (!sent) this.sink.settle(id, 'no-client');
  }

  private log(call: LiveCall, now: number): number {
    const session = this.snapshot?.session;
    return this.sink.log({
      runId: this.snapshot?.audit?.runId ?? null, recordingId: this.sink.recordingId(), gameTime: now,
      lap: session?.playerLapsCompleted != null ? session.playerLapsCompleted + 1 : null,
      key: call.key, priority: call.priority, family: call.family, text: call.text, outcome: 'queued',
    });
  }

  private drop(outcome: LiveRadioOutcome): void {
    if (this.waiting) this.sink.settle(this.waiting.id, outcome);
    this.waiting = null;
  }

  /** A new run or session: old keys never leak into it. */
  private reset(run: string | null): void {
    this.drop('expired');
    this.run = run;
    this.strategyCalls = [];
    this.fieldCalls = [];
    this.previous = new Set();
    this.said.clear();
    this.lineAt = null;
    this.laps = null;
    this.p3ThisLap = 0;
    this.usedSlot = null;
  }
}
