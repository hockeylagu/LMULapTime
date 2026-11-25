import type { LiveCall } from '../liveCalls.js';
import { aheadOf, type CarMotion, type FieldTrack } from './fieldTrack.js';
import { carClassOf, classRank, classWord, countWord, spokenCar } from './spokenCar.js';

/**
 * Seconds to the pass said only up to this: further out the guess misses by seconds (Daytona 2026-11-05), at 6 s the
 * call came too soon (Sebring race 2026-11-25, driver), and at 4 s the car was still far back (driver, same day): at 3 s
 * the call (1.1-1.7 s) still ends before the pass.
 */
const PASS_S = 3;
/** A car this many seconds behind or more is not traffic yet. */
const GAP_S = 4;
/** Closing slower than this is no pass. */
const CLOSING_MS = 1;
/** A pass where the player is below this share of their top speed lands in a braking zone or corner (0.9-1.3 a lap). */
const CORNER_SHARE = 0.75;
/** Two faster cars or more within this many seconds are one group, said as one call. */
const GROUP_S = 6;
/**
 * Below this share of the field's usual speed at the spot the player is crawling (a puncture, damage, to the pits):
 * being caught is expected, so nothing behind is said (Sebring race 2026-11-25: punctured on lap 3, 20 calls in 23 s
 * as the P2s lapped the player on the way to the pits).
 */
const CRAWL_SHARE = 0.5;

interface Approach { motion: CarMotion; seconds: number; passAt: number }

/** Seconds to a pass, whole and at least one: "1 second", "4 seconds". */
export function passSeconds(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds));
  return whole === 1 ? '1 second' : `${whole} seconds`;
}

/**
 * Multiclass traffic (plan step 4): a faster-class car catching the player, said when the pass lands in a braking zone
 * or a corner, a group of them as one call, and a slower-class car the player reaches in a corner (P3). Each approach
 * is said once: its key carries when the car came within reach. Said at once, not in a slot: the pass comes first.
 * The call behind is the car alone ("P2 Oreca behind.", about 1 s): the call is the timing, and "catching. Passes in
 * 6 seconds." ran 3.5 s, past the pass (Sebring race 2026-11-25, driver). A train behind is one call: the cars it
 * named keep its key until they pass, so a car joining or the leader passing says nothing new (the same race: 7 calls
 * in 23 s for one train of P2s).
 */
export class TrafficWatch {
  private readonly since = new Map<number, number>();
  /** The key of the call behind that named each car, until it leaves reach. */
  private readonly told = new Map<number, string>();

  public reset(): void { this.since.clear(); this.told.clear(); }

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
    for (const id of this.told.keys()) if (!reach.has(id)) this.told.delete(id);
    const usual = track.fieldSpeedAt(player.car.lapDist);
    if (usual !== null && player.speed < usual * CRAWL_SHARE) behind.length = 0;
    const inCorner = (approach: Approach) => (track.playerSpeedAt(approach.passAt) ?? Infinity) < track.playerTop * CORNER_SHARE;
    const calls: LiveCall[] = [];
    const event = (approach: Approach) => `${approach.motion.car.id}-${this.since.get(approach.motion.car.id)}`;
    const lead = behind.toSorted((a, b) => a.seconds - b.seconds)[0];
    if (lead && (behind.length >= 2 || inCorner(lead))) {
      const told = this.told.get(lead.motion.car.id);
      const behindEvent = told ?? `traffic-behind-${event(lead)}`;
      // A car joining the train takes its call too, so it is not said once the cars ahead of it have passed.
      for (const approach of behind) if (!this.told.has(approach.motion.car.id)) this.told.set(approach.motion.car.id, behindEvent);
      const classes = new Set(behind.map(approach => carClassOf(approach.motion.car)));
      const words = classes.size === 1 ? `${classWord([...classes][0])}s` : 'cars';
      const count = countWord(behind.length);
      calls.push({
        key: key(behindEvent), priority: 2, family: 'traffic', immediate: true,
        text: behind.length >= 2 ? `${count.charAt(0).toUpperCase()}${count.slice(1)} ${words} behind.` : `${spokenCar(lead.motion.car, playerClass)} behind.`,
        waitSeconds: Math.max(1, lead.seconds - 1),
      });
    }
    for (const approach of ahead.filter(inCorner)) {
      calls.push({
        key: key(`traffic-ahead-${event(approach)}`), priority: 3, family: 'traffic', immediate: true,
        text: `${spokenCar(approach.motion.car, playerClass)} ahead. ${passSeconds(approach.seconds)}.`,
        waitSeconds: Math.max(1, approach.seconds - 1),
      });
    }
    return calls;
  }
}
