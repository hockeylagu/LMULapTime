import type { CornerPass } from '../../../../../shared/types/corners/cornerPasses.js';
import type { LapTurnDifference, TurnHalf } from '../../../../../shared/types/corners/cornerAnalysis.js';
import { compareLapTurn } from '../../../../../shared/domain/cornerAnalysis/analyzeCorners.js';

/** A half of a turn where one of the two laps loses time to the other, and what differs there. */
export interface LapDifferenceLine {
  key: string;
  /** For the shown lap: positive when it loses to the baseline there, negative when it gains. */
  deltaSec: number;
  /** "into T8". */
  where: string;
  /** "This lap braked 12 m earlier": the slower lap is the subject. */
  text: string;
  /** "tighter arc (34 m radius against 42 m)", the slower lap's first. */
  kindLine: string | null;
  /** What else the slower lap did differently: "braking 0.2 s longer". */
  causes: string[];
}

/** What differs between the shown lap and its baseline through one corner of the lap view. */
export interface CornerLapDifference {
  lines: LapDifferenceLine[];
  /** What explains a loss before the driving does: a car close ahead, ABS working much longer (a lockup, on the driver's own laps). */
  notes: string[];
}

interface Side { name: string; other: string; sign: 1 | -1 }
const LAP: Side = { name: 'This lap', other: 'the baseline', sign: 1 };
const BASELINE: Side = { name: 'The baseline', other: 'this lap', sign: -1 };

const WHERE: Record<TurnHalf, string> = { in: 'into', whole: 'through', out: 'out of' };
const HALF_ORDER: readonly TurnHalf[] = ['in', 'whole', 'out'];

function differenceText({ rule, gap }: LapTurnDifference, side: Side): string {
  const size = Math.round(gap ?? 0);
  switch (rule) {
    case 'brakesWhereLift': return `${side.name} braked where ${side.other} only lifted`;
    case 'overSlowing': return `${side.name} was ${size} km/h slower at the slowest point`;
    case 'brakeEarly': return `${side.name} braked ${size} m earlier`;
    case 'exitSpeed': return `${side.name} was ${size} km/h slower at the turn's end`;
    case null: return `${side.name} lost time: nothing measured stands out`;
  }
}

/**
 * The two laps through the corner's turns, turn by turn (`compareLapTurn`, both ways): the halves where either lap
 * loses time, in lap order, each said with the slower lap as its subject. Null when no turn was measured on both laps.
 */
export function cornerLapDifference(
  turns: ReadonlyArray<{ id: number; label: string }>,
  lap: readonly CornerPass[],
  baseline: readonly CornerPass[],
  lengthM: number,
  sameCar: boolean,
): CornerLapDifference | null {
  const lines: LapDifferenceLine[] = [], notes: string[] = [];
  let measured = false;
  for (const turn of turns) {
    const label = turn.label || `turn ${turn.id + 1}`;
    const mine = lap.find(pass => pass.segment === turn.id), theirs = baseline.find(pass => pass.segment === turn.id);
    const forward = mine && theirs ? compareLapTurn(mine, theirs, lengthM, sameCar) : null;
    const back = mine && theirs ? compareLapTurn(theirs, mine, lengthM, sameCar) : null;
    if (!forward || !back) continue;
    measured = true;
    const found = [...forward.differences.map(difference => ({ difference, side: LAP })), ...back.differences.map(difference => ({ difference, side: BASELINE }))]
      .sort((a, b) => HALF_ORDER.indexOf(a.difference.half) - HALF_ORDER.indexOf(b.difference.half));
    for (const { difference, side } of found) {
      lines.push({
        key: `${turn.id}|${difference.half}`, deltaSec: side.sign * difference.lossSec, where: `${WHERE[difference.half]} ${label}`,
        text: differenceText(difference, side), kindLine: difference.kindLine, causes: difference.causes.map(cause => cause.line),
      });
    }
    for (const [comparison, side] of [[forward, LAP], [back, BASELINE]] as const) {
      if (comparison.traffic) notes.push(`${side.name} had a car close ahead at ${label}: time lost there is not the driving.`);
      if (comparison.absMoreSec !== null) notes.push(`${side.name} had ABS working ${comparison.absMoreSec.toFixed(1)} s longer into ${label}.`);
    }
  }
  return measured ? { lines, notes } : null;
}
