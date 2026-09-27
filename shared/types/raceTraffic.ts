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
 * Who a driver met on track during one lap, from every car's timing-line crossings in the
 * results XML. Gaps are measured on the road when the lap starts; overtakes are cars whose
 * order at the line changed between the lap's start and its finish.
 */
export interface LapTraffic {
  ahead: TrafficGap | null;
  behind: TrafficGap | null;
  /** Within the following gap of a car ahead both when the lap started and when it finished. */
  following: boolean;
  /** Cars that started the lap ahead on the road and finished it behind. */
  passed: TrafficCar[];
  /** Cars that started the lap behind on the road and finished it ahead. */
  passedBy: TrafficCar[];
}
