import type { ReplayTrajectoryData } from '../../shared/types/index.js';
import type { CornerSegmentComparison, LapSegmentComparison } from './cornerAnalysis.js';
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
  cornerNumber: number;
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
  /** Measured differences, in words, e.g. "Brakes 18 m earlier". */
  evidence: string[];
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

/** The corner's measured differences to the reference, in the order the driver meets them. */
export function describeCornerEvidence(corner: CornerSegmentComparison): string[] {
  const evidence: string[] = [];
  const braking = corner.brakingPointDeltaM;
  if (braking !== null && Math.abs(braking) >= EVIDENCE_MIN_DIST_M) {
    evidence.push(`Brakes ${Math.abs(braking)} m ${braking < 0 ? 'earlier' : 'later'}`);
  }
  const apex = corner.minSpeedDeltaKmh;
  if (Math.abs(apex) >= EVIDENCE_MIN_SPEED_KMH) {
    evidence.push(`${Math.abs(apex)} km/h ${apex < 0 ? 'slower' : 'faster'} at the apex`);
  }
  const throttle = corner.throttleOnDeltaM;
  if (throttle !== null && Math.abs(throttle) >= EVIDENCE_MIN_DIST_M) {
    evidence.push(`Full throttle ${Math.abs(throttle)} m ${throttle > 0 ? 'later' : 'earlier'}`);
  }
  const exit = corner.exitSpeedDeltaKmh;
  if (Math.abs(exit) >= EVIDENCE_MIN_SPEED_KMH) {
    evidence.push(`${Math.abs(exit)} km/h ${exit < 0 ? 'slower' : 'faster'} on exit`);
  }
  return evidence;
}

/**
 * Ranks the corners to work on by priority = time lost x repeatability x confidence (AGENTS.md
 * rule C: deterministic, never the AI). `segments` compare the analysed lap with the reference
 * lap; `cornerStats` time the session's laps through the same corner windows (detected from the
 * analysed lap), so a corner lost on one lap only ranks below one lost on every lap.
 */
export function rankDebriefCorners(
  segments: LapSegmentComparison[],
  cornerStats: CornerConsistencyStat[] | null,
  confidence: number,
  limit = DEBRIEF_CORNER_LIMIT
): DebriefCorner[] {
  const statsByCorner = new Map((cornerStats ?? []).map(stat => [stat.cornerNumber, stat]));
  const corners = segments.filter((s): s is CornerSegmentComparison => s.type === 'corner');

  return corners
    .filter(corner => corner.timeDeltaSec >= MIN_CORNER_LOSS_SEC)
    .map((corner): DebriefCorner => {
      const referenceTimeSec = corner.primaryTimeSec - corner.timeDeltaSec;
      const samples = statsByCorner.get(corner.cornerNumber)?.time.samples ?? [];
      const lapsSampled = samples.length > 1 ? samples.length : null;
      const lapsLosing = lapsSampled === null
        ? null
        : samples.filter(sample => sample.value > referenceTimeSec + REPEAT_LOSS_MARGIN_SEC).length;
      const repeatability = lapsSampled === null ? 1 : (lapsLosing as number) / lapsSampled;
      const timeLossSec = Number(corner.timeDeltaSec.toFixed(3));
      return {
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
        evidence: describeCornerEvidence(corner),
      };
    })
    .sort((a, b) => b.priority - a.priority || b.timeLossSec - a.timeLossSec)
    .slice(0, limit);
}
