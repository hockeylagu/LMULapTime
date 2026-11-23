import type { LiveFieldCar } from '../../../../types/liveField.js';

/** Lap distance bins of the speed profiles and the player's line. */
const BIN_M = 20;
/** How fast a profile follows new laps. */
const PROFILE_RATE = 0.05;
/** Readings a field bin needs before its speed counts. */
const PROFILE_MIN_COUNT = 10;
/** The window a car's speed is measured over: its progress along the lap, so a frozen car reads 0. */
const SPEED_WINDOW_S = 1;
/** Slower than this share of the field's speed at that spot is slow (Portimão 2026-10-29: 36 of 47 hits near a yellow). */
export const SLOW_SHARE = 0.5;
/** Below this a car counts as stopped, with or without a profile. */
export const STOPPED_MS = 3;
/** How long a car stays slow before it is called: online cars are interpolated, and a short freeze recovers. */
const CONFIRM_S = 1.5;
/**
 * A car that froze and jumped on (a lagging connection, 25 online races 2026-11-21: 2.7 s median, 90 % under 6.6 s)
 * waits this long instead on its next stall.
 */
const LAGGING_CONFIRM_S = 4.5;
/** A jump this far in one reading after a stall is a freeze catching up, not driving. */
const JUMP_M = 80;
/** Beyond the track edge by more than this is off track (online `pathLateral` noise and kerbs, 2026-10-29). */
const OFF_MARGIN_M = 3;

export interface CarMotion {
  car: LiveFieldCar;
  /** Lap distance unwrapped over the lap line. */
  progress: number;
  /** Metres per second over the last second of progress. */
  speed: number;
  /** Since when the car has been slow; null while it is not. */
  slowSince: number | null;
  /** Since when the car has been off track; null while it is on. */
  offSince: number | null;
  /** When an off track that lasted a second ended: a car rejoining. */
  rejoinedAt: number | null;
  /** The car froze and jumped on before: its next stall waits longer. */
  lagging: boolean;
  history: Array<{ t: number; progress: number }>;
}

const wrap = (delta: number, length: number) => (delta > length / 2 ? delta - length : delta < -length / 2 ? delta + length : delta);

/** Metres from `from` forward to `to` along the lap, 0..length. */
export const aheadOf = (from: number, to: number, length: number) => ((to - from) % length + length) % length;

/**
 * Every car's motion along the lap and what the field shows of the track: the field's speed at each spot (what slow
 * means there), the player's own speed and line by lap distance, the sector starts and the player's lap time.
 */
export class FieldTrack {
  public length = 0;
  public now = 0;
  public readonly cars = new Map<number, CarMotion>();
  public player: CarMotion | null = null;
  private fieldSpeed = new Float64Array(0);
  private fieldCount = new Uint32Array(0);
  private playerSpeed = new Float64Array(0);
  private playerLine = new Float64Array(0);
  private playerLineSet = new Uint8Array(0);
  public playerTop = 0;
  /** Where sectors 2 and 3 start: the least lap distance a car was seen in them. */
  public sectorStart: [number, number] = [Infinity, Infinity];
  private lapStartedAt: number | null = null;
  private playerLaps: number | null = null;
  public readonly lapTimes: number[] = [];

  public observe(t: number, length: number, cars: readonly LiveFieldCar[]): void {
    if (length !== this.length) this.reset(length);
    this.now = t;
    const seen = new Set<number>();
    for (const car of cars) {
      seen.add(car.id);
      const motion = this.move(car, t);
      if (car.isPlayer) this.followPlayer(motion, t);
      if (car.sector === 2 && car.lapDist > 0) this.sectorStart[0] = Math.min(this.sectorStart[0], car.lapDist);
      if (car.sector === 0 && car.lapDist > 0) this.sectorStart[1] = Math.min(this.sectorStart[1], car.lapDist);
    }
    for (const id of this.cars.keys()) if (!seen.has(id)) this.cars.delete(id);
    if (this.player && !seen.has(this.player.car.id)) this.player = null;
  }

  private reset(length: number): void {
    this.length = length;
    const bins = Math.max(1, Math.ceil(length / BIN_M) + 1);
    this.fieldSpeed = new Float64Array(bins);
    this.fieldCount = new Uint32Array(bins);
    this.playerSpeed = new Float64Array(bins);
    this.playerLine = new Float64Array(bins);
    this.playerLineSet = new Uint8Array(bins);
    this.playerTop = 0;
    this.sectorStart = [Infinity, Infinity];
    this.cars.clear();
    this.player = null;
    this.lapTimes.length = 0;
    this.lapStartedAt = null;
    this.playerLaps = null;
  }

  private bin(lapDist: number): number {
    const at = ((lapDist % this.length) + this.length) % this.length;
    return Math.min(this.fieldSpeed.length - 1, Math.floor(at / BIN_M));
  }

  private move(car: LiveFieldCar, t: number): CarMotion {
    let motion = this.cars.get(car.id);
    const last = motion?.history.at(-1)?.t ?? t;
    // Unseen for a while, or the clock went back (a restart): start the car again.
    if (!motion || t - last > 5 || last > t) {
      motion = { car, progress: car.lapDist, speed: car.speed, slowSince: null, offSince: null, rejoinedAt: null,
        lagging: motion?.lagging ?? false, history: [] };
      this.cars.set(car.id, motion);
    }
    const step = wrap(car.lapDist - motion.car.lapDist, this.length);
    if (motion.history.length > 0 && step > JUMP_M && motion.slowSince !== null) {
      // A stalled car that jumps on was frozen by its connection, not stopped.
      motion.lagging = true;
      motion.slowSince = null;
      motion.history = [];
    }
    motion.car = car;
    motion.progress += motion.history.length > 0 ? step : 0;
    motion.history.push({ t, progress: motion.progress });
    while (motion.history.length > 2 && t - motion.history[1].t >= SPEED_WINDOW_S) motion.history.shift();
    const first = motion.history[0];
    motion.speed = t - first.t >= SPEED_WINDOW_S * 0.5 ? (motion.progress - first.progress) / (t - first.t) : car.speed;
    const running = !car.inPits && !car.inGarage && car.finishStatus === 0 && car.lapDist >= 0;
    const reference = this.fieldSpeedAt(car.lapDist);
    const slow = running && (motion.speed < STOPPED_MS || (reference !== null && motion.speed < reference * SLOW_SHARE));
    motion.slowSince = slow ? motion.slowSince ?? t : null;
    const off = running && Math.abs(car.pathLateral) > Math.abs(car.trackEdge) + OFF_MARGIN_M;
    // A real off, not a wide line over the kerb: two seconds beyond the edge.
    if (!off && motion.offSince !== null && t - motion.offSince >= 2) motion.rejoinedAt = t;
    motion.offSince = off ? motion.offSince ?? t : null;
    if (running && !slow && !car.isPlayer) {
      const bin = this.bin(car.lapDist);
      this.fieldSpeed[bin] = this.fieldCount[bin] === 0 ? motion.speed : this.fieldSpeed[bin] + PROFILE_RATE * (motion.speed - this.fieldSpeed[bin]);
      this.fieldCount[bin] += 1;
    }
    return motion;
  }

  private followPlayer(motion: CarMotion, t: number): void {
    this.player = motion;
    const car = motion.car;
    if (this.playerLaps !== null && car.totalLaps === this.playerLaps + 1) {
      if (this.lapStartedAt !== null && !car.inPits) this.lapTimes.push(t - this.lapStartedAt);
      if (this.lapTimes.length > 3) this.lapTimes.shift();
      this.lapStartedAt = t;
    } else if (this.playerLaps !== car.totalLaps) this.lapStartedAt = null;
    this.playerLaps = car.totalLaps;
    if (car.inPits || car.inGarage || car.lapDist < 0 || motion.speed < 10) return;
    const bin = this.bin(car.lapDist);
    this.playerSpeed[bin] = this.playerSpeed[bin] === 0 ? motion.speed : this.playerSpeed[bin] + 0.3 * (motion.speed - this.playerSpeed[bin]);
    this.playerTop = Math.max(this.playerTop, this.playerSpeed[bin]);
    this.playerLine[bin] = this.playerLineSet[bin] ? this.playerLine[bin] + 0.3 * (car.pathLateral - this.playerLine[bin]) : car.pathLateral;
    this.playerLineSet[bin] = 1;
  }

  /** The field's usual speed at a spot; null until enough cars passed it. */
  public fieldSpeedAt(lapDist: number): number | null {
    if (this.length <= 0) return null;
    const bin = this.bin(lapDist);
    return this.fieldCount[bin] >= PROFILE_MIN_COUNT ? this.fieldSpeed[bin] : null;
  }

  /** The player's usual speed at a spot; null before they drove it. */
  public playerSpeedAt(lapDist: number): number | null {
    const value = this.length > 0 ? this.playerSpeed[this.bin(lapDist)] : 0;
    return value > 0 ? value : null;
  }

  /** The player's usual line at a spot, metres right of the centre path; null before they drove it. */
  public playerLineAt(lapDist: number): number | null {
    const bin = this.length > 0 ? this.bin(lapDist) : -1;
    return bin >= 0 && this.playerLineSet[bin] ? this.playerLine[bin] : null;
  }

  /** The player's lap time: the median of their last three timed laps. */
  public lapSeconds(): number | null {
    if (this.lapTimes.length === 0) return null;
    const sorted = [...this.lapTimes].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  /** Seconds for the player to cover `metres` from where they are, at their own speed there, else the field's. */
  public secondsAhead(metres: number): number {
    const player = this.player;
    if (!player) return Infinity;
    let seconds = 0;
    for (let done = 0; done < metres; done += BIN_M) {
      const at = player.car.lapDist + done;
      const speed = this.playerSpeedAt(at) ?? this.fieldSpeedAt(at) ?? Math.max(player.speed, 20);
      seconds += Math.min(BIN_M, metres - done) / Math.max(speed, 5);
    }
    return seconds;
  }

  /** The car has been slow long enough to call, longer for a car known to lag. */
  public confirmedSlow(motion: CarMotion): boolean {
    return motion.slowSince !== null && this.now - motion.slowSince >= (motion.lagging ? LAGGING_CONFIRM_S : CONFIRM_S);
  }

  /** The sector a lap distance is in, 1-3; null until the field showed where sectors start. */
  public sectorOf(lapDist: number): 1 | 2 | 3 | null {
    const [two, three] = this.sectorStart;
    if (!Number.isFinite(two) || !Number.isFinite(three)) return null;
    return lapDist < two ? 1 : lapDist < three ? 2 : 3;
  }
}
