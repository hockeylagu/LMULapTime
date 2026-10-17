import type { LiveRestUpdate } from '../../shared/domain/live/liveStrategyTracker.js';
import { parseReplayPlayback } from './lmuNavigation.js';
import {
  lmuGet, parseEstimate, parseForecast, parseGarageData, parsePitMenu, parsePitStopTimes,
  parseStandings, parseTireManagement, parseVehicleCondition,
} from './lmuPitRest.js';
import type { RestGet } from './lmuPitRest.js';

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

interface PitRead {
  path: string;
  /** Period per mode, ms; absent when the read is not made in that mode. */
  every: Partial<Record<Exclude<PitPollMode, 'off'>, number>>;
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

/** About 0.7 requests a second on track, less in the garage. */
const READS: PitRead[] = [
  { path: '/rest/watch/standings', every: { track: 3000 }, crashesInReplay: false, parse: parseStandings },
  { path: '/rest/strategy/pitstop-estimate', every: { track: 10_000 }, crashesInReplay: false, parse: parseEstimate },
  {
    path: '/rest/garage/PitMenu/receivePitMenu', every: { track: 10_000, garage: 10_000 }, crashesInReplay: false,
    parse: body => { const menu = parsePitMenu(body); return menu && { type: 'pitMenu', menu }; },
  },
  {
    path: '/rest/garage/getVehicleCondition', every: { track: 10_000 }, crashesInReplay: true,
    parse: body => { const condition = parseVehicleCondition(body); return condition && { type: 'condition', condition }; },
  },
  { path: '/rest/garage/UIScreen/TireManagement', every: { track: 30_000, garage: 20_000 }, crashesInReplay: false, parse: parseTireManagement },
  { path: '/rest/garage/UIScreen/RepairAndRefuel', every: { track: 120_000 }, crashesInReplay: false, parse: parsePitStopTimes },
  { path: '/rest/garage/getPlayerGarageData', every: { garage: 5000 }, crashesInReplay: false, parse: parseGarageData },
  { path: '/rest/sessions/weather', every: { track: 60_000, garage: 60_000 }, crashesInReplay: false, parse: parseForecast },
];

export interface LivePitPollerOptions {
  onUpdate(update: LiveRestUpdate): void;
  /** Whether a replay is playing changed (`navigation/state` `settingMode`; null when unknown). */
  onReplay(active: boolean | null): void;
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

  public constructor(private readonly options: LivePitPollerOptions) {}

  private now(): number { return (this.options.now ?? Date.now)(); }

  public setMode(mode: PitPollMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.generation++;
    this.due.clear();
    this.gameStateDue = 0;
    this.unsafeCheckFresh = false;
    if (mode === 'off') {
      this.clearTimer();
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
      const every = read.every[mode];
      if (every === undefined || (read.crashesInReplay && this.replay !== false)) continue;
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
    // A replay-unsafe read needs the state check to be the request just before it: any read spends the check.
    if (next.read) this.unsafeCheckFresh = false;
    this.inFlight = true;
    const answer = await (this.options.get ?? lmuGet)(next.path);
    this.inFlight = false;
    if (generation !== this.generation || this.mode === 'off') return;
    const done = this.now();
    if (!answer.ok && answer.reason === 'timeout') this.pausedUntil = done + SLOW_PAUSE_MS;
    if (next.read === null) {
      this.gameStateDue = done + (answer.ok ? REPLAY_CHECK_MS * 2 / 3 : FAILED_READ_PAUSE_MS / 3);
      this.setReplay(answer.ok ? parseReplayPlayback(answer.body) : null, done);
      this.unsafeCheckFresh = this.replay === false;
      return;
    }
    const every = next.read.every[this.mode] ?? FAILED_READ_PAUSE_MS;
    this.due.set(next.path, done + (answer.ok ? every : Math.max(every, FAILED_READ_PAUSE_MS)));
    const update = answer.ok ? next.read.parse(answer.body) : null;
    if (update) this.options.onUpdate(update);
  }
}
