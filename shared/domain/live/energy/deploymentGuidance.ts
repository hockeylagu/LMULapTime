export interface DeploymentSample {
  /** Session clock, seconds. */
  time: number;
  /** Distance driven in the session, meters (completed laps × lap length + lap distance). */
  distance: number;
  lapLength: number;
  /** Battery charge, percent. */
  charge: number;
  current: number;
}

/** Tuning only; these are not calibrated vehicle limits. Percent of the battery, held by the lap-average charge. */
export const DEPLOYMENT_RANGE = [20, 80] as const;
/** The next setting shows only in the last few laps before its change. */
export const DEPLOYMENT_CYCLE_HORIZON = 3;
/** Advice withdraws once the lap-average charge is back inside this band, without the edge in the next laps. */
const RECOVERED = [30, 70] as const;

/**
 * Continuous deployment controller over the charge readings. Inside a lap the charge swings far more than it changes
 * over one (Spa practice 2026-10-27: 52% at the line, 6% before the next one), so trend and level always span exactly
 * one lap of track: the change per second is the charge now against the same track point one lap ago, the level is the
 * average over that lap. It cycles edge to edge: deplete on one setting down to the low edge, charge on the next lower
 * one up to the high edge, with long holds between changes, and never steers toward the middle of the range. The
 * advice comes as soon as the level is a lap from an edge, anywhere on the lap.
 */
export class DeploymentGuidance {
  private readonly settings: readonly number[];
  private window: DeploymentSample[] = [];
  private target: number | null = null;
  private settling = false;
  private lap: { seconds: number; change: number; level: number } | null = null;

  public constructor(settings: readonly number[]) {
    this.settings = settings.length >= 2 && settings.every((value, index) => Number.isFinite(value) && value >= 0
      && (index === 0 || value > settings[index - 1])) ? [...settings] : [];
  }

  public observe(sample: DeploymentSample): void {
    if (!Number.isFinite(sample.charge) || sample.charge < 0 || sample.charge > 100 || !this.settings.includes(sample.current)
      || !(sample.lapLength > 0) || !Number.isFinite(sample.time) || !Number.isFinite(sample.distance)) {
      this.reset(); return;
    }
    const previous = this.window.at(-1);
    if (previous && previous.current !== sample.current) {
      // The driver changed the setting: measure the new one over a full lap before advising again.
      this.reset(); this.window = [sample]; this.target = sample.current; this.settling = true; return;
    }
    // Lap distance dips below zero just after the line (Spa: -63 m): a reading that does not move forward is skipped.
    if (previous && (sample.distance <= previous.distance || sample.time <= previous.time)) return;
    // Half a lap between readings is not driving (a jump or a long gap): measure again from here.
    if (previous && sample.distance - previous.distance > sample.lapLength / 2) this.reset();
    this.window.push(sample);
    const start = sample.distance - sample.lapLength;
    // Keep one sample at or before the point a lap back, to interpolate it.
    while (this.window.length > 2 && this.window[1].distance <= start) this.window.shift();
    if (this.window[0].distance > start) return;
    this.lap = lapOf(this.window, start);
    if (this.settling) { this.settling = false; this.target = null; }
    const seconds = this.edgeSeconds;
    if (seconds === null) return;
    if (this.target !== null) {
      const level = this.lap.level;
      if (level >= RECOVERED[0] && level <= RECOVERED[1] && seconds > this.lap.seconds * 2) this.target = null;
      return;
    }
    if (seconds <= this.lap.seconds) {
      const index = this.settings.indexOf(sample.current) + (this.lap.change > 0 ? 1 : -1);
      this.target = this.settings[Math.max(0, Math.min(this.settings.length - 1, index))];
    }
  }

  /** Net charge change over the last lap, percentage points; null until a full lap is measured. */
  public get changePerLap(): number | null { return this.lap?.change ?? null; }

  /** The range edge the lap-average charge is heading for; null without a trend. */
  public get edge(): number | null {
    const change = this.lap?.change ?? 0;
    return change > 0 ? DEPLOYMENT_RANGE[1] : change < 0 ? DEPLOYMENT_RANGE[0] : null;
  }

  /** Seconds until the lap-average charge reaches the edge at the current rate (0 when already past it). */
  public get edgeSeconds(): number | null {
    const edge = this.edge;
    if (!this.lap || edge === null || !(this.lap.seconds > 0)) return null;
    return Math.max(0, (edge - this.lap.level) / (this.lap.change / this.lap.seconds));
  }

  /**
   * The setting the next change will move to (one step up when charging toward full, one down when depleting), in the
   * last laps before it is advised (a lap before the edge) only.
   */
  public get next(): number | null {
    const current = this.window.at(-1)?.current;
    const seconds = this.edgeSeconds;
    if (!this.lap || seconds === null || current === undefined || this.target !== null || this.settling
      || seconds > this.lap.seconds * (1 + DEPLOYMENT_CYCLE_HORIZON)) return null;
    const index = this.settings.indexOf(current) + (this.lap.change > 0 ? 1 : -1);
    return index >= 0 && index < this.settings.length ? this.settings[index] : null;
  }

  /** Seconds until the next change is advised (a lap before the edge), while `next` names it. */
  public get changeSeconds(): number | null {
    const seconds = this.edgeSeconds;
    return this.next === null || seconds === null || !this.lap ? null : Math.max(0, seconds - this.lap.seconds);
  }

  public get advice(): { current: number | null; target: number | null; settlingLaps: number } {
    const current = this.window.at(-1)?.current ?? null;
    return { current, target: this.target ?? (this.lap ? current : null), settlingLaps: this.settling ? 1 : 0 };
  }

  public reset(): void {
    this.window = []; this.target = null; this.settling = false; this.lap = null;
  }
}

/** The lap ending at the newest sample: seconds, net change and time-weighted average charge from `start` on. */
function lapOf(window: readonly DeploymentSample[], start: number): { seconds: number; change: number; level: number } {
  const [first, second] = window;
  const share = second.distance > first.distance ? (start - first.distance) / (second.distance - first.distance) : 0;
  const from = { time: first.time + (second.time - first.time) * share, charge: first.charge + (second.charge - first.charge) * share };
  const last = window[window.length - 1];
  let area = 0;
  let time = from.time;
  let charge = from.charge;
  for (const sample of window.slice(1)) {
    area += (sample.time - time) * (sample.charge + charge) / 2;
    time = sample.time; charge = sample.charge;
  }
  const seconds = last.time - from.time;
  return { seconds, change: last.charge - from.charge, level: seconds > 0 ? area / seconds : last.charge };
}
