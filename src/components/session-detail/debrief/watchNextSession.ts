import type {
  CornerAnalysisCorner, CornerHabit, CornerReference, SessionCornerAnalysis,
} from '../../../../shared/types/corners/cornerAnalysis.js';
import type { LayoutCorners } from '../../../../shared/types/corners/cornerPasses.js';
import { sessionRefLabel } from '../../track-detail/corner-trends/cornerHabitText.js';

/** Lines shown: a few things to work on, never everything (driver, 2026-11-19). */
export const WATCH_HABITS = 3;
export const WATCH_MISTAKES = 3;

export interface WatchHabit {
  key: string;
  line: string;
  /** The usual time the half loses to the reference per lap (s). */
  lossSec: number;
  /** The share of counted laps it happens on; null for a loss no rule explains. */
  share: number | null;
  /** Telemetry: the driver's usual lap at the corner against the reference's usual lap there. */
  link: string | null;
  /** Against the driver's previous session here in the same car: "vs Oct 21 Race: brake 6 m later", "New since ...". */
  since: string | null;
}

export interface WatchMistake {
  key: string;
  lapNumber: number | null;
  line: string;
  lossSec: number;
  /** Telemetry: that lap at the corner against the driver's own usual lap there. */
  link: string | null;
}

export interface WatchNextSession {
  /** The session's reference driver: the one most corners are compared with. */
  reference: Omit<CornerReference, 'usualSec' | 'usualLapOrdinal'> | null;
  laps: number;
  habits: WatchHabit[];
  /** The biggest losses, at most WATCH_MISTAKES, and how many more there were. */
  mistakes: WatchMistake[];
  moreMistakes: number;
  /** Turns (and halves) whose loss is the car: the quickest driver in the same car loses there too. */
  carTurns: string[];
}

interface LapRef { sessionId: string; driverOrdinal: number; lapOrdinal: number; name: string }

/** The lap view at a corner (its number in the lap view, by start position), with a comparison lap. */
export function watchLink(lap: LapRef, baseline: LapRef, cornerNumber: number | null): string {
  const params = new URLSearchParams({
    sessionId: lap.sessionId,
    driverOrdinal: String(lap.driverOrdinal),
    lapOrdinal: String(lap.lapOrdinal),
    baselineSessionId: baseline.sessionId,
    baselineDriverOrdinal: String(baseline.driverOrdinal),
    baselineLapOrdinal: String(baseline.lapOrdinal),
    compareDriver: baseline.name,
    ...(cornerNumber === null ? {} : { corner: String(cornerNumber) }),
    view: '2d',
  });
  return `/telemetry?${params.toString()}`;
}

/** The lap view numbers the layout's corners in their order on the track; null when it shows another corner set. */
export function cornerNumbering(layout: LayoutCorners | null): (cornerId: number) => number | null {
  const order = layout ? layout.corners.toSorted((a, b) => a.startM - b.startM).map(corner => corner.id) : [];
  return (cornerId) => {
    const index = order.indexOf(cornerId);
    return index < 0 ? null : index + 1;
  };
}

/** The reference most corners are compared with (one per session; a corner it lacks takes another). */
function sessionReference(corners: readonly CornerAnalysisCorner[]): WatchNextSession['reference'] {
  const counts = new Map<string, { reference: CornerReference; count: number }>();
  for (const { reference } of corners) {
    if (!reference) continue;
    const key = `${reference.sessionId}|${reference.driverOrdinal}`;
    const entry = counts.get(key) ?? { reference, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  const top = [...counts.values()].sort((a, b) => b.count - a.count)[0]?.reference;
  if (!top) return null;
  const { usualSec: _usualSec, usualLapOrdinal: _usualLapOrdinal, ...reference } = top;
  return reference;
}

const halfLabel = (habit: CornerHabit) => (habit.half === 'whole' ? habit.turnLabel : `${habit.turnLabel} ${habit.half}`);

/**
 * What to watch next session, from the session's corner analysis: the top habits (the turns losing time no rule
 * explains fill the rest), the biggest mistakes, and the turns whose loss is the car.
 */
export function watchNextSession(
  analysis: SessionCornerAnalysis,
  driverName: string,
  cornerNumberOf: (cornerId: number) => number | null,
  lapNumberOf: (lapOrdinal: number) => number | null,
): WatchNextSession {
  const corners = new Map(analysis.corners.map(corner => [corner.id, corner]));
  const own = (corner: CornerAnalysisCorner | undefined, lapOrdinal: number | null): LapRef | null =>
    (corner && lapOrdinal !== null ? { sessionId: analysis.sessionId, driverOrdinal: analysis.driverOrdinal, lapOrdinal, name: driverName } : null);

  const { sinceLast } = analysis;
  const sinceText = (habit: CornerHabit): string | null => {
    const change = sinceLast?.habits.find(item => item.turnId === habit.turnId && item.half === habit.half && item.rule === habit.rule);
    if (!sinceLast || !change) return null;
    const label = sessionRefLabel(sinceLast.session);
    return change.isNew ? `New since ${label}` : change.cue && `vs ${label}: ${change.cue}`;
  };

  const habits = [...analysis.habits, ...analysis.unexplained].slice(0, WATCH_HABITS).map((habit, index): WatchHabit => {
    const corner = corners.get(habit.cornerId);
    const lap = own(corner, corner?.usualLapOrdinal ?? null);
    const reference = corner?.reference;
    return {
      key: `${habit.turnId}|${habit.half}|${index}`,
      line: habit.line,
      lossSec: habit.lossSec,
      share: habit.rule === null ? null : habit.repeatability,
      since: sinceText(habit),
      link: lap && reference
        ? watchLink(lap, { sessionId: reference.sessionId, driverOrdinal: reference.driverOrdinal, lapOrdinal: reference.usualLapOrdinal, name: reference.name }, cornerNumberOf(habit.cornerId))
        : null,
    };
  });

  const biggest = analysis.mistakes.toSorted((a, b) => b.lossSec - a.lossSec);
  const mistakes = biggest.slice(0, WATCH_MISTAKES).map((mistake): WatchMistake => {
    const corner = corners.get(mistake.cornerId);
    const lap = own(corner, mistake.lapOrdinal);
    const usual = own(corner, corner?.usualLapOrdinal ?? null);
    return {
      key: `${mistake.lapOrdinal}|${mistake.turnId}`,
      lapNumber: lapNumberOf(mistake.lapOrdinal),
      line: mistake.line,
      lossSec: mistake.lossSec,
      link: lap && usual && usual.lapOrdinal !== lap.lapOrdinal ? watchLink(lap, usual, cornerNumberOf(mistake.cornerId)) : null,
    };
  });

  return {
    reference: sessionReference(analysis.corners),
    laps: analysis.laps,
    habits,
    mistakes,
    moreMistakes: biggest.length - mistakes.length,
    carTurns: [...new Set(analysis.carDifferences.map(halfLabel))],
  };
}
