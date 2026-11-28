/**
 * The driver's steering force, from the FFB the game sends to the wheel base, and two moments worth a look: the
 * hands holding the wheel still while the force changes ("light hands", trail braking) and the driver pushing against
 * the wheel's angle (passive counter-steer: the wheel turns one way, the hands still push the other). Percent of the
 * wheel base's peak only (driver, 2026-11-26): it compares two laps only at the same in-game FFB strength, which the
 * recording does not hold.
 *
 * Holding a steady angle, the driver's force equals the FFB's, opposite in sign: `driverForcePct = -ffbPct`
 * (positive: the hands push the wheel left, ISO 8855). The wheel's inertia and damping are not modelled; they matter
 * only while the wheel moves quickly, which neither moment is about.
 *
 * Thresholds, measured 2026-11-28 on full-rate DuckDB laps (Spa Q LMGT3 141 s, Sebring Q LMGT3 123 s, a 20-lap
 * Barcelona race), with the wheel in steering-wheel degrees from the run's lock:
 * - `FFB Output` carries road and kerb texture: on straights (wheel within 3°) the force's distance from its 0.5 s
 *   mean is 6.9–10.8 % at p95 raw, 4.1–4.2 % after a centred 0.15 s mean, so the force is that mean.
 * - Its change over 0.1 s on straights after that mean reaches 9.4–11.6 % at p99: the holding-still band is 10 %.
 *   Over a 0.1 s window the rule marked 27 moments on one Spa lap, all 0.11–0.16 s of load change at an apex; over
 *   0.25 s it marks 4 a lap (Spa) and about 2 a lap (Barcelona race, 41), so the window is 0.25 s.
 * - Five of the race's 41 sat on near-straights (wheel within 12°) with the force moving on bumps: holding still
 *   needs the wheel turned at least 10°, a corner.
 * - Passive counter-steer needs the wheel past 2° and the force past 5 % (the force's p95 noise above), opposite in
 *   sign, for 0.1 s: none on the qualifying laps, 14 in the race (one a 2 s spin).
 * Both need 15 km/h, where the balance channel starts too. A kerb strike is a spike of a few samples, which the
 * mean turns into a short slope and a flat stretch (a 60 % spike for 40 ms is a 16 % step over 0.04 s): holding
 * still needs a ramp, the force moving the same way by an eighth of the band in each quarter of the window.
 * With every rule, through the reader (laps over 60 s): holding still 1.3 a lap (Spa Q, 4 laps), 0.2 (Sebring Q, 5),
 * 0.9 (Barcelona race, 18), 0.8 (Le Mans race, 16); passive counter-steer 3, 2, 12 and 42 moments. To confirm with
 * the driver (plan step 6c): the moments land where the driver remembers light hands and counter-steer.
 */

/** Centred mean of the FFB, seconds. */
export const STEERING_FORCE_MEAN_SEC = 0.15;
/** Holding still: the window, the wheel's largest move within it (steering-wheel degrees) and the force change. */
export const HOLD_STILL_WINDOW_SEC = 0.25;
export const HOLD_STILL_MAX_WHEEL_MOVE_DEG = 1;
export const HOLD_STILL_MIN_FORCE_CHANGE_PCT = 10;
export const HOLD_STILL_MIN_WHEEL_DEG = 10;
/** Passive counter-steer: the wheel and the force past these, opposite in sign, for at least the duration. */
export const COUNTER_STEER_MIN_WHEEL_DEG = 2;
export const COUNTER_STEER_MIN_FORCE_PCT = 5;
export const COUNTER_STEER_MIN_SEC = 0.1;
export const STEERING_FORCE_MIN_SPEED_KMH = 15;

export interface SteeringForceInput {
  timeSec: number[];
  /** ISO steering, normalized [-1, 1] (a lap point's `steerYaw` before client processing). */
  steer: number[];
  /** ISO FFB in % of the wheel base's peak; undefined where the recording has none. */
  ffbPct: Array<number | undefined>;
  speedKmh: number[];
  /** The steering wheel's rotation lock to lock (the run's setup, else the plugin default). */
  steeringWheelRangeDeg: number;
}

export interface SteeringForce {
  /** The driver's force, % of the wheel base's peak, ISO sign; undefined where the FFB is. */
  driverForcePct: Array<number | undefined>;
  holdingStill: boolean[];
  passiveCounterSteer: boolean[];
}

export function computeSteeringForce(input: SteeringForceInput): SteeringForce {
  const { timeSec: t, steer, ffbPct, speedKmh } = input;
  const n = t.length;
  const wheelDeg = steer.map(value => (value * input.steeringWheelRangeDeg) / 2);
  const driverForcePct = centredMean(t, ffbPct.map(value => (value === undefined ? undefined : -value)), STEERING_FORCE_MEAN_SEC);
  const holdingStill = new Array<boolean>(n).fill(false);
  const passiveCounterSteer = new Array<boolean>(n).fill(false);
  const fast = (i: number) => speedKmh[i] >= STEERING_FORCE_MIN_SPEED_KMH;

  let end = 0;
  for (let i = 0; i < n; i++) {
    end = Math.max(end, i);
    while (end < n - 1 && t[end] - t[i] < HOLD_STILL_WINDOW_SEC) end++;
    if (t[end] - t[i] < HOLD_STILL_WINDOW_SEC) break;
    const from = driverForcePct[i], to = driverForcePct[end];
    if (from === undefined || to === undefined || Math.abs(to - from) <= HOLD_STILL_MIN_FORCE_CHANGE_PCT) continue;
    if (!isRamp(t, driverForcePct, i, end, Math.sign(to - from))) continue;
    let low = Infinity, high = -Infinity, turned = true;
    for (let j = i; j <= end; j++) {
      low = Math.min(low, wheelDeg[j]);
      high = Math.max(high, wheelDeg[j]);
      if (Math.abs(wheelDeg[j]) < HOLD_STILL_MIN_WHEEL_DEG || !fast(j)) turned = false;
    }
    if (turned && high - low < HOLD_STILL_MAX_WHEEL_MOVE_DEG) holdingStill.fill(true, i, end + 1);
  }

  const against = (i: number) => {
    const force = driverForcePct[i];
    return force !== undefined && fast(i) && Math.abs(wheelDeg[i]) > COUNTER_STEER_MIN_WHEEL_DEG
      && Math.abs(force) > COUNTER_STEER_MIN_FORCE_PCT && Math.sign(force) !== Math.sign(wheelDeg[i]);
  };
  for (let i = 0; i < n; ) {
    if (!against(i)) { i++; continue; }
    let j = i;
    while (j + 1 < n && against(j + 1)) j++;
    if (t[j] - t[i] >= COUNTER_STEER_MIN_SEC) passiveCounterSteer.fill(true, i, j + 1);
    i = j + 1;
  }
  return { driverForcePct: driverForcePct.map(value => (value === undefined ? undefined : Number(value.toFixed(1)) || 0)), holdingStill, passiveCounterSteer };
}

/** The force moves the same way by an eighth of the band in each quarter of the window [from, to]. */
function isRamp(t: number[], force: Array<number | undefined>, from: number, to: number, sign: number): boolean {
  let at = from;
  for (let quarter = 1; quarter <= 4; quarter++) {
    let next = at;
    while (next < to && t[next] - t[from] < (quarter * (t[to] - t[from])) / 4) next++;
    const a = force[at], b = force[next];
    if (a === undefined || b === undefined || ((b - a) * sign) < HOLD_STILL_MIN_FORCE_CHANGE_PCT / 8) return false;
    at = next;
  }
  return true;
}

/** Mean of the defined values within ±span/2 of each sample's time (undefined stays undefined). */
function centredMean(t: number[], values: Array<number | undefined>, spanSec: number): Array<number | undefined> {
  const half = spanSec / 2, out = new Array<number | undefined>(values.length);
  let lo = 0, hi = 0, sum = 0, count = 0;
  for (let i = 0; i < values.length; i++) {
    while (hi < values.length && t[hi] - t[i] <= half) { const v = values[hi++]; if (v !== undefined) { sum += v; count++; } }
    while (t[i] - t[lo] > half) { const v = values[lo++]; if (v !== undefined) { sum -= v; count--; } }
    out[i] = values[i] === undefined || count === 0 ? undefined : sum / count;
  }
  return out;
}
