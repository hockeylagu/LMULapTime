import { isDeepStrictEqual } from 'node:util';
import type { LiveRestUpdate } from '../../shared/domain/live/liveStrategyTracker.js';
import type { LivePitMenu } from '../../shared/types/liveStrategy.js';
import type { LiveCaptureObservation } from '../../shared/types/liveCapture.js';
import { captureRestEvidence } from './capture/evidence.js';
import { parseReplayPlayback } from './lmuNavigation.js';
import {
  lmuGet, parseEstimate, parseForecast, parseGarageData, parsePitMenu, parsePitStopTimes,
  parseSchedule, parseTireManagement, parseVehicleCondition,
} from './lmuPitRest.js';
import type { RestAnswer, RestGet } from './lmuPitRest.js';
import type { DiagnosticSink } from './capture/diagnostics.js';

/** What the poller reads: nothing, the on-track set, or the garage set (between runs, before the car leaves). */
export type PitPollMode = 'off' | 'track' | 'garage';

/** One request at most this often, all reads together (the gentle rule for LMU's REST API). */
export const PIT_POLL_TICK_MS = 1000;
/** The game state is read at least this often, to learn when a replay starts or ends. */
export const REPLAY_CHECK_MS = 15_000;
/**
 * A read that crashes LMU in a replay goes out only this soon after a state check that said no replay is playing:
 * each one is paired with its own check, so a replay that just started is seen first.
 */
export const REPLAY_UNSAFE_CHECK_MS = 2000;
/** A slow answer pauses every read this long; a refused or failed one pauses only that read. */
export const SLOW_PAUSE_MS = 10_000;
export const FAILED_READ_PAUSE_MS = 30_000;

/**
 * What to read again now: the condition after a line crossing, an impact or a pit exit; the tyre screen after a pit
 * exit (both asked by the service); the stop estimate after an MFD change (the poller's own).
 */
export type PitTrigger = 'condition' | 'tireManagement' | 'estimate';

type ReadMode = Exclude<PitPollMode, 'off'>;

interface PitRead {
  path: string;
  /** Period per mode, ms; absent when the read is not made in that mode. */
  every: Partial<Record<ReadMode, number>>;
  /** Period while the pit is in play (a stop requested or under way, or the car damaged); `every` otherwise. */
  busyEvery?: Partial<Record<ReadMode, number>>;
  /** Fixed for the loaded session: read once (until the poller is off), retried only after a failure. */
  once?: boolean;
  /** Read again at once when the service triggers it; `every` is then only a fallback. */
  trigger?: PitTrigger;
  /**
   * Crashed LMU during a replay (`getVehicleCondition`, reproduced 2026-10-16): only right after its own state check.
   * Every other read answered in a replay (200, or 404 for the two garage screens), so it needs no check of its own.
   */
  crashesInReplay: boolean;
  parse(body: unknown): LiveRestUpdate | null;
}

/**
 * The state check: `navigation/state`, whose `state.settingMode` reads `SETTING_REPLAY_PLAYBACK` while a replay plays.
 * (`GetGameState.isReplayActive` stayed false during one, 2026-10-16.)
 */
const STATE_PATH = '/navigation/state';

/**
 * A reply as the diagnostics keep it: the raw shape, less what is kept elsewhere. The tyre screen drops its copy of
 * the pit menu, which is logged from its own read.
 */
function diagnosticBody(path: string, body: unknown): unknown {
  if (path === '/rest/garage/UIScreen/TireManagement' && typeof body === 'object' && body !== null) return { ...body, pitMenu: undefined };
  return body;
}

/**
 * VE, pit state, penalties and tread come from shared memory (validated against these reads, Silverstone 2026-10-25),
 * so on track only a few reads a minute remain. Each read is made as often as its answer can change: the stop
 * estimate and the MFD often only while the pit is in play; the condition after an impact or a stop and every 5
 * minutes (damage); the tyre screen after a stop; the pit rules and the event schedule once per loaded session.
 */
const READS: PitRead[] = [
  {
    path: '/rest/strategy/pitstop-estimate', every: { track: 60_000 }, busyEvery: { track: 10_000 }, trigger: 'estimate',
    crashesInReplay: false, parse: parseEstimate,
  },
  {
    path: '/rest/garage/PitMenu/receivePitMenu', every: { track: 30_000, garage: 10_000 }, busyEvery: { track: 10_000 },
    crashesInReplay: false, parse: body => { const menu = parsePitMenu(body); return menu && { type: 'pitMenu', menu }; },
  },
  {
    path: '/rest/garage/getVehicleCondition', every: { track: 300_000 }, trigger: 'condition', crashesInReplay: true,
    parse: body => { const condition = parseVehicleCondition(body); return condition && { type: 'condition', condition }; },
  },
  {
    path: '/rest/garage/UIScreen/TireManagement', every: { track: 60_000, garage: 20_000 }, trigger: 'tireManagement',
    crashesInReplay: false, parse: parseTireManagement,
  },
  { path: '/rest/garage/UIScreen/RepairAndRefuel', every: { track: 120_000 }, once: true, crashesInReplay: false, parse: parsePitStopTimes },
  { path: '/rest/garage/getPlayerGarageData', every: { garage: 5000 }, crashesInReplay: false, parse: parseGarageData },
  { path: '/rest/sessions/weather', every: { track: 60_000, garage: 60_000 }, crashesInReplay: false, parse: parseForecast },
  // The race length for the garage before the start; it does not change during the event. Never read in a replay
  // yet, so it waits for its own state check like the read that crashed one.
  { path: '/rest/sessions/GetSessionsInfoForEvent', every: { garage: 60_000 }, once: true, crashesInReplay: true, parse: parseSchedule },
];

export interface LivePitPollerOptions {
  diagnosticSink?: () => DiagnosticSink | undefined;
  onEvidence?: (observation: LiveCaptureObservation) => void;
  onUpdate(update: LiveRestUpdate): void;
  /** Whether a replay is playing changed (`navigation/state` `settingMode`; null when unknown). */
  onReplay(active: boolean | null): void;
  /** Every state check answered while no replay plays: its body, so the identity needs no request of its own. */
  onNavigation?(body: unknown): void;
  /** Replaces the HTTP read (tests). */
  get?: RestGet;
  now?: () => number;
}

/**
 * Reads LMU's pit, MFD, damage, tyre and forecast data while a session is loaded and a dashboard is open: one
 * request at a time, at most one a second, the most overdue read first. The state check (`navigation/state`) runs
 * every 10 s; while it says a replay plays, nothing else is read (the answers would be the replay's, not the
 * session's). `getVehicleCondition`, which crashed LMU in a replay, follows its own check of the last 2 s that said no
 * replay; the other reads are safe in a replay and need none. A slow answer pauses everything 10 s; a failed one
 * pauses that read 30 s.
 */
export class LivePitPoller {
  private mode: PitPollMode = 'off';
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private generation = 0;
  private pausedUntil = 0;
  private replay: boolean | null = null;
  private replayCheckedAt = -Infinity;
  /** The last request was a state check that said no replay. */
  private unsafeCheckFresh = false;
  private gameStateDue = 0;
  private readonly due = new Map<string, number>();
  /** `once` reads answered since the poller last went off. */
  private readonly onceDone = new Set<string>();
  private pitActive = false;
  private sessionKey = '';
  /** The last parsed MFD state, so a change can bring the stop estimate forward. */
  private lastMenu: LivePitMenu | null = null;

  public constructor(private readonly options: LivePitPollerOptions) {}

  private now(): number { return (this.options.now ?? Date.now)(); }

  public setMode(mode: PitPollMode, sessionKey = ''): void {
    if (mode === this.mode && sessionKey === this.sessionKey) return;
    if (sessionKey !== this.sessionKey) { this.onceDone.clear(); this.lastMenu = null; }
    this.sessionKey = sessionKey;
    this.mode = mode;
    this.generation++;
    this.due.clear();
    this.gameStateDue = 0;
    this.unsafeCheckFresh = false;
    if (mode === 'off') {
      this.clearTimer();
      this.onceDone.clear();
      this.setReplay(null, -Infinity);
      return;
    }
    if (!this.timer) {
      this.timer = setInterval(() => { void this.tick(); }, PIT_POLL_TICK_MS);
      this.timer.unref();
    }
    void this.tick();
  }

  public stop(): void { this.setMode('off'); }

  /** A stop requested or under way, or the car damaged: the stop estimate and the MFD are read often, starting now. */
  public setPitActive(active: boolean): void {
    if (active === this.pitActive) return;
    this.pitActive = active;
    if (!active) return;
    for (const read of READS) if (read.busyEvery) this.due.set(read.path, 0);
  }

  /** Reads `trigger` next (after the state check it may need). */
  public trigger(trigger: PitTrigger): void {
    for (const read of READS) if (read.trigger === trigger) this.due.set(read.path, 0);
  }

  private period(read: PitRead, mode: ReadMode): number | undefined {
    return (this.pitActive ? read.busyEvery?.[mode] : undefined) ?? read.every[mode];
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private setReplay(active: boolean | null, at: number): void {
    this.replayCheckedAt = at;
    if (active === this.replay) return;
    this.replay = active;
    this.options.onReplay(active);
  }

  /** The read to make now: the game state when due, else the most overdue read allowed in this mode. */
  private next(now: number): { path: string; read: PitRead | null } | null {
    const mode = this.mode;
    if (mode === 'off') return null;
    if (now >= this.gameStateDue) return { path: STATE_PATH, read: null };
    // A replay playing: nothing but the state check until it ends.
    if (this.replay === true) return null;
    let best: PitRead | null = null;
    let bestLate = -Infinity;
    for (const read of READS) {
      const every = this.period(read, mode);
      if (every === undefined || (read.once && this.onceDone.has(read.path)) || (read.crashesInReplay && this.replay !== false)) continue;
      const late = (now - (this.due.get(read.path) ?? 0)) / every;
      if (late >= 0 && late > bestLate) { best = read; bestLate = late; }
    }
    if (!best) return null;
    // A replay-unsafe read waits one tick behind a fresh check that no replay has started since the last one.
    if (best.crashesInReplay && (!this.unsafeCheckFresh || now - this.replayCheckedAt > REPLAY_UNSAFE_CHECK_MS)) {
      return { path: STATE_PATH, read: null };
    }
    return { path: best.path, read: best };
  }

  private async tick(): Promise<void> {
    const now = this.now();
    if (this.inFlight || now < this.pausedUntil) return;
    const next = this.next(now);
    if (!next) return;
    const generation = this.generation;
    const diagnostic = this.options.diagnosticSink?.();
    const requestMode = this.mode;
    const requestSession = this.sessionKey;
    // A replay-unsafe read needs the state check to be the request just before it: any read spends the check.
    if (next.read) this.unsafeCheckFresh = false;
    this.inFlight = true;
    let answer: RestAnswer;
    try { answer = await (this.options.get ?? lmuGet)(next.path); }
    catch { answer = { ok: false as const, reason: 'error' as const }; }
    this.inFlight = false;
    const done = this.now();
    const stale = generation !== this.generation || this.mode === 'off';
    if (stale && !diagnostic) return;
    const parsed = answer.ok ? next.read ? next.read.parse(answer.body) : parseReplayPlayback(answer.body) : null;
    if (diagnostic) {
      const body = answer.ok ? diagnosticBody(next.path, answer.body) : undefined;
      const serialized = body === undefined ? undefined : JSON.stringify(body);
      diagnostic({ kind: 'rest', at: done, data: {
        path: next.path, startedAt: now, finishedAt: done, durationMs: done - now,
        mode: requestMode, sessionKey: requestSession, ...answer.diagnostic,
        outcome: answer.diagnostic?.outcome ?? (answer.ok ? 'ok' : answer.reason),
        parser: !answer.ok ? 'not-run' : parsed === null ? 'rejected' : 'accepted',
        disposition: stale ? 'stale-discarded' : parsed === null ? 'ignored' : 'applied',
        body: serialized && serialized.length > 32768 ? serialized.slice(0, 32768) : body,
        bodyTruncated: (serialized?.length ?? 0) > 32768 || answer.diagnostic?.bodyTruncated === true,
        parsed,
      } });
    }
    if (stale) return;
    // Failed reads go into the recording too, so a race can be debugged later without the console.
    if (!answer.ok) this.options.onEvidence?.({ source: 'rest', kind: 'failure', elapsedSeconds: null, receivedAt: done,
      requestStartedAt: now, requestFinishedAt: done, data: { path: next.path, outcome: answer.diagnostic?.outcome ?? answer.reason,
        statusCode: answer.diagnostic?.statusCode ?? null, errorCode: answer.diagnostic?.errorCode ?? null } });
    if (!answer.ok && answer.reason === 'timeout') this.pausedUntil = done + SLOW_PAUSE_MS;
    if (next.read === null) {
      this.gameStateDue = done + (answer.ok ? REPLAY_CHECK_MS * 2 / 3 : FAILED_READ_PAUSE_MS / 3);
      this.setReplay(typeof parsed === 'boolean' ? parsed : null, done);
      this.unsafeCheckFresh = this.replay === false;
      if (answer.ok && this.replay === false) this.options.onNavigation?.(answer.body);
      return;
    }
    const every = this.period(next.read, this.mode as ReadMode);
    this.due.set(next.path, done + (answer.ok ? every ?? FAILED_READ_PAUSE_MS : Math.max(every ?? 0, FAILED_READ_PAUSE_MS)));
    const update = typeof parsed === 'object' ? parsed : null;
    if (answer.ok && this.options.onEvidence) {
      const evidence = captureRestEvidence(next.path, answer.body);
      if (evidence) this.options.onEvidence({ ...evidence, source: 'rest', elapsedSeconds: null,
        receivedAt: done, requestStartedAt: now, requestFinishedAt: done });
    }
    if (update && next.read.once) this.onceDone.add(next.path);
    if (update) this.options.onUpdate(update);
    // The estimate's tyres and repairs follow the MFD: read it again once the menu changes, not up to a minute later.
    if (update?.type === 'pitMenu') {
      if (this.lastMenu !== null && !isDeepStrictEqual(update.menu, this.lastMenu)) this.trigger('estimate');
      this.lastMenu = update.menu;
    }
  }
}
