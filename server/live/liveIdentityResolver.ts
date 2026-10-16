import { resolveLiveIdentity } from '../../shared/domain/live/liveIdentity.js';
import type { LiveNavigation, PersonalBestLookup } from '../../shared/domain/live/liveIdentity.js';
import type { LiveIdentity, LiveSessionInfo } from '../../shared/types/live.js';
import { readNavigationState } from './lmuNavigation.js';
import type { NavigationRead } from './lmuNavigation.js';

/** While a session is loaded the game is asked again this often; a failed or slow answer waits this long too. */
export const NAVIGATION_POLL_MS = 30_000;

export interface LiveIdentityOptions {
  /** The personal-best lookup (the app's history); the service stays testable without SQLite. */
  personalBest: PersonalBestLookup;
  /** Called when the identity changes after an answer from the game. */
  onChange: () => void;
  /** Replaces the REST read (tests). */
  readNavigation?: () => Promise<NavigationRead>;
  now?: () => number;
}

/**
 * Who and where for the loaded session. It resolves at once from the game's own names (track, car), then
 * asks LMU's navigation state for the exact layout: once when a session loads and every 30 s while it stays
 * loaded, one request at a time, backing off 30 s after any failure. Nothing is asked while no session is loaded.
 */
export class LiveIdentityResolver {
  private session: LiveSessionInfo | null = null;
  private key: string | null = null;
  private navigation: LiveNavigation | null = null;
  private current: LiveIdentity | null = null;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private generation = 0;
  private backoffUntil = 0;

  public constructor(private readonly options: LiveIdentityOptions) {}

  public get identity(): LiveIdentity | null { return this.current; }

  /** Follows the loaded session; `session` is null when none is loaded (menu, offline). */
  public update(session: LiveSessionInfo | null): void {
    const key = session ? `${session.sessionCode}|${session.trackName}|${session.vehicleName}|${session.vehicleClass}` : null;
    this.session = session;
    if (key === this.key) return;
    this.key = key;
    this.generation++;
    this.navigation = null;
    this.current = session ? this.resolve(session) : null;
    this.clearTimer();
    if (session && !this.inFlight) this.schedule(Math.max(0, this.backoffUntil - this.now()));
  }

  public stop(): void {
    this.key = null;
    this.session = null;
    this.generation++;
    this.clearTimer();
  }

  private now(): number { return (this.options.now ?? Date.now)(); }

  private resolve(session: LiveSessionInfo): LiveIdentity {
    return resolveLiveIdentity(session, this.navigation, this.options.personalBest);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => { void this.poll(); }, delayMs);
    this.timer.unref();
  }

  private async poll(): Promise<void> {
    this.timer = null;
    if (this.inFlight || !this.session) return;
    this.inFlight = true;
    const generation = this.generation;
    let result: NavigationRead = { ok: false };
    try {
      result = await (this.options.readNavigation ?? readNavigationState)();
    } catch { /* a failed read is a failed read */ }
    this.inFlight = false;
    if (!result.ok) this.backoffUntil = this.now() + NAVIGATION_POLL_MS;
    if (!this.session) return;
    if (generation !== this.generation) {
      // The session changed while asking: the answer belongs to the old one. Ask again unless backing off.
      this.schedule(Math.max(0, this.backoffUntil - this.now()));
      return;
    }
    if (result.ok) this.apply(result.navigation, this.session);
    this.schedule(NAVIGATION_POLL_MS);
  }

  private apply(navigation: LiveNavigation, session: LiveSessionInfo): void {
    this.navigation = navigation;
    const next = this.resolve(session);
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.current = next;
    this.options.onChange();
  }
}
