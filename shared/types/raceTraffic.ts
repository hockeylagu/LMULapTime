/** Another car met on track during a lap. */
export interface TrafficCar {
  name: string;
  carClass: string;
  /** Whether the car races in the driver's class: a fight for position rather than traffic to lap or be lapped by. */
  sameClass: boolean;
}

/** The nearest car on the road at a timing-line crossing, whatever its race position or class. */
export interface TrafficGap {
  car: TrafficCar;
  gapSec: number;
}

/**
 * What another car close on the road was to the driver:
 * - battle: same class, same lap (a fight for position)
 * - lapping: same class, a lap or more down (the driver is lapping it)
 * - beingLapped: same class, a lap or more up (it is lapping the driver)
 * - multiclass: another class
 */
export type TrafficSpellKind = 'battle' | 'lapping' | 'beingLapped' | 'multiclass';

/**
 * A spell during a lap with another car right in front of (or, in a battle, right behind) the
 * driver, from every car's position in the replay. Where is the driver's own station (metres
 * from the timing line), so it lines up with the corners of the driver's lap.
 */
export interface TrafficSpell {
  carName: string;
  carClass?: string;
  kind: TrafficSpellKind;
  direction: 'ahead' | 'behind';
  /** Replay time (seconds). */
  startSec: number;
  endSec: number;
  startStationM: number;
  endStationM: number;
  /** The closest the other car was, in seconds at the driver's speed. */
  closestGapSec: number;
}

/** A driver's traffic spells lap by lap, for one replay. */
export interface ReplayLapTraffic {
  lapNumber: number;
  spells: TrafficSpell[];
}

/** GET /api/replays/:name/traffic: unavailable when the replay or the layout's centreline is missing. */
export interface ReplayTrafficResponse {
  available: boolean;
  reason?: string;
  laps: ReplayLapTraffic[];
}

/**
 * Who a driver met on track during one lap, from every car's timing-line crossings in the
 * results XML. Gaps are measured on the road when the lap starts; overtakes are cars whose
 * order at the line changed between the lap's start and its finish.
 */
export interface LapTraffic {
  ahead: TrafficGap | null;
  behind: TrafficGap | null;
  /** Within the following gap of a car ahead both when the lap started and when it finished. */
  following: boolean;
  /** Within the following gap of a car behind both when the lap started and when it finished (absent before parser 2.17). */
  pressured?: boolean;
  /** Cars that started the lap ahead on the road and finished it behind. */
  passed: TrafficCar[];
  /** Cars that started the lap behind on the road and finished it ahead. */
  passedBy: TrafficCar[];
}
