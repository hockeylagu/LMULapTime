import type { ReplayTrajectoryData, TrafficSpell } from '../../shared/types/index.js';
import type { CornerSegmentComparison, LapSegmentComparison } from './cornerAnalysis/types.js';
import type { CornerPass, CornerPassCar, CornerTurn } from '../../shared/types/corners/cornerPasses.js';
import { turnDisplayName, type CornerConsistencyStat } from './cornerConsistency.js';

/** A corner costing less than this against the reference is not worth working on. */
export const MIN_CORNER_LOSS_SEC = 0.03;

/** A lap counts as losing in a corner when it is this much slower than the reference there. */
export const REPEAT_LOSS_MARGIN_SEC = 0.02;

/** How many corners the debrief lists. */
export const DEBRIEF_CORNER_LIMIT = 3;

/** How far a braking or throttle point, or a speed, must differ before the debrief quotes it. */
const EVIDENCE_MIN_DIST_M = 5;
const EVIDENCE_MIN_SPEED_KMH = 2;

export type CornerPhase = 'entry' | 'rotation' | 'exit';

export interface DebriefCorner {
  /** "T7" for an official turn (or its name, or where it is); "Corner 3" for a corner the lap's own detection found. */
  label: string;
  title?: string;
  /** The corner the analysed lap's detection finds here, which a link opens in telemetry; null when none matches. */
  cornerNumber: number | null;
  entryDistM: number;
  minDistM: number;
  /** Time lost through the corner on the analysed lap against the reference lap (seconds). */
  timeLossSec: number;
  /** The session's laps slower than the reference through this corner; null when only the analysed lap was timed. */
  lapsLosing: number | null;
  lapsSampled: number | null;
  /** Share of the session's laps losing here (0-1); 1 when only the analysed lap is known. */
  repeatability: number;
  /** How far the comparison itself can be trusted (0-1). */
  confidence: number;
  /** timeLossSec x repeatability x confidence: the ranking key. */
  priority: number;
  /** The corner phase that lost the most time, when the phases could be measured. */
  worstPhase: CornerPhase | null;
  /** What to change to match the technique reference (or the reference), e.g. "Brake 18 m later". */
  evidence: string[];
  /** Time lost through the corner against the technique reference, when there is a separate one. */
  techniqueLossSec: number | null;
  /** The car close to the driver through this corner on the analysed lap, if any. */
  traffic: TrafficSpell | null;
  /** The session's laps left out of repeatability here because another car was close through the corner. */
  lapsInTraffic: number;
}

/** A corner of the analysed lap driven with another car close is not a clean read of the driver's pace. */
export const TRAFFIC_CONFIDENCE = 0.5;

export interface RankDebriefOptions {
  /** The analysed lap against the technique reference (the fastest lap), for the evidence. */
  technique?: LapSegmentComparison[];
  /** The analysed lap's number, to find its own pass among the session's. */
  lapNumber?: number;
}

/**
 * How far a comparison between these two laps can be trusted, from what the server could establish:
 * laps matched on the track map (1) or only by driven distance (0.5), and both recorded at 100 Hz by
 * DuckDB (1) or at least one from the replay file alone (0.8).
 */
export function comparisonConfidence(primary: ReplayTrajectoryData, reference: ReplayTrajectoryData): number {
  const alignment = primary.stationSource === 'odometer' || reference.stationSource === 'odometer' ? 0.5 : 1;
  const recording = primary.source === 'duckdb' && reference.source === 'duckdb' ? 1 : 0.8;
  return alignment * recording;
}

function worstPhase(corner: CornerSegmentComparison): CornerPhase | null {
  const phases = corner.phaseTiming;
  if (!phases) return null;
  const candidates: Array<[CornerPhase, number]> = [
    ['entry', phases.entry?.timeDeltaSec ?? -Infinity],
    ['rotation', phases.rotation.timeDeltaSec],
    ['exit', phases.exit.timeDeltaSec],
  ];
  const [phase, loss] = candidates.reduce((worst, next) => (next[1] > worst[1] ? next : worst));
  return loss > 0 ? phase : null;
}

/** The analysed lap minus the reference through a corner: distances along the track, speeds in km/h. */
export interface CornerEvidenceDeltas {
  brakingPointDeltaM: number | null;
  turnInDeltaM?: number | null;
  minSpeedDeltaKmh: number;
  throttleOnDeltaM: number | null;
  exitSpeedDeltaKmh: number;
}

/**
 * What to change to drive the corner like the reference, from the measured differences, in the
 * order the driver meets them: a driver who braked 28 m before the reference reads "Brake 28 m later".
 */
export function describeCornerEvidence(corner: CornerEvidenceDeltas): string[] {
  const evidence: string[] = [];
  const braking = corner.brakingPointDeltaM;
  if (braking !== null && Math.abs(braking) >= EVIDENCE_MIN_DIST_M) {
    evidence.push(`Brake ${Math.abs(braking)} m ${braking < 0 ? 'later' : 'earlier'}`);
  }
  const turnIn = corner.turnInDeltaM ?? null;
  if (turnIn !== null && Math.abs(turnIn) >= EVIDENCE_MIN_DIST_M) {
    evidence.push(`Turn in ${Math.abs(turnIn)} m ${turnIn < 0 ? 'later' : 'earlier'}`);
  }
  const apex = corner.minSpeedDeltaKmh;
  if (Math.abs(apex) >= EVIDENCE_MIN_SPEED_KMH) {
    evidence.push(`Carry ${Math.abs(apex)} km/h ${apex < 0 ? 'more' : 'less'} to the apex`);
  }
  const throttle = corner.throttleOnDeltaM;
  if (throttle !== null && Math.abs(throttle) >= EVIDENCE_MIN_DIST_M) {
    evidence.push(`Full throttle ${Math.abs(throttle)} m ${throttle > 0 ? 'earlier' : 'later'}`);
  }
  const exit = corner.exitSpeedDeltaKmh;
  if (Math.abs(exit) >= EVIDENCE_MIN_SPEED_KMH) {
    evidence.push(`Exit ${Math.abs(exit)} km/h ${exit < 0 ? 'faster' : 'slower'}`);
  }
  return evidence;
}

const cornersOf = (segments: LapSegmentComparison[]) =>
  segments.filter((s): s is CornerSegmentComparison => s.type === 'corner');

/**
 * The session's official turn stats (placed on the analysed lap, cornerConsistency placeStatsOnLap) for each
 * corner the lap's detection found: the turn whose apex is nearest the corner's slowest point, of those it holds.
 */
function statsForDetectedCorners(corners: CornerSegmentComparison[], stats: CornerConsistencyStat[] | null): Map<number, CornerConsistencyStat> {
  const byCorner = new Map<number, CornerConsistencyStat>();
  for (const corner of corners) {
    let best: CornerConsistencyStat | undefined;
    for (const stat of stats ?? []) {
      if (stat.cornerNumber !== corner.cornerNumber || typeof stat.lapDistM !== 'number') continue;
      if (!best || Math.abs(stat.lapDistM - corner.minDistM) < Math.abs((best.lapDistM as number) - corner.minDistM)) best = stat;
    }
    if (best) byCorner.set(corner.cornerNumber, best);
  }
  return byCorner;
}

/**
 * Ranks the corners to work on by priority = time lost x repeatability x confidence (AGENTS.md
 * rule C: deterministic, never the AI). `segments` compare the analysed lap with the reference
 * lap (corners the analysed lap's detection found); `cornerStats` are the session's official turn
 * passes placed on that lap, so a corner lost on one lap only ranks below one lost on every lap.
 * With a technique reference, the evidence describes how that (faster) lap takes the corner.
 */
export function rankDebriefCorners(
  segments: LapSegmentComparison[],
  cornerStats: CornerConsistencyStat[] | null,
  confidence: number,
  limit = DEBRIEF_CORNER_LIMIT,
  options: RankDebriefOptions = {}
): DebriefCorner[] {
  const statsByCorner = statsForDetectedCorners(cornersOf(segments), cornerStats);
  const technique = new Map(cornersOf(options.technique ?? []).map(corner => [corner.cornerNumber, corner]));

  return cornersOf(segments)
    .filter(corner => corner.timeDeltaSec >= MIN_CORNER_LOSS_SEC)
    .map((corner): DebriefCorner => {
      // The session's passes time the official turn, not this corner's window: a lap loses here when it is
      // slower through the turn than the analysed lap minus its loss to the reference.
      const samples = statsByCorner.get(corner.cornerNumber)?.time.samples ?? [];
      const analysedSec = samples.find(sample => sample.lapNumber === options.lapNumber)?.value;
      const referenceTimeSec = analysedSec === undefined ? null : analysedSec - corner.timeDeltaSec;
      const lapsSampled = samples.length > 1 && referenceTimeSec !== null ? samples.length : null;
      const lapsLosing = lapsSampled === null || referenceTimeSec === null
        ? null
        : samples.filter(sample => sample.value > referenceTimeSec + REPEAT_LOSS_MARGIN_SEC).length;
      const repeatability = lapsSampled === null ? 1 : (lapsLosing as number) / lapsSampled;
      const timeLossSec = Number(corner.timeDeltaSec.toFixed(3));
      const techniqueCorner = technique.get(corner.cornerNumber);
      return {
        label: `Corner ${corner.cornerNumber}`,
        cornerNumber: corner.cornerNumber,
        entryDistM: corner.entryDistM,
        minDistM: corner.minDistM,
        timeLossSec,
        lapsLosing,
        lapsSampled,
        repeatability,
        confidence,
        priority: Number((timeLossSec * repeatability * confidence).toFixed(4)),
        worstPhase: worstPhase(corner),
        evidence: describeCornerEvidence(techniqueCorner ?? corner),
        techniqueLossSec: techniqueCorner ? Number(techniqueCorner.timeDeltaSec.toFixed(3)) : null,
        traffic: null,
        lapsInTraffic: 0,
      };
    })
    .sort((a, b) => b.priority - a.priority || b.timeLossSec - a.timeLossSec)
    .slice(0, limit);
}

/** Another car this close in front (seconds at the driver's speed) is in the driver's air: the traffic spells' measure. */
export const TRAFFIC_CLOSE_SEC = 1;

/**
 * The car close in front through a pass, as a traffic spell: its kind from the two cars' classes and laps (the
 * other car's pass through the same turn nearest in time gives its lap). Null without a car within TRAFFIC_CLOSE_SEC.
 */
export function passTrafficSpell(
  pass: CornerPass, turn: Pick<CornerTurn, 'startM' | 'endM'>, cars: CornerPassCar[], allPasses: CornerPass[]
): TrafficSpell | null {
  if (pass.aheadSlot === null || pass.aheadGapSec === null || pass.aheadGapSec > TRAFFIC_CLOSE_SEC) return null;
  const other = cars.find(car => car.slot === pass.aheadSlot);
  const own = cars.find(car => car.slot === pass.slot);
  if (!other) return null;
  let kind: TrafficSpell['kind'] = 'multiclass';
  if (other.carClass === own?.carClass) {
    let otherLap: number | null = null;
    let nearest = Infinity;
    for (const candidate of allPasses) {
      if (candidate.slot !== other.slot || candidate.segment !== pass.segment) continue;
      const gap = Math.abs(candidate.entrySec - pass.entrySec);
      if (gap < nearest) { nearest = gap; otherLap = candidate.lapNumber; }
    }
    kind = otherLap === null || otherLap === pass.lapNumber ? 'battle' : otherLap < pass.lapNumber ? 'lapping' : 'beingLapped';
  }
  return {
    driverName: other.name, carClass: other.carClass, kind, direction: 'ahead',
    startSec: pass.entrySec, endSec: pass.exitSec, startStationM: turn.startM, endStationM: turn.endM,
    closestGapSec: pass.aheadGapSec,
  };
}

const passTime = (pass: CornerPass) => pass.exitSec - pass.entrySec;
const roundDelta = (a: number | null, b: number | null) => a === null || b === null ? null : Math.round(a - b);

/** The analysed pass minus the reference pass, in the evidence's terms. */
function passDeltas(pass: CornerPass, reference: CornerPass): CornerEvidenceDeltas {
  return {
    brakingPointDeltaM: roundDelta(pass.brakeM, reference.brakeM),
    turnInDeltaM: roundDelta(pass.turnInM, reference.turnInM),
    minSpeedDeltaKmh: roundDelta(pass.minSpeedKmh, reference.minSpeedKmh) ?? 0,
    throttleOnDeltaM: roundDelta(pass.throttleM, reference.throttleM),
    exitSpeedDeltaKmh: roundDelta(pass.exitSpeedKmh, reference.exitSpeedKmh) ?? 0,
  };
}

/** Which half of the turn lost the most: to the slowest point, or from it to the exit. */
function passWorstPhase(pass: CornerPass, reference: CornerPass): CornerPhase | null {
  if (pass.minSpeedSec === null || reference.minSpeedSec === null) return null;
  const entry = (pass.minSpeedSec - pass.entrySec) - (reference.minSpeedSec - reference.entrySec);
  const exit = (pass.exitSec - pass.minSpeedSec) - (reference.exitSec - reference.minSpeedSec);
  if (entry <= 0 && exit <= 0) return null;
  return entry >= exit ? 'entry' : 'exit';
}

export interface TurnDebriefInput {
  turns: CornerTurn[];
  /** The analysed driver's passes in the session, and which lap is analysed. */
  passes: CornerPass[];
  lapNumber: number;
  /** The session's laps that count for repeatability (clean laps; traffic laps too, only their passes in traffic drop out). */
  repeatLaps: ReadonlySet<number>;
  /** The reference lap's passes, and the technique (fastest) lap's when there is a separate one. */
  reference: CornerPass[];
  technique: CornerPass[] | null;
  /** The car close in front through one of the driver's passes, if any (passTrafficSpell). */
  trafficOf: (pass: CornerPass, turn: CornerTurn) => TrafficSpell | null;
  /** The corner the analysed lap's own detection finds at a turn, for the telemetry link. */
  cornerNumberAt?: (turn: CornerTurn) => number | null;
  limit?: number;
}

/**
 * Ranks the official turns to work on from the corner passes, by priority = time lost x repeatability x
 * confidence (AGENTS.md rule C). Time lost is the analysed pass against the reference lap's pass through the
 * same turn; repeatability is the share of the session's passes slower than the reference, leaving out the
 * passes with a car close in front. Every pass is measured the same way on the same centre line, so the only
 * confidence lost is a car in front of the analysed pass (TRAFFIC_CONFIDENCE).
 */
export function rankTurnCorners(input: TurnDebriefInput): DebriefCorner[] {
  const byTurn = (passes: CornerPass[] | null, lapNumber?: number) =>
    new Map((passes ?? []).filter(pass => lapNumber === undefined || pass.lapNumber === lapNumber).map(pass => [pass.segment, pass]));
  const analysed = byTurn(input.passes, input.lapNumber);
  const reference = byTurn(input.reference);
  const technique = byTurn(input.technique);
  return input.turns.flatMap((turn): DebriefCorner[] => {
    const pass = analysed.get(turn.id);
    const ref = reference.get(turn.id);
    if (!pass || !ref) return [];
    const timeLossSec = Number((passTime(pass) - passTime(ref)).toFixed(3));
    if (timeLossSec < MIN_CORNER_LOSS_SEC) return [];
    const sessionPasses = input.passes.filter(other => other.segment === turn.id && input.repeatLaps.has(other.lapNumber));
    const clean = sessionPasses.filter(other => !input.trafficOf(other, turn));
    const lapsSampled = clean.length > 1 ? clean.length : null;
    const lapsLosing = lapsSampled === null ? null
      : clean.filter(other => passTime(other) > passTime(ref) + REPEAT_LOSS_MARGIN_SEC).length;
    const repeatability = lapsSampled === null ? 1 : (lapsLosing as number) / lapsSampled;
    const traffic = input.trafficOf(pass, turn);
    const confidence = traffic ? TRAFFIC_CONFIDENCE : 1;
    const fastest = technique.get(turn.id);
    return [{
      label: turnDisplayName(turn),
      title: turn.title,
      cornerNumber: input.cornerNumberAt?.(turn) ?? null,
      entryDistM: turn.startM,
      minDistM: turn.apexM,
      timeLossSec,
      lapsLosing,
      lapsSampled,
      repeatability,
      confidence,
      priority: Number((timeLossSec * repeatability * confidence).toFixed(4)),
      worstPhase: passWorstPhase(pass, ref),
      evidence: describeCornerEvidence(passDeltas(pass, fastest ?? ref)),
      techniqueLossSec: fastest ? Number((passTime(pass) - passTime(fastest)).toFixed(3)) : null,
      traffic,
      lapsInTraffic: sessionPasses.length - clean.length,
    }];
  })
    .sort((a, b) => b.priority - a.priority || b.timeLossSec - a.timeLossSec)
    .slice(0, input.limit ?? DEBRIEF_CORNER_LIMIT);
}
