import type { LiveCall } from '../liveCalls.js';
import { aheadOf, type CarMotion, type FieldTrack } from './fieldTrack.js';
import { carClassOf, classRank, classWord, countWord, spokenCar } from './spokenCar.js';

/** Seconds to the pass said only up to this: further out the guess misses by seconds (Daytona 2026-11-05). */
const PASS_S = 6;
/** A car this many seconds behind or more is not traffic yet. */
const GAP_S = 4;
/** Closing slower than this is no pass. */
const CLOSING_MS = 1;
/** A pass where the player is below this share of their top speed lands in a braking zone or corner (0.9-1.3 a lap). */
const CORNER_SHARE = 0.75;
/** Two faster cars or more within this many seconds are one group, said as one call. */
const GROUP_S = 6;

interface Approach { motion: CarMotion; seconds: number; passAt: number }

/**
 * Multiclass traffic (plan step 4): a faster-class car catching the player, said when the pass lands in a braking zone
 * or a corner, a group of them as one call, and a slower-class car the player reaches in a corner (P3). Each approach
 * is said once: its key carries when the car came within reach. Said at once, not in a slot: the pass comes first.
 */
export class TrafficWatch {
  private readonly since = new Map<number, number>();

  public reset(): void { this.since.clear(); }

  public calls(track: FieldTrack, key: (event: string) => string): LiveCall[] {
    const player = track.player;
    if (!player || player.car.inPits || player.car.inGarage || track.length <= 0 || track.playerTop <= 0) return [];
    const playerClass = carClassOf(player.car);
    const rank = classRank(playerClass);
    if (rank === null) return [];
    const behind: Approach[] = [];
    const ahead: Approach[] = [];
    const reach = new Set<number>();
    for (const motion of track.cars.values()) {
      const car = motion.car;
      const carRank = classRank(carClassOf(car));
      if (car.isPlayer || car.inPits || car.inGarage || car.finishStatus !== 0 || carRank === null || carRank === rank) continue;
      const faster = carRank > rank;
      const metres = faster ? aheadOf(car.lapDist, player.car.lapDist, track.length) : aheadOf(player.car.lapDist, car.lapDist, track.length);
      if (metres > track.length / 2) continue;
      const closing = faster ? motion.speed - player.speed : player.speed - motion.speed;
      const gap = metres / Math.max(player.speed, 10);
      if (gap > GAP_S * 2.5) continue;
      reach.add(car.id);
      if (!this.since.has(car.id)) this.since.set(car.id, Math.round(track.now));
      if (closing < CLOSING_MS || gap > (faster ? GROUP_S : GAP_S)) continue;
      const seconds = metres / closing;
      if (seconds > PASS_S) continue;
      (faster ? behind : ahead).push({ motion, seconds, passAt: player.car.lapDist + player.speed * seconds });
    }
    for (const id of this.since.keys()) if (!reach.has(id)) this.since.delete(id);
    const inCorner = (approach: Approach) => (track.playerSpeedAt(approach.passAt) ?? Infinity) < track.playerTop * CORNER_SHARE;
    const calls: LiveCall[] = [];
    const event = (approach: Approach) => `${approach.motion.car.id}-${this.since.get(approach.motion.car.id)}`;
    if (behind.length >= 2) {
      const classes = new Set(behind.map(approach => carClassOf(approach.motion.car)));
      const words = classes.size === 1 ? `${classWord([...classes][0])}s` : 'cars';
      calls.push({
        key: key(`traffic-group-${behind.map(event).sort().join('+')}`), priority: 2, family: 'traffic', immediate: true,
        text: `${countWord(behind.length).charAt(0).toUpperCase()}${countWord(behind.length).slice(1)} ${words} behind.`,
        waitSeconds: Math.max(1, Math.min(...behind.map(approach => approach.seconds)) - 1),
      });
    } else if (behind.length === 1 && inCorner(behind[0])) {
      const [approach] = behind;
      calls.push({
        key: key(`traffic-behind-${event(approach)}`), priority: 2, family: 'traffic', immediate: true,
        text: `${spokenCar(approach.motion.car, playerClass)} behind, catching. Passes in ${Math.max(1, Math.round(approach.seconds))} seconds.`,
        waitSeconds: Math.max(1, approach.seconds - 1),
      });
    }
    for (const approach of ahead.filter(inCorner)) {
      calls.push({
        key: key(`traffic-ahead-${event(approach)}`), priority: 3, family: 'traffic', immediate: true,
        text: `${spokenCar(approach.motion.car, playerClass)} ahead, ${Math.max(1, Math.round(approach.seconds))} seconds.`,
        waitSeconds: Math.max(1, approach.seconds - 1),
      });
    }
    return calls;
  }
}
