import type { LapTraffic, NonRepresentativeReason, TrafficCar, TrafficSpell } from '../../shared/types/index.js';
import { OFF_PACE_RATIO } from '../../shared/domain/lapRepresentativeness.js';
import { FOLLOW_GAP_SEC } from '../../shared/domain/raceTraffic.js';

const offPacePercent = Math.round((OFF_PACE_RATIO - 1) * 100);

/** The badge text and explanation for each reason a lap is left out of the driver's pace. */
export const NON_REPRESENTATIVE_LABELS: Record<NonRepresentativeReason, { label: string; title: string }> = {
  contact: { label: 'Contact', title: 'Slower than your median lap, with contact or damage' },
  traffic: { label: 'Traffic', title: 'Slower than your median lap, spent overtaking, being overtaken or following a car' },
  offPace: { label: 'Off pace', title: `More than ${offPacePercent}% slower than your median lap` },
};

/**
 * What the driver was doing in traffic:
 * - attacking: passing, or within the following gap of, a car of their class
 * - defending: passed by, or with right behind them, a car of their class
 * - following: within the following gap of a car of another class (held up or in its tow)
 * - multiclass: passing or passed by cars of another class, or one right behind
 */
export type LapTrafficKind = 'attacking' | 'defending' | 'following' | 'multiclass';

export interface LapTrafficSituation {
  kind: LapTrafficKind;
  text: string;
}

const KIND_LABELS: Record<LapTrafficKind, { heading: string; activity: string }> = {
  attacking: { heading: 'Attacking', activity: 'attacking' },
  defending: { heading: 'Defending', activity: 'defending' },
  following: { heading: 'Following', activity: 'following a car' },
  multiclass: { heading: 'Other classes', activity: 'in multiclass traffic' },
};

const CLOSE = `within ${FOLLOW_GAP_SEC} s`;

/** "Vinicius Ares (Hyper)" for one car, "2 GT3" for several of one class, otherwise a count per class. */
function describeCars(cars: TrafficCar[]): string {
  if (cars.length === 1) return describeCar(cars[0]);
  const byClass = new Map<string, number>();
  cars.forEach((car) => byClass.set(car.carClass, (byClass.get(car.carClass) ?? 0) + 1));
  return [...byClass].map(([carClass, count]) => `${count} ${carClass}`).join(', ');
}

const describeCar = (car: TrafficCar) => `${car.name} (${car.carClass})`;

const sameClass = (cars: TrafficCar[], same: boolean) => cars.filter((car) => car.sameClass === same);

/**
 * What the driver was doing in the traffic of a lap, attacking first, e.g. "Attacking: passed
 * Rui Paiva (GT3)". Built from the timing-line crossings, so "all lap" means at both ends of it.
 */
export function lapTrafficSituations(traffic: LapTraffic | undefined): LapTrafficSituation[] {
  if (!traffic) return [];
  const situations: LapTrafficSituation[] = [];
  const add = (kind: LapTrafficKind, text: string) => situations.push({ kind, text });
  const { ahead, behind } = traffic;

  const passedRivals = sameClass(traffic.passed, true);
  if (passedRivals.length > 0) add('attacking', `passed ${describeCars(passedRivals)}`);
  if (traffic.following && ahead?.car.sameClass) add('attacking', `${CLOSE} of ${describeCar(ahead.car)} all lap`);

  const passedByRivals = sameClass(traffic.passedBy, true);
  if (passedByRivals.length > 0) add('defending', `passed by ${describeCars(passedByRivals)}`);
  if (traffic.pressured && behind?.car.sameClass) add('defending', `${describeCar(behind.car)} ${CLOSE} behind all lap`);

  if (traffic.following && ahead && !ahead.car.sameClass) add('following', `${CLOSE} of ${describeCar(ahead.car)} all lap`);

  const passedOthers = sameClass(traffic.passed, false);
  if (passedOthers.length > 0) add('multiclass', `passed ${describeCars(passedOthers)}`);
  const passedByOthers = sameClass(traffic.passedBy, false);
  if (passedByOthers.length > 0) add('multiclass', `passed by ${describeCars(passedByOthers)}`);
  if (traffic.pressured && behind && !behind.car.sameClass) add('multiclass', `${describeCar(behind.car)} ${CLOSE} behind all lap`);

  const order: LapTrafficKind[] = ['attacking', 'defending', 'following', 'multiclass'];
  return situations.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** One line per kind of thing the driver did in traffic, e.g. "Attacking: passed 2 GT3; within 1 s of ...". */
export function describeLapTraffic(traffic: LapTraffic | undefined): string[] {
  const byKind = new Map<LapTrafficKind, string[]>();
  lapTrafficSituations(traffic).forEach(({ kind, text }) => byKind.set(kind, [...(byKind.get(kind) ?? []), text]));
  return [...byKind].map(([kind, texts]) => `${KIND_LABELS[kind].heading}: ${texts.join('; ')}`);
}

function joinWords(words: string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * Why a lap is left out of the average, as specific as its data allows: for traffic, what the
 * driver was doing, e.g. "Slower than your median lap while attacking and in multiclass traffic".
 */
export function describeNonRepresentative(reason: NonRepresentativeReason, traffic: LapTraffic | undefined): string {
  if (reason !== 'traffic') return NON_REPRESENTATIVE_LABELS[reason].title;
  const activities = [...new Set(lapTrafficSituations(traffic).map(({ kind }) => KIND_LABELS[kind].activity))];
  return activities.length > 0 ? `Slower than your median lap while ${joinWords(activities)}` : NON_REPRESENTATIVE_LABELS.traffic.title;
}

/** A traffic spell from the replay in words, e.g. "Attacking Vinicius Ares" or "Behind Rui Paiva (GT3)". */
export function describeTrafficSpell(spell: TrafficSpell): string {
  switch (spell.kind) {
    case 'battle': return spell.direction === 'ahead' ? `Attacking ${spell.carName}` : `Defending from ${spell.carName}`;
    case 'lapping': return `Lapping ${spell.carName}`;
    case 'beingLapped': return `Being lapped by ${spell.carName}`;
    case 'multiclass': return `Behind ${spell.carName}${spell.carClass ? ` (${spell.carClass})` : ''}`;
  }
}
