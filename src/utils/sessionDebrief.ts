import type { ReplayTrajectoryData, TrafficSpell } from '../../shared/types/index.js';
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

/** Who was close to the driver on the road (GET /api/replays/:name/traffic), by lap. */
export type DebriefTraffic = Map<number, TrafficSpell[]>;

export interface RankDebriefOptions {
  /** The analysed lap against the technique reference (the fastest lap), for the evidence. */
  technique?: LapSegmentComparison[];
  traffic?: DebriefTraffic | null;
  /** The analysed lap's number, to find its traffic. */
  lapNumber?: number;
}

/** Whether a traffic spell (stations on the driver's lap) covers part of a corner's entry-to-exit window. */
export function spellCoversCorner(spell: TrafficSpell, entryDistM: number, exitDistM: number): boolean {
  if (spell.endStationM >= spell.startStationM) return spell.startStationM <= exitDistM && spell.endStationM >= entryDistM;
  // The spell ran across the timing line.
  return exitDistM >= spell.startStationM || entryDistM <= spell.endStationM;
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

/**
 * What to change to drive the corner like the reference, from the measured differences, in the
 * order the driver meets them: a driver who braked 28 m before the reference reads "Brake 28 m later".
 */
export function describeCornerEvidence(corner: CornerSegmentComparison): string[] {
  const evidence: string[] = [];
  const braking = corner.brakingPointDeltaM;
  if (braking !== null && Math.abs(braking) >= EVIDENCE_MIN_DIST_M) {
    evidence.push(`Brake ${Math.abs(braking)} m ${braking < 0 ? 'later' : 'earlier'}`);
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
 * Ranks the corners to work on by priority = time lost x repeatability x confidence (AGENTS.md
 * rule C: deterministic, never the AI). `segments` compare the analysed lap with the reference
 * lap; `cornerStats` time the session's laps through the same corner windows (detected from the
 * analysed lap), so a corner lost on one lap only ranks below one lost on every lap.
 *
 * With traffic, a lap's pass through a corner with another car close in front is left out of
 * that corner's repeatability (the rest of the lap still counts), and a corner of the analysed
 * lap driven behind a car is trusted at TRAFFIC_CONFIDENCE. With a technique reference, the evidence
 * describes how that (faster) lap takes the corner.
 */
export function rankDebriefCorners(
  segments: LapSegmentComparison[],
  cornerStats: CornerConsistencyStat[] | null,
  confidence: number,
  limit = DEBRIEF_CORNER_LIMIT,
  options: RankDebriefOptions = {}
): DebriefCorner[] {
  const statsByCorner = new Map((cornerStats ?? []).map(stat => [stat.cornerNumber, stat]));
  const technique = new Map(cornersOf(options.technique ?? []).map(corner => [corner.cornerNumber, corner]));
  const traffic = options.traffic ?? null;

  return cornersOf(segments)
    .filter(corner => corner.timeDeltaSec >= MIN_CORNER_LOSS_SEC)
    .map((corner): DebriefCorner => {
      const referenceTimeSec = corner.primaryTimeSec - corner.timeDeltaSec;
      // Only a car in front changes how the driver takes a corner (dirty air, held up, a pass);
      // one defended against from behind does not count here.
      const inTraffic = (lapNumber: number) =>
        (traffic?.get(lapNumber) ?? []).find(spell =>
          spell.direction === 'ahead' && spellCoversCorner(spell, corner.entryDistM, corner.exitDistM)) ?? null;
      const allSamples = statsByCorner.get(corner.cornerNumber)?.time.samples ?? [];
      const samples = allSamples.filter(sample => !inTraffic(sample.lapNumber));
      const lapsSampled = samples.length > 1 ? samples.length : null;
      const lapsLosing = lapsSampled === null
        ? null
        : samples.filter(sample => sample.value > referenceTimeSec + REPEAT_LOSS_MARGIN_SEC).length;
      const repeatability = lapsSampled === null ? 1 : (lapsLosing as number) / lapsSampled;
      const timeLossSec = Number(corner.timeDeltaSec.toFixed(3));
      const analysedTraffic = options.lapNumber === undefined ? null : inTraffic(options.lapNumber);
      const cornerConfidence = analysedTraffic ? confidence * TRAFFIC_CONFIDENCE : confidence;
      const techniqueCorner = technique.get(corner.cornerNumber);
      return {
        cornerNumber: corner.cornerNumber,
        entryDistM: corner.entryDistM,
        minDistM: corner.minDistM,
        timeLossSec,
        lapsLosing,
        lapsSampled,
        repeatability,
        confidence: cornerConfidence,
        priority: Number((timeLossSec * repeatability * cornerConfidence).toFixed(4)),
        worstPhase: worstPhase(corner),
        evidence: describeCornerEvidence(techniqueCorner ?? corner),
        techniqueLossSec: techniqueCorner ? Number(techniqueCorner.timeDeltaSec.toFixed(3)) : null,
        traffic: analysedTraffic,
        lapsInTraffic: allSamples.length - samples.length,
      };
    })
    .sort((a, b) => b.priority - a.priority || b.timeLossSec - a.timeLossSec)
    .slice(0, limit);
}
