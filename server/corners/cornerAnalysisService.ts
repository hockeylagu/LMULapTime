import { sessionKindOf } from '../../shared/domain/compareLapScope.js';
import { describeTurn } from '../../shared/domain/circuitTurns/turnLabel.js';
import { resolveVehicle } from '../../shared/domain/vehicleMapping.js';
import { analyzeCorners } from '../../shared/domain/cornerAnalysis/analyzeCorners.js';
import { cornerFocusTrends, habitFocus, type AnalysedSession } from '../../shared/domain/cornerAnalysis/habitFocus.js';
import { paceGoal } from '../../shared/domain/cornerAnalysis/paceGoal.js';
import type { AnalysisDriver, CornerHabitTrend, SessionCornerAnalysis } from '../../shared/types/corners/cornerAnalysis.js';
import type { HabitFocusScope } from '../core/dbHabitFocusStore.js';
import type { AnalysisPassRow, AnalysisPassScope, AnalysisSessionRow } from '../core/replay/dbCornerAnalysisStore.js';
import type { StoredSequenceMap } from '../core/replay/dbSequenceMapStore.js';
import { layoutPassKey, placeLayout, type TrackLoader } from './cornerPassService.js';
import { minTrendPasses } from './cornerTrends.js';
import { placedLayoutCorners } from './sessionCornerPasses.js';

export interface CornerAnalysisReader {
  getAnalysisSession(sessionId: string): AnalysisSessionRow | null;
  listAnalysisSessions(layoutKey: string, carClass: string): AnalysisSessionRow[];
  getSequenceMap(layoutKey: string, carClass: string): StoredSequenceMap | null;
  listPlayerAnalysisPasses(scope: AnalysisPassScope): AnalysisPassRow[];
  listReferenceAnalysisPasses(scope: Omit<AnalysisPassScope, 'sessionIds'>, minLaps: number): AnalysisPassRow[];
  listHabitFocusPins(scope: HabitFocusScope): number[];
}

/** The car's model: gears and same-car checks compare only within one car. */
export const carModel = (carType: string | null): string | null => (carType ? (resolveVehicle(carType)?.model ?? carType) : null);

/** Each driver's counted laps, by session and driver, their passes grouped per lap. */
function driversOf(rows: readonly AnalysisPassRow[]): AnalysisDriver[] {
  const drivers = new Map<string, AnalysisDriver & { byLap: Map<number, AnalysisDriver['laps'][number]> }>();
  for (const row of rows) {
    const key = `${row.sessionId}|${row.driverOrdinal}`;
    let driver = drivers.get(key);
    if (!driver) {
      driver = { sessionId: row.sessionId, driverOrdinal: row.driverOrdinal, name: row.driverName, car: carModel(row.carType),
        paceSec: row.paceSec, laps: [], byLap: new Map() };
      drivers.set(key, driver);
    }
    let lap = driver.byLap.get(row.lapOrdinal);
    if (!lap) {
      lap = { lapOrdinal: row.lapOrdinal, passes: [] };
      driver.byLap.set(row.lapOrdinal, lap);
      driver.laps.push(lap);
    }
    lap.passes.push(row.pass);
  }
  // In a fixed order: the engine keeps the first of drivers tied on a time, whatever order the query returns rows in.
  return [...drivers.values()]
    .toSorted((a, b) => (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : a.driverOrdinal - b.driverOrdinal))
    .map(({ byLap: _byLap, ...driver }) => ({ ...driver, laps: driver.laps.toSorted((a, b) => a.lapOrdinal - b.lapOrdinal) }));
}

/**
 * The engine for some of the player's sessions at a layout: habits against the layout's target through each corner of
 * the class's map (else each official turn), mistakes against their own usual. `hasPasses` says which of `sessions`
 * the player has counted passes of the current build in; `analyse` reads the target candidates once, the same for
 * every session. Null without a centre line.
 */
function layoutAnalyser(reader: CornerAnalysisReader, layoutKey: string, carClass: string, sessions: readonly AnalysisSessionRow[], loadTrack?: TrackLoader) {
  const layout = placeLayout(layoutKey, loadTrack);
  if (!layout) return null;
  const { corners } = placedLayoutCorners(layout, carClass, (layoutOf, classOf) => reader.getSequenceMap(layoutOf, classOf));
  const scope = { layoutKey, carClass, buildPrefix: layoutPassKey(layout) };
  const players = driversOf(reader.listPlayerAnalysisPasses({ ...scope, sessionIds: sessions.map(session => session.sessionId) }));
  const ownOf = (session: AnalysisSessionRow) => players.find(driver => driver.sessionId === session.sessionId && driver.driverOrdinal === session.driverOrdinal);
  const minLaps = minTrendPasses(layout.lengthM);
  const analysisCorners = corners.corners.map(corner => ({
    id: corner.id, label: corner.label, name: corner.name || corner.label, turnIds: corner.sequence?.turnIds ?? [corner.id],
  }));
  const turns = layout.turns.map(turn => ({ id: turn.id, label: describeTurn(turn).label || `turn ${turn.id + 1}` }));
  const analyse = (analysed: readonly AnalysisSessionRow[]): AnalysedSession[] => {
    if (!analysed.length) return [];
    const others = driversOf(reader.listReferenceAnalysisPasses(scope, minLaps));
    return analysed.flatMap(session => {
      const own = ownOf(session);
      if (!own) return [];
      const analysis = analyzeCorners({ lengthM: layout.lengthM, corners: analysisCorners, turns, driver: own, others, minReferenceLaps: minLaps });
      return [{ sessionId: session.sessionId, timestamp: session.timestamp, sessionType: session.sessionType, driverOrdinal: session.driverOrdinal, analysis }];
    });
  };
  /** The pinned corners of the layout and class, the first pinned first: each pin's turn names the corner that holds it now. */
  const pinnedCorners = (): number[] => [...new Set(reader.listHabitFocusPins({ layoutKey, carClass })
    .flatMap(turnId => analysisCorners.find(corner => corner.turnIds.includes(turnId))?.id ?? []))];
  return { corners: analysisCorners, hasPasses: (session: AnalysisSessionRow) => ownOf(session) !== undefined, analyse, pinnedCorners };
}

/**
 * The player's true pace in a session (s): the average of the 3 fastest clean dry laps. A qualifying session counts
 * with the 1 or 2 laps it has (a qualifying lap is not a lucky lap, driver, 2026-11-20); any other needs all 3.
 */
function truePaceOf(session: AnalysisSessionRow): number | null {
  const enough = session.fastestCount === 3 || (session.fastestCount > 0 && sessionKindOf(session.sessionType) === 'quali');
  return enough ? session.fastestSumSec / session.fastestCount : null;
}

/**
 * The corner analysis of the session's player, with the focus over all their analysed sessions at the layout in the
 * same class up to this one (the 2 corners to work on and the progress on them), and where the session stands against
 * the goal: its true pace against the benchmark target of its layout and class (`targetSecOf`, from the Reference
 * Benchmarks; null without one). Null without the session, its player, a centre line or counted passes of the
 * current build.
 */
export function readSessionCornerAnalysis(
  reader: CornerAnalysisReader, sessionId: string, targetSecOf: (layoutKey: string, carClass: string) => number | null, loadTrack?: TrackLoader,
): SessionCornerAnalysis | null {
  const session = reader.getAnalysisSession(sessionId);
  if (!session) return null;
  const car = carModel(session.carType);
  const earlier = reader.listAnalysisSessions(session.layoutKey, session.carClass)
    .filter(other => other.sessionId !== sessionId && (other.timestamp < session.timestamp || (other.timestamp === session.timestamp && other.sessionId < sessionId)));
  const analyser = layoutAnalyser(reader, session.layoutKey, session.carClass, [...earlier, session], loadTrack);
  if (!analyser?.hasPasses(session)) return null;
  // Oldest first, this one last: the focus is walked over the whole class history (same-car checks still apply per session).
  const history = earlier.filter(analyser.hasPasses);
  const analysed = analyser.analyse([...history, session]);
  const { analysis } = analysed[analysed.length - 1];
  return {
    sessionId, layoutKey: session.layoutKey, carClass: session.carClass, car, driverOrdinal: session.driverOrdinal, ...analysis,
    focus: habitFocus(analysed, analyser.corners, analyser.pinnedCorners()),
    goal: paceGoal(targetSecOf(session.layoutKey, session.carClass), truePaceOf(session)),
  };
}


/**
 * Each corner's habit over the player's analysed sessions at the layout in the class (filtered to `carType`, lower case,
 * when given; '' merges every car of the class), with the same focus walk as the debrief. Empty without any.
 */
export function readCornerHabitTrends(
  reader: CornerAnalysisReader, layoutKey: string, carClass: string, carType: string, loadTrack?: TrackLoader,
): Map<number, CornerHabitTrend> {
  const sessions = reader.listAnalysisSessions(layoutKey, carClass)
    .filter(session => !carType || (session.carType ?? '').trim().toLowerCase() === carType);
  const analyser = sessions.length ? layoutAnalyser(reader, layoutKey, carClass, sessions, loadTrack) : null;
  if (!analyser) return new Map();
  const analysed = analyser.analyse(sessions.filter(analyser.hasPasses));
  return cornerFocusTrends(analysed, analyser.corners, analyser.pinnedCorners());
}

/**
 * The corner a pin of `turnId` lands on at the layout for the class, and the car's pinned turns by corner: what the
 * pin routes need to refuse a third pin and to unpin a corner whatever turn it was pinned by. Null without a centre
 * line or a corner holding the turn.
 */
export function pinnedCornerTurns(
  reader: Pick<CornerAnalysisReader, 'getSequenceMap' | 'listHabitFocusPins'>, scope: HabitFocusScope, turnId: number, loadTrack?: TrackLoader,
): { cornerTurnIds: number[]; pinnedHere: number[]; pinnedCorners: number } | null {
  const layout = placeLayout(scope.layoutKey, loadTrack);
  if (!layout) return null;
  const { corners } = placedLayoutCorners(layout, scope.carClass, (layoutOf, classOf) => reader.getSequenceMap(layoutOf, classOf));
  const turnsOf = (id: number) => corners.corners.map(corner => corner.sequence?.turnIds ?? [corner.id]).find(turnIds => turnIds.includes(id));
  const cornerTurnIds = turnsOf(turnId);
  if (!cornerTurnIds) return null;
  const pins = reader.listHabitFocusPins(scope);
  return {
    cornerTurnIds,
    pinnedHere: pins.filter(pin => cornerTurnIds.includes(pin)),
    pinnedCorners: new Set(pins.flatMap(pin => turnsOf(pin)?.[0] ?? [])).size,
  };
}
