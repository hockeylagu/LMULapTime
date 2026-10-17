/** A sample this close (session seconds) to a line crossing is taken as the amount at the crossing. */
const NEAR_SECONDS = 1;
/** Two samples further apart than this do not interpolate a crossing between them. */
const MAX_BRACKET_SECONDS = 12;
/** Samples kept: enough to bracket the last crossings at a sample every 1-2 s. */
const MAX_SAMPLES = 120;
/** Representative laps kept per event. */
const MAX_USES = 30;
/** The per-lap figure is the mean of this many most recent laps ("LAST 3"). */
export const USAGE_WINDOW = 3;

interface Sample { et: number; amount: number }
interface Crossing {
  /** Laps completed at this crossing. */
  lap: number;
  et: number;
  /** The lap that ends here ran through the pit lane or under caution: its use is not representative. */
  excluded: boolean;
  amount: number | null;
}

const round = (value: number, digits: number): number => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Measures the use of one resource (VE percent or fuel litres) per lap. The amount is sampled every second or two
 * (`addSample`), the line crossings come from the scoring (`addCrossing`); the amount at each crossing is
 * interpolated between the samples around it, so the sampling rate does not bias a lap. A lap's use is the
 * difference between the amounts at its two crossings; laps through the pits or under caution, refuelled laps
 * (the amount rose) and laps with a crossing that cannot be bracketed are left out. A session clock that goes back
 * (a new session) clears the samples and crossings but keeps the measured laps: the event's laps stay the reference.
 */
export class LiveUsageMeter {
  private samples: Sample[] = [];
  private crossings: Crossing[] = [];
  private uses: number[] = [];
  private newestUse: { lap: number; et: number; amount: number } | null = null;
  public get latestUse() { return this.newestUse; }
  /** Discard crossings on session changes, retain learned event consumption. */
  public restart(): void { this.samples = []; this.crossings = []; this.newestUse = null; }

  /** Representative laps measured so far (oldest first). */
  public get laps(): readonly number[] { return this.uses; }

  /** Mean of the last three representative laps, or null before the first. */
  public perLap(): number | null {
    const recent = this.uses.slice(-USAGE_WINDOW);
    return recent.length === 0 ? null : round(recent.reduce((sum, use) => sum + use, 0) / recent.length, 3);
  }

  /** Clears everything, measured laps included (another layout or car). */
  public clear(): void {
    this.restart();
    this.uses = [];
  }

  public addSample(et: number, amount: number): void {
    if (!Number.isFinite(et) || !Number.isFinite(amount)) return;
    const last = this.samples[this.samples.length - 1];
    if (last && et < last.et - NEAR_SECONDS) {
      this.restart();
    }
    if (last && Math.abs(et - last.et) < 1e-6) last.amount = amount;
    else this.samples.push({ et, amount });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    this.resolve();
  }

  public addCrossing(lap: number, et: number, excluded: boolean): void {
    const last = this.crossings[this.crossings.length - 1];
    if (last && (lap <= last.lap || et < last.et)) this.crossings = [];
    this.crossings.push({ lap, et, excluded, amount: null });
    if (this.crossings.length > 4) this.crossings.shift();
    this.resolve();
  }

  private amountAt(et: number): number | null {
    let before: Sample | null = null;
    let after: Sample | null = null;
    for (const sample of this.samples) {
      if (sample.et <= et) before = sample;
      else { after = sample; break; }
    }
    if (before && et - before.et <= NEAR_SECONDS && (!after || after.et - et > NEAR_SECONDS)) return before.amount;
    if (after && after.et - et <= NEAR_SECONDS && !before) return after.amount;
    if (!before || !after || after.et - before.et > MAX_BRACKET_SECONDS) return null;
    return before.amount + (after.amount - before.amount) * ((et - before.et) / (after.et - before.et));
  }

  private resolve(): void {
    const newest = this.samples[this.samples.length - 1];
    for (let i = 0; i < this.crossings.length; i++) {
      const crossing = this.crossings[i];
      if (crossing.amount !== null || !newest || newest.et < crossing.et) continue;
      crossing.amount = this.amountAt(crossing.et);
      const previous = this.crossings[i - 1];
      if (!previous || previous.amount === null || crossing.amount === null) continue;
      if (crossing.lap !== previous.lap + 1 || crossing.excluded) continue;
      const use = previous.amount - crossing.amount;
      if (use <= 0) continue;
      this.uses.push(round(use, 4));
      this.newestUse = { lap: crossing.lap, et: crossing.et, amount: use };
      if (this.uses.length > MAX_USES) this.uses.shift();
    }
  }
}
