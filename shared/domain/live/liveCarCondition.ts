import type { LiveLapRecord } from '../../types/live.js';
import type { LiveCorner, LiveDamage, LiveTyres } from '../../types/liveStrategy.js';

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
/** A rise of the worst tyre's tread above this means new tyres: a new stint. */
const NEW_TYRES_RISE = 0.05;

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (value: number, digits: number): number => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Damage for the race view: what is damaged, since which lap, the pace it costs (measured on the driver's own valid
 * laps either side of the impact, never guessed) and the repair time the game estimates. The estimate drops every
 * service time while a penalty is pending (the stop is a stop-and-go), so the last repair figure seen is kept.
 */
export class LiveDamageTracker {
  private impactLap: number | null = null;
  private before: number[] = [];
  private after: number[] = [];
  private repair: number | null = null;
  private car: LiveCarReading | null = null;
  private condition: LiveVehicleCondition | null = null;
  private lapNumber = 0;

  public reset(): void {
    this.impactLap = null;
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
    if (this.impactLap === null) {
      this.before = [...this.before, lap.lapSeconds].slice(-PACE_WINDOW);
    } else if (lap.lapNumber > this.impactLap) {
      this.after = [...this.after, lap.lapSeconds].slice(-PACE_WINDOW);
    }
  }

  private isDamaged(): boolean {
    const { car, condition } = this;
    if (car && (car.detached || car.dentSeverity.some(dent => dent > 0) || car.wheels.some(wheel => wheel.flat || wheel.detached))) return true;
    if (!condition) return false;
    return condition.body > DAMAGE_EPSILON || condition.suspension.some(value => value > DAMAGE_EPSILON) || condition.tires.some(tread => tread <= 0);
  }

  private follow(): void {
    const damaged = this.isDamaged();
    if (damaged && this.impactLap === null) {
      this.impactLap = this.lapNumber;
      this.after = [];
    } else if (!damaged && this.impactLap !== null) {
      // Repaired: the pace after the repair is the new baseline.
      this.impactLap = null;
      this.after = [];
      this.repair = null;
    }
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
      ? Math.max(0, round(mean(this.after) - mean(this.before), 1)) : null;
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

/** Tyre state: compound, the most worn tyre and its wear per lap over this stint. */
export class LiveTyreTracker {
  private stint: number[] = [];

  public reset(): void { this.stint = []; }

  /** At each line crossing, with the tread left on the most worn tyre. */
  public lapCompleted(worst: number | null): void {
    if (worst === null) return;
    const last = this.stint[this.stint.length - 1];
    if (last !== undefined && worst > last + NEW_TYRES_RISE) this.stint = [];
    this.stint.push(worst);
  }

  public tyres(compound: string | null, condition: LiveVehicleCondition | null, newSets: number | null): LiveTyres {
    const tires = condition?.tires ?? [];
    const worst = tires.length > 0 ? Math.min(...tires) : null;
    const index = worst === null ? -1 : tires.indexOf(worst);
    const laps = this.stint.length - 1;
    return {
      compound: compound || null,
      worst: worst === null ? null : round(worst, 3),
      worstCorner: index >= 0 && index < 4 ? CORNERS[index] : null,
      wearPerLap: laps >= 2 ? round((this.stint[0] - this.stint[laps]) / laps, 4) : null,
      newSets,
    };
  }
}

/** The tread left on the most worn tyre, 0..1, or null. */
export function worstTread(condition: LiveVehicleCondition | null): number | null {
  return condition && condition.tires.length > 0 ? Math.min(...condition.tires) : null;
}
