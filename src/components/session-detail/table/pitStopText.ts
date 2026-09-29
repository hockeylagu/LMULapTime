import type { LapData, PitService } from '../../../../shared/types/index.js';

/** Damage the driver reported on the laps since their previous stop, up to this in-lap. */
export interface EarlierDamage {
  lapNum: number;
  description: string;
}

/**
 * A pit stop as seen from one of its two laps: the in-lap (the drive in, and the stop itself when
 * the timing line is past the pit lane) or the out-lap (the rest of the pit lane and the drive out).
 */
export interface LapPitStop {
  inLap: LapData;
  outLap?: LapData;
  damageBefore?: EarlierDamage;
  onOutLap: boolean;
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
const loss = (value: number) => `+${value.toFixed(1)}s`;

/** "suspension damage" from "New suspension damage reported", else the description as it is. */
function damageName(description: string): string {
  const match = /new (\w+ damage)/i.exec(description);
  return match ? match[1].toLowerCase() : description;
}

/**
 * The time in the box in lines, e.g. "In the box: 73 s (usual for your class: 29 s)". A stop that
 * ran well past the refill and the class's usual stop is called likely repairs: a guess, since the
 * replay records no repair.
 */
export function describePitService(service: PitService, damage?: EarlierDamage): string[] {
  const lines: string[] = [];
  if (service.serviceSec !== null) {
    const usual = service.classMedianServiceSec !== null ? ` (usual for your class: ${secs(service.classMedianServiceSec)})` : '';
    lines.push(`In the box: ${secs(service.serviceSec)}${usual}`);
  } else {
    lines.push('No stop in the box: drive-through');
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

/**
 * The time each lap of the stop lost against an average lap. The parser's pit loss counts both
 * laps against two average laps, so that average is (in-lap + out-lap - loss) / 2.
 */
function lapLosses(inLap: LapData, outLap?: LapData): { inLap: number; outLap?: number } | undefined {
  const total = inLap.pitStopDuration;
  if (typeof total !== 'number' || !inLap.lapTime) return undefined;
  if (!outLap?.lapTime) return { inLap: total };
  const average = (inLap.lapTime + outLap.lapTime - total) / 2;
  return { inLap: inLap.lapTime - average, outLap: outLap.lapTime - average };
}

/**
 * What one lap of a stop adds to the lap row: the pit entry on the in-lap, the time in the box on
 * whichever lap it fell (the timing line often runs through the pit lane), the pit exit on the
 * out-lap, and each lap's own time lost; the out-lap closes with the whole stop.
 */
export function describePitStopLap({ inLap, outLap, damageBefore, onOutLap }: LapPitStop): string[] {
  const service = inLap.pitService;
  const losses = lapLosses(inLap, outLap);
  const lines: string[] = [];
  const beforeLine = service?.laneBeforeLineSec;
  if (!onOutLap) {
    if (beforeLine !== undefined) lines.push(`Pit entry: into the pit lane ${secs(beforeLine)} before the line`);
    else if (service?.pitLaneSec != null) lines.push(`Pit lane: ${secs(service.pitLaneSec)}`);
  }
  if (service && (service.serviceAfterLine === true) === onOutLap) lines.push(...describePitService(service, damageBefore));
  if (onOutLap && beforeLine !== undefined && service?.pitLaneSec != null) {
    lines.push(`Pit exit: out of the pit lane ${secs(service.pitLaneSec - beforeLine)} after the line (pit lane ${secs(service.pitLaneSec)} in all)`);
  }
  const lapLoss = onOutLap ? losses?.outLap : losses?.inLap;
  if (lapLoss !== undefined && outLap) lines.push(`Time lost on this lap: ${loss(lapLoss)}`);
  if (inLap.pitStopDurationString && (onOutLap || !outLap)) {
    lines.push(outLap
      ? `Whole stop: ${inLap.pitStopDurationString} over laps ${inLap.lapNum} and ${outLap.lapNum}`
      : `Estimated pit loss: ${inLap.pitStopDurationString}`);
  }
  return lines;
}
