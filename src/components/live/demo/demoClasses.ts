import type { LiveSnapshot, LiveTiming } from '../../../../shared/types/live.js';
import { knownCarClass, VEHICLE_CLASS_OPTIONS } from '../../../../shared/domain/vehicleMapping.js';
import { liveResourceKind, resourceUnit, sessionLaps } from '../../../../shared/domain/live/liveResourcePlan.js';

export const DEMO_CLASS_OPTIONS = VEHICLE_CLASS_OPTIONS.filter(option => option.id !== 'All');

// Illustrative class samples, not measured performance or vehicle specifications.
const CARS: Record<string, { name: string; lapSeconds: number }> = {
  Hyper: { name: 'Ferrari 499P', lapSeconds: 96.6 },
  GT3: { name: 'Ferrari 296 GT3', lapSeconds: 110 },
  LMP2: { name: 'Oreca 07', lapSeconds: 98 },
  LMP2_ELMS: { name: 'Oreca 07', lapSeconds: 100 },
  LMP3: { name: 'Ligier JS P325', lapSeconds: 118 },
  GTE: { name: 'Porsche 911 RSR', lapSeconds: 108 },
};

/** Apply a class variant before session planning, retaining the selected scenario's display branch. */
export function configureDemoClass(snapshot: LiveSnapshot, timing: LiveTiming, requested?: string | null): void {
  const carClass = knownCarClass(requested) ?? 'GT3';
  const car = carClass ? CARS[carClass] : null;
  if (!car || !carClass || !snapshot.session) return;
  const scale = car.lapSeconds / 96.6;
  const seconds = (value: number | null): number | null => value === null ? null : Math.round(value * scale * 1000) / 1000;
  const sectors = (values: [number | null, number | null, number | null]): [number | null, number | null, number | null] =>
    [seconds(values[0]), seconds(values[1]), seconds(values[2])];
  snapshot.session.vehicleName = car.name;
  snapshot.session.vehicleClass = carClass;
  snapshot.session.elapsedSeconds = (snapshot.session.playerLapsCompleted ?? 0) * car.lapSeconds + (seconds(timing.lapElapsedSeconds) ?? 0);
  if (snapshot.lapsLeft && snapshot.session.endSeconds !== null) {
    snapshot.lapsLeft = { laps: Math.max(1, sessionLaps(snapshot.session.endSeconds - (snapshot.session.playerLapsCompleted ?? 0) * car.lapSeconds, car.lapSeconds, false)), estimated: true };
  }
  if (snapshot.identity) {
    snapshot.identity.carClass = carClass;
    snapshot.identity.personalBestSeconds = seconds(snapshot.identity.personalBestSeconds);
  }
  for (const lap of snapshot.recentLaps) { lap.lapSeconds = seconds(lap.lapSeconds); lap.sectors = sectors(lap.sectors); }
  if (snapshot.sessionBest) {
    snapshot.sessionBest.lapSeconds = seconds(snapshot.sessionBest.lapSeconds);
    snapshot.sessionBest.bestPossibleSeconds = seconds(snapshot.sessionBest.bestPossibleSeconds);
    snapshot.sessionBest.lapSectors = sectors(snapshot.sessionBest.lapSectors);
    snapshot.sessionBest.bestSectors = sectors(snapshot.sessionBest.bestSectors);
  }
  timing.lapElapsedSeconds = seconds(timing.lapElapsedSeconds);
  timing.deltaSeconds = seconds(timing.deltaSeconds);
  timing.sectors = sectors(timing.sectors);
  timing.sectorDeltas = sectors(timing.sectorDeltas);
  const kind = liveResourceKind(carClass);
  const strategy = snapshot.strategy;
  if (strategy?.resource) { strategy.resource.kind = kind; strategy.resource.unit = resourceUnit(kind); }
  if (strategy?.pit?.mfd) strategy.pit.mfd.resourceText = `${strategy.pit.mfd.resourceValue ?? '—'}${resourceUnit(kind)}`;
  if (strategy && kind === 'fuel') strategy.fuelRatio = null;
  if (snapshot.result) {
    snapshot.result.vehicleName = car.name;
    snapshot.result.resourceKind = kind;
    snapshot.result.bestLap = seconds(snapshot.result.bestLap);
    snapshot.result.cleanAverage = seconds(snapshot.result.cleanAverage);
  }
}
