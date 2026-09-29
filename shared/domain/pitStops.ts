import type { LapData, PitService } from '../types/index.js';

/** Replay pit event codes (docs/VCR_FORMAT.md, Pit Stop & Garage Workflow). */
const ENTERED_PIT_LANE = 34;
const EXITED_PIT_LANE = 32;
const IN_STALL = 18;
const ON_JACKS = [35, 36];
const SERVICE_COMPLETE = 37;

/**
 * A stop this much longer than the refill or the class's usual stop is called unexplained (a guess
 * at repairs). On the 08/27 Daytona race (GT3), the class stopped 7-155 s on the jacks, most near
 * 30 s; a stop 20 s past both is not a slow tyre change.
 */
export const UNEXPLAINED_STOP_SEC = 20;

/** Below this many other stops of the class, their median is not a usual stop. */
const MIN_CLASS_STOPS = 3;

/** An energy rise below this (%) is not a refill. */
const MIN_REFILL_PCT = 1;

export interface PitEventTime {
  timeSec: number;
  code: number | null;
}

export interface PitStopTimes {
  entrySec: number;
  exitSec: number | null;
  /** On the jacks (or in the stall, when the jacks event is missing); null for a drive-through. */
  jacksSec: number | null;
  completeSec: number | null;
}

/**
 * A driver's stops from their pit events: each runs from the pit entry line (34) to the pit exit
 * line (32), with on the jacks (35/36, else in the stall 18) and service complete (37) between.
 */
export function pitStopsFromEvents(events: PitEventTime[]): PitStopTimes[] {
  const stops: PitStopTimes[] = [];
  let open: PitStopTimes | null = null;
  let stall: number | null = null;
  for (const { timeSec, code } of [...events].sort((a, b) => a.timeSec - b.timeSec)) {
    if (code === ENTERED_PIT_LANE) {
      if (open) stops.push(open);
      open = { entrySec: timeSec, exitSec: null, jacksSec: null, completeSec: null };
      stall = null;
    } else if (!open) {
      continue;
    } else if (code !== null && ON_JACKS.includes(code) && open.jacksSec === null) {
      open.jacksSec = timeSec;
    } else if (code === IN_STALL && stall === null) {
      stall = timeSec;
    } else if (code === SERVICE_COMPLETE && open.completeSec === null) {
      open.completeSec = timeSec;
      if (open.jacksSec === null) open.jacksSec = stall;
    } else if (code === EXITED_PIT_LANE) {
      if (open.jacksSec === null && open.completeSec !== null) open.jacksSec = stall;
      open.exitSec = timeSec;
      stops.push(open);
      open = null;
    }
  }
  if (open) stops.push(open);
  return stops;
}

/** Time in the box, or null when the car did not stop for service. */
export function serviceSeconds(stop: PitStopTimes): number | null {
  return stop.jacksSec !== null && stop.completeSec !== null && stop.completeSec > stop.jacksSec
    ? stop.completeSec - stop.jacksSec
    : null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The usual time in the box of a class: the median of its other stops, or null below MIN_CLASS_STOPS. */
export function classMedianService(otherServices: number[]): number | null {
  return otherServices.length >= MIN_CLASS_STOPS ? median(otherServices) : null;
}

export interface EnergyPoint {
  timeSec: number;
  virtualEnergy?: number | null;
}

export interface StopEnergy {
  from: number;
  to: number;
  refillSec?: number;
}

/**
 * The energy when the car came in and after the stop, and how long the refill took from the jacks
 * going up to the energy reaching its peak. Undefined when the points carry no energy.
 */
export function stopEnergy(points: EnergyPoint[], stop: PitStopTimes): StopEnergy | undefined {
  const withEnergy = points.filter((p): p is { timeSec: number; virtualEnergy: number } => typeof p.virtualEnergy === 'number');
  const before = [...withEnergy].reverse().find((p) => p.timeSec <= stop.entrySec) ?? withEnergy[0];
  if (!before) return undefined;
  const start = stop.jacksSec ?? stop.entrySec;
  const end = stop.completeSec ?? stop.exitSec ?? start;
  const during = withEnergy.filter((p) => p.timeSec >= start && p.timeSec <= end);
  if (during.length === 0) return { from: before.virtualEnergy, to: before.virtualEnergy };
  const peak = Math.max(...during.map((p) => p.virtualEnergy));
  if (peak - before.virtualEnergy < MIN_REFILL_PCT) return { from: before.virtualEnergy, to: before.virtualEnergy };
  const reached = during.find((p) => p.virtualEnergy >= peak - 0.3) as { timeSec: number };
  return { from: before.virtualEnergy, to: peak, refillSec: Math.max(0, reached.timeSec - start) };
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** The time the car crossed the timing line inside the pit lane (a lap starting in it), if it did. */
export function lineInPitLane(stop: PitStopTimes, lapStartsSec: number[]): number | undefined {
  return lapStartsSec.find((sec) => sec > stop.entrySec && sec < (stop.exitSec ?? Infinity));
}

/**
 * One stop as shown on its in-lap and out-lap. Time in the box beyond both the refill and the
 * class's usual stop, with no penalty served, is kept as `unexplainedSec`: a guess at repairs,
 * never a fact.
 */
export function summarisePitService(
  stop: PitStopTimes,
  context: { classMedianServiceSec: number | null; energy?: StopEnergy; penaltyServed: boolean; lineSec?: number },
): PitService {
  const serviceSec = serviceSeconds(stop);
  const service: PitService = {
    pitLaneSec: stop.exitSec !== null ? round1(stop.exitSec - stop.entrySec) : null,
    serviceSec: serviceSec !== null ? round1(serviceSec) : null,
    classMedianServiceSec: context.classMedianServiceSec !== null ? round1(context.classMedianServiceSec) : null,
  };
  if (context.lineSec !== undefined) {
    service.laneBeforeLineSec = round1(context.lineSec - stop.entrySec);
    if (stop.jacksSec !== null && stop.jacksSec >= context.lineSec) service.serviceAfterLine = true;
  }
  if (context.energy) {
    service.energyFrom = Math.round(context.energy.from);
    service.energyTo = Math.round(context.energy.to);
    if (context.energy.refillSec !== undefined) service.refillSec = round1(context.energy.refillSec);
  }
  if (context.penaltyServed) service.penaltyServed = true;
  const usual = Math.max(context.energy?.refillSec ?? 0, context.classMedianServiceSec ?? 0);
  if (serviceSec !== null && !context.penaltyServed && usual > 0 && serviceSec - usual >= UNEXPLAINED_STOP_SEC) {
    service.unexplainedSec = Math.round(serviceSec - usual);
  }
  return service;
}

/**
 * The time each lap of the stop lost against an average lap. The parser's pit loss counts both
 * laps against two average laps, so that average is (in-lap + out-lap - loss) / 2.
 */
export function pitLossPerLap(inLap: LapData, outLap?: LapData): { inLap: number; outLap?: number } | undefined {
  const total = inLap.pitStopDuration;
  if (typeof total !== 'number' || !inLap.lapTime) return undefined;
  if (!outLap?.lapTime) return { inLap: total };
  const average = (inLap.lapTime + outLap.lapTime - total) / 2;
  return { inLap: inLap.lapTime - average, outLap: outLap.lapTime - average };
}
