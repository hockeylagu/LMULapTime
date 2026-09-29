import type { LapData, PitService } from '../../../../shared/types/index.js';

/** Damage the driver reported on the laps since their previous stop, up to this in-lap. */
export interface EarlierDamage {
  lapNum: number;
  description: string;
}

/** The last damage reported between the driver's previous pit lap and this one, if any. */
export function damageBeforeStop(laps: LapData[], inLap: LapData): EarlierDamage | undefined {
  const previousStop = laps.filter((l) => l.isPitStop && l.lapNum < inLap.lapNum).reduce((max, l) => Math.max(max, l.lapNum), 0);
  const damaged = laps
    .filter((l) => l.lapNum > previousStop && l.lapNum <= inLap.lapNum)
    .flatMap((l) => (l.incidents ?? []).filter((i) => i.type === 'damage').map((i) => ({ lapNum: l.lapNum, description: i.description })));
  return damaged[damaged.length - 1];
}

const secs = (value: number) => `${Math.round(value)} s`;

/** "suspension damage" from "New suspension damage reported", else the description as it is. */
function damageName(description: string): string {
  const match = /new (\w+ damage)/i.exec(description);
  return match ? match[1].toLowerCase() : description;
}

/**
 * The pit stop of an in-lap in lines, e.g. "In the box: 73 s (usual for your class: 29 s)". A
 * stop that ran well past the refill and the class's usual stop is called likely repairs: a
 * guess, since the replay records no repair.
 */
export function describePitService(service: PitService, damage?: EarlierDamage): string[] {
  const lines: string[] = [];
  const lane = service.pitLaneSec !== null ? `pit lane ${secs(service.pitLaneSec)}` : null;
  if (service.serviceSec !== null) {
    const usual = service.classMedianServiceSec !== null ? ` (usual for your class: ${secs(service.classMedianServiceSec)})` : '';
    lines.push(`In the box: ${secs(service.serviceSec)}${usual}${lane ? ` · ${lane}` : ''}`);
  } else if (lane) {
    lines.push(`No service: ${lane}`);
  }
  if (service.energyFrom !== undefined && service.energyTo !== undefined) {
    lines.push(service.energyTo > service.energyFrom
      ? `Energy: ${service.energyFrom}% → ${service.energyTo}%${service.refillSec !== undefined ? ` (refill ${secs(service.refillSec)})` : ''}`
      : `Energy: no refill (${service.energyFrom}%)`);
  }
  if (service.penaltyServed) lines.push('Penalty: served during the stop');
  if (service.unexplainedSec !== undefined) {
    const after = damage ? `, after the ${damageName(damage.description)} on lap ${damage.lapNum}` : '';
    const normal = service.refillSec !== undefined ? "the refill and your class's usual stop" : "your class's usual stop";
    lines.push(`Likely repairs: ${secs(service.unexplainedSec)} longer than ${normal}${after}`);
  }
  return lines;
}
