import type { LiveCall } from '../liveCalls.js';
import { aheadOf, STOPPED_MS, type CarMotion, type FieldTrack } from './fieldTrack.js';
import { countWord } from './spokenCar.js';

/** Within this many seconds at the player's pace an incident gets its call; further ones wait until they are this close. */
const NEAR_S = 15;
/**
 * A car still moving gets its call only this close: farther, it has usually picked up again before the player gets
 * there (Sebring race 2026-11-22: slow cars called 11-15 s ahead, cleared a second later; the driver: too far to matter).
 */
const SLOW_NEAR_S = 8;
/** Slow cars this close along the lap are one incident (one call per pile-up, driver 2026-11-21). */
const CLUSTER_M = 150;
/** Within this of the player's usual line a car is on it. */
const ON_LINE_M = 2.5;
/** A game yellow with no slow car found waits this long before its own call: the detector usually names it first. */
const SECTOR_ALONE_S = 2;
/** A flag back to green this long ends the yellow, so a flickering yellow is one (episodes flicker for 1-11 s). */
const GREEN_HOLD_S = 10;
/** A spot already called stays the same incident this long after its last slow car, so a pile-up is one call. */
const SPOT_S = 60;
/** A car coming back slow (as a stopped car is) is rejoining; one running wide at speed is not (Daytona: 28 calls at 0.7). */
const REJOIN_SHARE = 0.5;
/** A car rejoining is called within this long of coming back, and only this close: further on it has moved away. */
const REJOIN_S = 3;
const REJOIN_NEAR_S = 6;
/** Cars rejoining at one spot within this long are one call. */
const REJOIN_GROUP_S = 10;
const YELLOW = 1;
const GREEN = 11;

/** A sentence starts with a capital: "sector 1." without a yellow is "Sector 1." (Sebring practice 2026-11-22). */
const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** Names a lap distance: "Turn 6" from the layout's placed turns; null where none is placed. */
export type TurnNamer = (lapDist: number) => string | null;

interface Incident { cars: CarMotion[]; anchor: CarMotion; lapDist: number; ahead: number }
interface Announced { key: string; lapDist: number; where: string; at: number; cleared: boolean }
interface SectorYellow { since: number; greenSince: number | null; called: boolean }

/** Metres between two lap distances, either way round. */
const apart = (a: number, b: number, length: number) => Math.min(aheadOf(a, b, length), aheadOf(b, a, length));

const sideOf = (cars: readonly CarMotion[]): string => {
  const right = cars.filter(motion => motion.car.pathLateral > 0).length;
  return right === cars.length ? 'right' : right === 0 ? 'left' : 'both sides';
};

/**
 * Incidents ahead from every car's motion, said as the plan's Incident ahead calls: where (the turn), what (stopped,
 * slow, off), which side and whether on the player's line; only within 15 s of the player. A car rejoining, the turn
 * clearing after an on-track call, and the game's sector yellow when no car explains it. Keys carry the car and when
 * it stopped, so a pile-up is one call and a car stopped for good is said once.
 */
export class IncidentWatch {
  private announced: Announced[] = [];
  /** Recent rejoin calls: cars coming back together at one spot are one call. */
  private rejoins: Array<{ event: string; lapDist: number; at: number }> = [];
  private readonly yellows: Array<SectorYellow | null> = [null, null, null];

  public reset(): void {
    this.announced = [];
    this.rejoins = [];
    this.yellows.fill(null);
  }

  public calls(track: FieldTrack, sectorFlags: readonly number[], turnAt: TurnNamer, key: (event: string) => string): LiveCall[] {
    const player = track.player;
    if (!player || track.length <= 0) return [];
    const now = track.now;
    this.followFlags(sectorFlags, now);
    if (player.car.inPits || player.car.inGarage) return [];
    const where = (lapDist: number) => turnAt(lapDist) ?? (track.sectorOf(lapDist) ? `sector ${track.sectorOf(lapDist)}` : null);
    /** The game's yellow over the spot; an incident said with it counts as that yellow's call. */
    const yellowAt = (lapDist: number) => {
      const sector = track.sectorOf(lapDist);
      if (sector === null || sectorFlags[sector - 1] !== YELLOW) return false;
      const yellow = this.yellows[sector - 1];
      if (yellow) yellow.called = true;
      return true;
    };
    const calls: LiveCall[] = [];
    for (const incident of this.incidents(track)) {
      const seconds = track.secondsAhead(incident.ahead);
      if (seconds > (incident.cars.every(motion => motion.speed < STOPPED_MS) ? NEAR_S : SLOW_NEAR_S)) continue;
      const place = where(incident.lapDist);
      if (!place) continue;
      const onTrack = incident.cars.filter(motion => motion.offSince === null);
      // Keyed by the car and where it stands: a car parked for good is said once a run (Daytona 2026-11-05 lap after lap).
      const spotKey = `${incident.anchor.car.id}-${Math.round(incident.anchor.car.lapDist / 50)}`;
      const near = (entry: Announced) => now - entry.at <= SPOT_S && apart(entry.lapDist, incident.lapDist, track.length) <= CLUSTER_M;
      const spot = this.announced.find(entry => !entry.cleared && near(entry));
      if (spot) spot.at = now;
      if (onTrack.length > 0) {
        const stopped = onTrack.every(motion => motion.speed < STOPPED_MS);
        const what = onTrack.length === 1 ? (stopped ? 'Car stopped' : 'Slow car')
          : `${countWord(onTrack.length)} cars ${stopped ? 'stopped' : 'slow'}`;
        const line = this.line(track, onTrack);
        const event = spot?.key ?? `incident-${spotKey}`;
        const text = sentence(`${yellowAt(incident.lapDist) ? 'Yellow, ' : ''}${place}.`) + ` ${sentence(what)} on track, ${sideOf(onTrack)}${line ? `, ${line}` : ''}.`;
        calls.push({ key: key(event), text, priority: 1, family: 'incident' });
        if (!spot) this.announced.push({ key: event, lapDist: incident.lapDist, where: place, at: now, cleared: false });
      } else if (!this.announced.some(near)) {
        const count = incident.cars.length;
        const text = `${count === 1 ? 'Car' : `${countWord(count).charAt(0).toUpperCase()}${countWord(count).slice(1)} cars`} off ${sideOf(incident.cars)}, ${place}.`;
        calls.push({ key: key(`off-${spotKey}`), text, priority: 2, family: 'incident', waitSeconds: Math.max(1, seconds - 1) });
      }
    }
    calls.push(...this.rejoining(track, where, key), ...this.cleared(track, key), ...this.sectors(track, sectorFlags, key));
    return calls;
  }

  /** Confirmed slow cars ahead, grouped by lap distance, nearest first. */
  private incidents(track: FieldTrack): Incident[] {
    const player = track.player!;
    const slow = [...track.cars.values()]
      .filter(motion => !motion.car.isPlayer && track.confirmedSlow(motion))
      .map(motion => ({ motion, ahead: aheadOf(player.car.lapDist, motion.car.lapDist, track.length) }))
      .filter(entry => entry.ahead < track.length - 50)
      .sort((a, b) => a.ahead - b.ahead);
    const incidents: Incident[] = [];
    for (const entry of slow) {
      const last = incidents.at(-1);
      if (last && entry.ahead - aheadOf(player.car.lapDist, last.cars.at(-1)!.car.lapDist, track.length) <= CLUSTER_M) {
        last.cars.push(entry.motion);
        if ((entry.motion.slowSince ?? Infinity) < (last.anchor.slowSince ?? Infinity)) last.anchor = entry.motion;
      } else incidents.push({ cars: [entry.motion], anchor: entry.motion, lapDist: entry.motion.car.lapDist, ahead: entry.ahead });
    }
    return incidents;
  }

  /** "in your path" when a car sits within 2.5 m of the player's usual line there, else "clear of your line"; null before the player drove it. */
  private line(track: FieldTrack, cars: readonly CarMotion[]): string | null {
    let known = false;
    for (const motion of cars) {
      const line = track.playerLineAt(motion.car.lapDist);
      if (line === null) continue;
      known = true;
      if (Math.abs(line - motion.car.pathLateral) <= ON_LINE_M) return 'in your path';
    }
    return known ? 'clear of your line' : null;
  }

  private rejoining(track: FieldTrack, where: (lapDist: number) => string | null, key: (event: string) => string): LiveCall[] {
    const calls: LiveCall[] = [];
    for (const motion of track.cars.values()) {
      if (motion.car.isPlayer || motion.rejoinedAt === null || track.now - motion.rejoinedAt > REJOIN_S || motion.offSince !== null) continue;
      const usual = track.fieldSpeedAt(motion.car.lapDist);
      if (usual !== null && motion.speed >= usual * REJOIN_SHARE) continue;
      const ahead = aheadOf(track.player!.car.lapDist, motion.car.lapDist, track.length);
      const place = where(motion.car.lapDist);
      if (!place || ahead > track.length - 50 || track.secondsAhead(ahead) > REJOIN_NEAR_S) continue;
      this.rejoins = this.rejoins.filter(entry => track.now - entry.at <= REJOIN_GROUP_S);
      let group = this.rejoins.find(entry => apart(entry.lapDist, motion.car.lapDist, track.length) <= CLUSTER_M);
      if (!group) {
        group = { event: `rejoin-${motion.car.id}-${Math.round(motion.rejoinedAt)}`, lapDist: motion.car.lapDist, at: track.now };
        this.rejoins.push(group);
      }
      if (!calls.some(call => call.key === key(group.event))) {
        calls.push({ key: key(group.event), text: `Car rejoining, ${place}, careful.`, priority: 1, family: 'incident' });
      }
    }
    return calls;
  }

  /** "Turn 6 clear." once the cars of an on-track call moved away, while the spot is still ahead within 15 s. */
  private cleared(track: FieldTrack, key: (event: string) => string): LiveCall[] {
    const player = track.player!;
    const calls: LiveCall[] = [];
    // A spot the player passed is done: "clear" belongs to the approach the call was made on.
    this.announced = this.announced.filter(entry => track.now - entry.at < 180
      && aheadOf(player.car.lapDist, entry.lapDist, track.length) < track.length / 2);
    for (const entry of this.announced) {
      const ahead = aheadOf(player.car.lapDist, entry.lapDist, track.length);
      if (track.secondsAhead(ahead) > NEAR_S) continue;
      const blocked = [...track.cars.values()].some(motion => !motion.car.isPlayer && motion.slowSince !== null && motion.offSince === null
        && apart(entry.lapDist, motion.car.lapDist, track.length) <= CLUSTER_M);
      if (blocked) continue;
      entry.cleared = true;
      calls.push({ key: key(`clear-${entry.key}`), text: `${sentence(entry.where)} clear.`, priority: 2, family: 'incident', immediate: true });
    }
    return calls;
  }

  private followFlags(flags: readonly number[], now: number): void {
    for (let index = 0; index < 3; index += 1) {
      const yellow = this.yellows[index];
      if (flags[index] === YELLOW) {
        if (!yellow) this.yellows[index] = { since: now, greenSince: null, called: false };
        else yellow.greenSince = null;
      } else if (yellow && flags[index] === GREEN) {
        yellow.greenSince ??= now;
      }
    }
  }

  /**
   * The game's sector yellow when no slow car explains it, by the sector's distance; "Green, sector 2." once a
   * yellow that was called holds green.
   */
  private sectors(track: FieldTrack, flags: readonly number[], key: (event: string) => string): LiveCall[] {
    const calls: LiveCall[] = [];
    const player = track.player!;
    const starts = [0, ...track.sectorStart];
    for (let index = 0; index < 3; index += 1) {
      const yellow = this.yellows[index];
      if (!yellow || !Number.isFinite(starts[index])) continue;
      const sector = index + 1;
      if (yellow.greenSince !== null && track.now - yellow.greenSince >= GREEN_HOLD_S) {
        if (yellow.called) calls.push({ key: key(`green-${sector}-${Math.round(yellow.since)}`), text: `Green, sector ${sector}.`, priority: 2, family: 'incident', waitSeconds: 20 });
        if (track.now - yellow.greenSince > 30) this.yellows[index] = null;
        continue;
      }
      if (flags[index] !== YELLOW || track.now - yellow.since < SECTOR_ALONE_S) continue;
      const inSector = track.sectorOf(player.car.lapDist) === sector;
      const ahead = aheadOf(player.car.lapDist, starts[index], track.length);
      const explained = [...track.cars.values()].some(motion => !motion.car.isPlayer && motion.slowSince !== null && track.sectorOf(motion.car.lapDist) === sector);
      if (explained) continue;
      if (!inSector && track.secondsAhead(ahead) > NEAR_S) continue;
      yellow.called = true;
      calls.push({ key: key(`sector-${sector}-${Math.round(yellow.since)}`), text: `Yellow, sector ${sector}.`, priority: 1, family: 'incident' });
    }
    return calls;
  }
}
