import type { ReplayTrajectoryData, TrafficSpell } from '../../shared/types/index.js';
import type { CornerSegmentComparison, LapSegmentComparison } from './cornerAnalysis/types.js';
import type { CornerConsistencyStat } from './cornerConsistency.js';

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
  /** "T5–T6" for a class sequence, "T7" for an official turn (or its name, or where it is); "Corner 3" for a corner without one. */
  label: string;
  title?: string;
  /** The corner's number in the lap view (the layout's order), which a link opens in telemetry; null when none matches. */
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
 * corner of the lap: the turn whose apex is nearest the corner's slowest point, of those it holds.
 */
function statsForCorners(corners: CornerSegmentComparison[], stats: CornerConsistencyStat[] | null): Map<number, CornerConsistencyStat> {
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
 * lap (the layout's corners placed on the analysed lap); `cornerStats` are the session's official turn
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
  const statsByCorner = statsForCorners(cornersOf(segments), cornerStats);
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
        label: corner.label ?? `Corner ${corner.cornerNumber}`,
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

