import type { TrafficSpell, TrafficSpellKind } from '../../shared/types/index.js';
import { areComparableCarClasses } from '../../shared/domain/vehicleMapping.js';
import { countAtOrBelow, distanceAt, DriverPositions, lapProgressAt, positiveModulo, RacePositions } from './racePositions.js';

/** Another car this close (in seconds at the driver's speed) is in the driver's air or fight. */
export const CLOSE_GAP_SEC = 1.0;

/** Shorter spells are a pass or a tow, not being held up or fighting. */
export const MIN_SPELL_SEC = 2.0;

/** A spell ends once the car has not been close for this long. */
const SPELL_BREAK_SEC = 1.0;

/** Below this speed (m/s) the driver is stopped or crawling: gaps in time mean nothing. */
const MIN_SPEED_MPS = 5;

export interface TrafficCarInfo {
  name: string;
  carClass?: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function classify(
  positions: RacePositions,
  driver: DriverPositions,
  other: DriverPositions,
  distances: { driver: number; other: number },
  time: number,
  sameClass: boolean
): TrafficSpellKind {
  if (!sameClass) return 'multiclass';
  const mine = lapProgressAt(driver, distances.driver, time, positions.trackLengthM);
  const theirs = lapProgressAt(other, distances.other, time, positions.trackLengthM);
  const lapsApart = mine === null || theirs === null ? 0 : Math.round(theirs - mine);
  if (lapsApart === 0) return 'battle';
  return lapsApart < 0 ? 'lapping' : 'beingLapped';
}

/**
 * The spells during [startSec, endSec] when another car was close to the driver on the road:
 * within CLOSE_GAP_SEC in front (any car), or behind in a fight for position or while being
 * lapped by a car of the same class, for at least MIN_SPELL_SEC. A faster class closing from
 * behind is not tracked yet.
 */
export function findTrafficSpells(
  positions: RacePositions,
  driverSlot: number,
  startSec: number,
  endSec: number,
  cars: Map<number, TrafficCarInfo>
): TrafficSpell[] {
  const driver = positions.drivers.find((d) => d.slot === driverSlot);
  if (!driver) return [];
  const { trackLengthM } = positions;
  const driverClass = cars.get(driverSlot)?.carClass;
  const others = positions.drivers
    .filter((d) => d.slot !== driverSlot)
    .map((d) => ({ positions: d, info: cars.get(d.slot), sameClass: areComparableCarClasses(driverClass, cars.get(d.slot)?.carClass) }));
  const open = new Map<string, TrafficSpell>();
  const spells: TrafficSpell[] = [];

  const close = (key: string) => {
    const spell = open.get(key);
    open.delete(key);
    if (spell && spell.endSec - spell.startSec >= MIN_SPELL_SEC) spells.push(spell);
  };

  const first = Math.max(countAtOrBelow(driver.times, startSec), 1);
  const last = countAtOrBelow(driver.times, endSec);
  for (let i = first; i < last; i++) {
    const time = driver.times[i];
    const dt = time - driver.times[i - 1];
    const speed = dt > 0 ? (driver.distances[i] - driver.distances[i - 1]) / dt : 0;
    if (speed < MIN_SPEED_MPS) continue;
    const station = Math.round(positiveModulo(driver.distances[i], trackLengthM));

    for (const other of others) {
      const otherDistance = distanceAt(other.positions, time);
      if (otherDistance === null) continue;
      const aheadSec = positiveModulo(otherDistance - driver.distances[i], trackLengthM) / speed;
      const behindSec = positiveModulo(driver.distances[i] - otherDistance, trackLengthM) / speed;
      const direction = aheadSec <= CLOSE_GAP_SEC ? 'ahead' : behindSec <= CLOSE_GAP_SEC ? 'behind' : null;
      if (direction === null) continue;
      const gapSec = direction === 'ahead' ? aheadSec : behindSec;
      const key = `${other.positions.slot}:${direction}`;
      const spell = open.get(key);
      if (spell) {
        spell.endSec = time;
        spell.endStationM = station;
        spell.closestGapSec = Math.min(spell.closestGapSec, round2(gapSec));
        continue;
      }
      const kind = classify(positions, driver, other.positions, { driver: driver.distances[i], other: otherDistance }, time, other.sameClass);
      if (direction === 'behind' && kind !== 'battle' && kind !== 'beingLapped') continue;
      open.set(key, {
        carName: other.info?.name ?? `Car ${other.positions.slot}`,
        ...(other.info?.carClass ? { carClass: other.info.carClass } : {}),
        kind,
        direction,
        startSec: time,
        endSec: time,
        startStationM: station,
        endStationM: station,
        closestGapSec: round2(gapSec),
      });
    }
    // A car that drops just out of range for a moment is still the same spell.
    for (const [key, spell] of [...open]) if (time - spell.endSec > SPELL_BREAK_SEC) close(key);
  }
  for (const key of [...open.keys()]) close(key);
  return spells.sort((a, b) => a.startSec - b.startSec);
}
