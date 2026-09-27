import type { LapTraffic, NonRepresentativeReason, TrafficCar, TrafficGap } from '../../shared/types/index.js';
import { OFF_PACE_RATIO } from '../../shared/domain/lapRepresentativeness.js';

const offPacePercent = Math.round((OFF_PACE_RATIO - 1) * 100);

/** The badge text and explanation for each reason a lap is left out of the driver's pace. */
export const NON_REPRESENTATIVE_LABELS: Record<NonRepresentativeReason, { label: string; title: string }> = {
  contact: { label: 'Contact', title: 'Slower than your median lap, with contact or damage' },
  traffic: { label: 'Traffic', title: 'Slower than your median lap, spent overtaking, being overtaken or following a car' },
  offPace: { label: 'Off pace', title: `More than ${offPacePercent}% slower than your median lap` },
};

/** "Vinicius Ares" for one car, "2 GT3" for several of one class, otherwise a count per class. */
function describeCars(cars: TrafficCar[]): string {
  if (cars.length === 1) return `${cars[0].name} (${cars[0].carClass})`;
  const byClass = new Map<string, number>();
  cars.forEach((car) => byClass.set(car.carClass, (byClass.get(car.carClass) ?? 0) + 1));
  return [...byClass].map(([carClass, count]) => `${count} ${carClass}`).join(', ');
}

const describeGap = (gap: TrafficGap) => `${gap.car.name} (${gap.car.carClass}) ${gap.gapSec.toFixed(2)}s`;

/** One short line per thing that happened around the driver during the lap, e.g. "Passed 2 GT3". */
export function describeLapTraffic(traffic: LapTraffic | undefined): string[] {
  if (!traffic) return [];
  const lines: string[] = [];
  if (traffic.passed.length > 0) lines.push(`Passed ${describeCars(traffic.passed)}`);
  if (traffic.passedBy.length > 0) lines.push(`Passed by ${describeCars(traffic.passedBy)}`);
  if (traffic.following && traffic.ahead) lines.push(`Followed ${describeGap(traffic.ahead)}`);
  return lines;
}

/** The on-road gaps when the lap started, for a tooltip. */
export function describeLapGaps(traffic: LapTraffic | undefined): string[] {
  if (!traffic) return [];
  const lines: string[] = [];
  if (traffic.ahead) lines.push(`Ahead on the road: ${describeGap(traffic.ahead)}`);
  if (traffic.behind) lines.push(`Behind on the road: ${describeGap(traffic.behind)}`);
  return lines;
}
