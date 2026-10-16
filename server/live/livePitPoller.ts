import type { LiveRestUpdate } from '../../shared/domain/live/liveStrategyTracker.js';
import {
  lmuGet, parseEstimate, parseForecast, parseGarageData, parsePitMenu, parsePitStopTimes, parseReplayActive,
  parseStandings, parseTireManagement, parseVehicleCondition,
} from './lmuPitRest.js';
import type { RestGet } from './lmuPitRest.js';

/** What the poller reads: nothing, the on-track set, or the garage set (between runs, before the car leaves). */
export type PitPollMode = 'off' | 'track' | 'garage';

/** One request at most this often, all reads together (the gentle rule for LMU's REST API). */
export const PIT_POLL_TICK_MS = 1000;
/** Garage reads need a `GetGameState` this recent that says no replay is playing. */
export const REPLAY_CHECK_MS = 15_000;
/** A slow answer pauses every read this long; a refused or failed one pauses only that read. */
export const SLOW_PAUSE_MS = 10_000;
export const FAILED_READ_PAUSE_MS = 30_000;

interface PitRead {
  path: string;
  /** Period per mode, ms; absent when the read is not made in that mode. */
  every: Partial<Record<Exclude<PitPollMode, 'off'>, number>>;
  /** Under `/rest/garage`: never during a replay. */
  garage: boolean;
  parse(body: unknown): LiveRestUpdate | null;
}

const GAME_STATE_PATH = '/rest/sessions/GetGameState';

/** About 0.7 requests a second on track, less in the garage. */
const READS: PitRead[] = [
  { path: '/rest/watch/standings', every: { track: 3000 }, garage: false, parse: parseStandings },
  { path: '/rest/strategy/pitstop-estimate', every: { track: 10_000 }, garage: false, parse: parseEstimate },
  {
    path: '/rest/garage/PitMenu/receivePitMenu', every: { track: 10_000 }, garage: true,
    parse: body => { const menu = parsePitMenu(body); return menu && { type: 'pitMenu', menu }; },
  },
  {
    path: '/rest/garage/getVehicleCondition', every: { track: 10_000 }, garage: true,
    parse: body => { const condition = parseVehicleCondition(body); return condition && { type: 'condition', condition }; },
  },
  { path: '/rest/garage/UIScreen/TireManagement', every: { track: 30_000, garage: 20_000 }, garage: true, parse: parseTireManagement },
  { path: '/rest/garage/UIScreen/RepairAndRefuel', every: { track: 120_000 }, garage: true, parse: parsePitStopTimes },
  { path: '/rest/garage/getPlayerGarageData', every: { garage: 5000 }, garage: true, parse: parseGarageData },
  { path: '/rest/sessions/weather', every: { track: 60_000, garage: 60_000 }, garage: false, parse: parseForecast },
];

export interface LivePitPollerOptions {
  onUpdate(update: LiveRestUpdate): void;
  /** `GetGameState.isReplayActive` changed (null when unknown). */
  onReplay(active: boolean | null): void;
  /** Replaces the HTTP read (tests). */
  get?: RestGet;
  now?: () => number;
}

/**
 * Reads LMU's pit, MFD, damage, tyre and forecast data while a session is loaded and a dashboard is open: one
 * request at a time, at most one a second, the most overdue read first. `/rest/garage/*` reads only follow a
 * `GetGameState` of the last 15 s that says no replay is playing (garage reads crashed LMU during a replay); every
 * other answer is welcome. A slow answer pauses everything 10 s; a failed one pauses that read 30 s.
 */
export class LivePitPoller {
  private mode: PitPollMode = 'off';
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private generation = 0;
  private pausedUntil = 0;
  private replay: boolean | null = null;
  private replayCheckedAt = -Infinity;
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
    if (now >= this.gameStateDue) return { path: GAME_STATE_PATH, read: null };
    // A replay playing: nothing but the game state until it ends.
    if (this.replay === true) return null;
    const garageAllowed = this.replay === false && now - this.replayCheckedAt <= REPLAY_CHECK_MS;
    let best: PitRead | null = null;
    let bestLate = -Infinity;
    for (const read of READS) {
      const every = read.every[mode];
      if (every === undefined || (read.garage && !garageAllowed)) continue;
      const late = (now - (this.due.get(read.path) ?? 0)) / every;
      if (late >= 0 && late > bestLate) { best = read; bestLate = late; }
    }
    return best && { path: best.path, read: best };
  }

  private async tick(): Promise<void> {
    const now = this.now();
    if (this.inFlight || now < this.pausedUntil) return;
    const next = this.next(now);
    if (!next) return;
    const generation = this.generation;
    this.inFlight = true;
    const answer = await (this.options.get ?? lmuGet)(next.path);
    this.inFlight = false;
    if (generation !== this.generation || this.mode === 'off') return;
    const done = this.now();
    if (!answer.ok && answer.reason === 'timeout') this.pausedUntil = done + SLOW_PAUSE_MS;
    if (next.read === null) {
      this.gameStateDue = done + (answer.ok ? REPLAY_CHECK_MS * 2 / 3 : FAILED_READ_PAUSE_MS / 3);
      this.setReplay(answer.ok ? parseReplayActive(answer.body) : null, done);
      return;
    }
    const every = next.read.every[this.mode] ?? FAILED_READ_PAUSE_MS;
    this.due.set(next.path, done + (answer.ok ? every : Math.max(every, FAILED_READ_PAUSE_MS)));
    const update = answer.ok ? next.read.parse(answer.body) : null;
    if (update) this.options.onUpdate(update);
  }
}
