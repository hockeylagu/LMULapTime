import type { LiveLapRecord } from '../../types/live.js';
import type { LiveCorner, LiveDamage, LiveTyres } from '../../types/liveStrategy.js';
import { NEW_TYRE_RISE } from '../strategy/sessionStrategy.js';

export const CORNERS: readonly LiveCorner[] = ['FL', 'FR', 'RL', 'RR'];

/** The player's car from the shared memory telemetry (wheels in the game's order: FL, FR, RL, RR). */
export interface LiveCarReading {
  fuelLiters: number;
  fuelCapacityLiters: number;
  /** Eight dent slots, 0-2. */
  dentSeverity: number[];
  /** A part has come off. */
  detached: boolean;
  wheels: { flat: boolean; detached: boolean }[];
  /** Session time of the last impact (`mLastImpactET`; 0 before any): a change asks LMU for the condition. */
  lastImpactEt: number;
  /**
   * Tread left per tyre, 0..1 (`mWear`, 1 = new): the same figure as the condition reply's tread, within 0.0001
   * (Silverstone practice 2026-10-25), read every frame without a REST call.
   */
  tread?: number[];
  /** Front compound name as the game reports it. */
  compound: string;
}

/** `getVehicleCondition` (wheels FL, FR, RL, RR). */
export interface LiveVehicleCondition {
  /** Body aero damage. */
  body: number;
  suspension: number[];
  /** Tread left per tyre, 0..1; 0 is flat or destroyed. */
  tires: number[];
}

/** Measured pace loss from this (s/lap) up is worth showing; so is a repair from 30 s up. */
export const PACE_LOSS_SIGNIFICANT = 0.3;
export const REPAIR_SIGNIFICANT = 30;
/** Damage below this (body, suspension) is noise. */
const DAMAGE_EPSILON = 0.01;
/** Laps each side of the impact the pace loss needs. */
const PACE_LAPS = 2;
/** Laps averaged each side. */
const PACE_WINDOW = 3;
/** More tread lost in one lap than this is damage, not wear (normal wear is well under 5% a lap). */
export const MAX_LAP_WEAR = 0.15;

/** One slow lap (an off, traffic) among the window must not read as damage pace. */
const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value: number, digits: number): number => Math.round(value * 10 ** digits) / 10 ** digits;

/** What a later hit can make worse enough to cost pace again: the worst suspension, and wheels or parts lost. */
interface DamageSeverity {
  suspension: number;
  /** Flat or lost wheels plus a detached part. */
  lost: number;
}

/**
 * Damage for the race view: what is damaged, since which lap, the pace it costs (the median of the driver's own valid
 * laps either side of the impact, never guessed) and the repair time the game estimates. The estimate drops every
 * service time while a penalty is pending (the stop is a stop-and-go), so the last repair figure seen is kept.
 *
 * A later hit that makes the suspension worse or costs a wheel or a part moves the impact to its lap, with the laps
 * just before it as the baseline: a scrape on lap 1 must not hide the suspension broken on lap 9 (COTA race
 * 2026-10-21, where the pace loss was never measured because no valid lap came before lap 1).
 */
export class LiveDamageTracker {
  private impactLap: number | null = null;
  private worst: DamageSeverity = { suspension: 0, lost: 0 };
  /** The last valid laps, whatever the damage. */
  private recent: number[] = [];
  private before: number[] = [];
  private after: number[] = [];
  private repair: number | null = null;
  private car: LiveCarReading | null = null;
  private condition: LiveVehicleCondition | null = null;
  private lapNumber = 0;

  public reset(): void {
    this.impactLap = null;
    this.worst = { suspension: 0, lost: 0 };
    this.recent = [];
    this.before = [];
    this.after = [];
    this.repair = null;
    this.car = null;
    this.condition = null;
  }

  public updateCar(car: LiveCarReading | null, lapNumber: number): void {
    this.car = car;
    this.lapNumber = lapNumber;
    this.follow();
  }

  public updateCondition(condition: LiveVehicleCondition | null): void {
    this.condition = condition;
    this.follow();
  }

  /** `pitstop-estimate`: damage seconds counts only while no penalty is pending. */
  public updateEstimate(damageSeconds: number, penalties: number): void {
    if (penalties > 0) return;
    this.repair = damageSeconds > 0 ? round(damageSeconds, 0) : null;
  }

  public lapCompleted(lap: LiveLapRecord): void {
    if (!lap.valid || lap.lapSeconds === null) return;
    if (this.impactLap !== null && lap.lapNumber > this.impactLap) this.after = [...this.after, lap.lapSeconds].slice(-PACE_WINDOW);
    this.recent = [...this.recent, lap.lapSeconds].slice(-PACE_WINDOW);
  }

  private isDamaged(): boolean {
    const { car, condition } = this;
    if (car && (car.detached || car.dentSeverity.some(dent => dent > 0) || car.wheels.some(wheel => wheel.flat || wheel.detached))) return true;
    if (!condition) return false;
    return condition.body > DAMAGE_EPSILON || condition.suspension.some(value => value > DAMAGE_EPSILON) || condition.tires.some(tread => tread <= 0);
  }

  private severity(): DamageSeverity {
    const wheels = this.car?.wheels ?? [];
    const tires = this.condition?.tires ?? [];
    const corners = CORNERS.filter((_, i) => wheels[i]?.flat || wheels[i]?.detached || (tires[i] ?? 1) <= 0).length;
    const suspension = this.condition?.suspension ?? [];
    return { suspension: suspension.length > 0 ? Math.max(...suspension) : 0, lost: corners + (this.car?.detached ? 1 : 0) };
  }

  private follow(): void {
    if (!this.isDamaged()) {
      if (this.impactLap === null) return;
      // Repaired: the pace after the repair is the new baseline.
      this.impactLap = null;
      this.worst = { suspension: 0, lost: 0 };
      this.after = [];
      this.repair = null;
      return;
    }
    const now = this.severity();
    if (this.impactLap === null || now.suspension > this.worst.suspension + DAMAGE_EPSILON || now.lost > this.worst.lost) {
      this.impactLap = this.lapNumber;
      this.before = this.recent;
      this.after = [];
    }
    this.worst = { suspension: Math.max(this.worst.suspension, now.suspension), lost: Math.max(this.worst.lost, now.lost) };
  }

  private wheel(): LiveDamage['wheel'] {
    const wheels = this.car?.wheels ?? [];
    const lost = wheels.findIndex(wheel => wheel.detached);
    if (lost >= 0) return { problem: 'detached', corner: CORNERS[lost] };
    const flatInCar = wheels.findIndex(wheel => wheel.flat);
    const flat = flatInCar >= 0 ? flatInCar : (this.condition?.tires ?? []).findIndex(tread => tread <= 0);
    return flat >= 0 && flat < 4 ? { problem: 'flat', corner: CORNERS[flat] } : null;
  }

  /** Null while undamaged. `lapsLeft` is the race laps left (null outside races). */
  public damage(completedLaps: number, lapsLeft: number | null): LiveDamage | null {
    if (this.impactLap === null) return null;
    const pace = this.before.length >= PACE_LAPS && this.after.length >= PACE_LAPS
      ? Math.max(0, round(median(this.after) - median(this.before), 1)) : null;
    const wheel = this.wheel();
    const condition = this.condition;
    return {
      wheel,
      body: condition ? round(condition.body, 2) : null,
      suspension: condition && condition.suspension.length > 0 ? round(Math.max(...condition.suspension), 2) : null,
      partsDetached: this.car?.detached ?? false,
      impactLap: this.impactLap,
      lapsSinceImpact: Math.max(0, completedLaps - this.impactLap + 1),
      paceLossPerLap: pace,
      lossToFinish: pace !== null && lapsLeft !== null ? round(pace * lapsLeft, 1) : null,
      repairSeconds: this.repair,
      significant: wheel !== null || (pace ?? 0) >= PACE_LOSS_SIGNIFICANT || (this.repair ?? 0) >= REPAIR_SIGNIFICANT,
    };
  }
}

/**
 * Tyre state per wheel: compound, the most worn tyre, and each wheel's wear per lap: the median lap of its own stint, so
 * a spin or lockup lap (11% off one tyre in a lap, Silverstone 2026-10-25), already in the tread, is not projected again.
 */
export class LiveTyreTracker {
  private stints: number[][] = [[], [], [], []];

  public reset(): void { this.stints = [[], [], [], []]; }

  /** At each line crossing, with the tread left per wheel (FL, FR, RL, RR). */
  public lapCompleted(tread: readonly number[] | undefined): void {
    if (tread?.length !== 4) return;
    tread.forEach((value, index) => {
      const stint = this.stints[index];
      const last = stint[stint.length - 1];
      // Any rise is a new tyre: shared memory reads the tread exactly, so the native measurement's threshold applies
      // (fresh tyres after a 5-lap stint rose only 0.015, Silverstone 2026-10-25).
      if (last !== undefined && value > last + NEW_TYRE_RISE) this.stints[index] = [];
      // A drop no lap of wear makes is a puncture or a lost wheel, not wear: that wheel's wear starts again from the
      // next tyre (seen live 2026-10-16: a flat read 0, and its 49% a lap of "wear" left the fitted set at 0% to the finish).
      else if (last !== undefined && last - value > MAX_LAP_WEAR) { this.stints[index] = []; return; }
      this.stints[index].push(value);
    });
  }

  public tyres(compound: string | null, tread: readonly number[] | undefined, newSets: number | null): LiveTyres {
    const known = tread?.length === 4 ? tread : null;
    const worst = known ? Math.min(...known) : null;
    const index = known && worst !== null ? known.indexOf(worst) : -1;
    const wheels = CORNERS.map((corner, i) => {
      const stint = this.stints[i];
      const losses = stint.slice(1).map((value, lap) => stint[lap] - value);
      return { corner, tread: known ? round(known[i], 3) : null, wearPerLap: losses.length >= 2 ? round(median(losses), 4) : null };
    });
    const rates = wheels.flatMap(wheel => (wheel.wearPerLap === null ? [] : [wheel.wearPerLap]));
    return {
      compound: compound || null,
      worst: worst === null ? null : round(worst, 3),
      worstCorner: index >= 0 ? CORNERS[index] : null,
      wearPerLap: rates.length > 0 ? Math.max(...rates) : null,
      wheels,
      newSets,
    };
  }
}
