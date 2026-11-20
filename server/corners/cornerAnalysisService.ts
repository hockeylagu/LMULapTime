import { describeTurn } from '../../shared/domain/circuitTurns/turnLabel.js';
import { resolveVehicle } from '../../shared/domain/vehicleMapping.js';
import { analyzeCorners } from '../../shared/domain/cornerAnalysis/analyzeCorners.js';
import { cornerHabitTrend, habitChange, HISTORY_SESSIONS, type AnalysedSession } from '../../shared/domain/cornerAnalysis/habitHistory.js';
import { turnUsual } from '../../shared/domain/cornerAnalysis/turnUsual.js';
import type { AnalysisDriver, CornerHabitTrend, SessionCornerAnalysis } from '../../shared/types/corners/cornerAnalysis.js';
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
  listReferenceAnalysisPasses(scope: AnalysisPassScope, minLaps: number): AnalysisPassRow[];
}

/** The car's model: gears and the habit history compare only within one car. */
const carModel = (carType: string | null): string | null => (carType ? (resolveVehicle(carType)?.model ?? carType) : null);

/** Each driver's counted laps, by session and driver, their passes grouped per lap. */
function driversOf(rows: readonly AnalysisPassRow[]): AnalysisDriver[] {
  const drivers = new Map<string, AnalysisDriver & { byLap: Map<number, AnalysisDriver['laps'][number]> }>();
  for (const row of rows) {
    const key = `${row.sessionId}|${row.driverOrdinal}`;
    let driver = drivers.get(key);
    if (!driver) {
      driver = { sessionId: row.sessionId, driverOrdinal: row.driverOrdinal, name: row.driverName, car: carModel(row.carType),
        sameSession: false, laps: [], byLap: new Map() };
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
  return [...drivers.values()].map(({ byLap: _byLap, ...driver }) => ({ ...driver, laps: driver.laps.toSorted((a, b) => a.lapOrdinal - b.lapOrdinal) }));
}

/**
 * The engine for some of the player's sessions at a layout: habits against the class's fastest usual through each
 * corner of the class's map (else each official turn), mistakes against their own usual. `hasPasses` says which of
 * `sessions` the player has counted passes of the current build in; `analyse` reads the reference candidates for the
 * sessions it is given, once. Null without a centre line.
 */
function layoutAnalyser(reader: CornerAnalysisReader, layoutKey: string, carClass: string, sessions: readonly AnalysisSessionRow[], loadTrack?: TrackLoader) {
  const layout = placeLayout(layoutKey, loadTrack);
  if (!layout) return null;
  const { corners } = placedLayoutCorners(layout, carClass, (layoutOf, classOf) => reader.getSequenceMap(layoutOf, classOf));
  const scope = (of: readonly AnalysisSessionRow[]): AnalysisPassScope => ({
    layoutKey, carClass, buildPrefix: layoutPassKey(layout), sessionIds: of.map(session => session.sessionId),
  });
  const players = driversOf(reader.listPlayerAnalysisPasses(scope(sessions)));
  const ownOf = (session: AnalysisSessionRow) => players.find(driver => driver.sessionId === session.sessionId && driver.driverOrdinal === session.driverOrdinal);
  const minLaps = minTrendPasses(layout.lengthM);
  const analysisCorners = corners.corners.map(corner => ({
    id: corner.id, label: corner.label, name: corner.name || corner.label, turnIds: corner.sequence?.turnIds ?? [corner.id],
  }));
  const turns = layout.turns.map(turn => ({ id: turn.id, label: describeTurn(turn).label || `turn ${turn.id + 1}` }));
  const analyse = (analysed: readonly AnalysisSessionRow[]): AnalysedSession[] => {
    if (!analysed.length) return [];
    const others = driversOf(reader.listReferenceAnalysisPasses(scope(analysed), minLaps));
    return analysed.flatMap(session => {
      const own = ownOf(session);
      if (!own) return [];
      const inSession = (driver: AnalysisDriver): AnalysisDriver => ({ ...driver, sameSession: driver.sessionId === session.sessionId });
      const analysis = analyzeCorners({
        lengthM: layout.lengthM, corners: analysisCorners, turns, driver: inSession(own), others: others.map(inSession), minReferenceLaps: minLaps,
      });
      const ownTurns = new Map(layout.turns.flatMap(turn => {
        const usual = turnUsual(own.laps.flatMap(lap => lap.passes.filter(pass => pass.segment === turn.id)), layout.lengthM);
        return usual ? [[turn.id, usual] as const] : [];
      }));
      return [{ sessionId: session.sessionId, timestamp: session.timestamp, sessionType: session.sessionType, analysis, turns: ownTurns }];
    });
  };
  return { layout, corners: analysisCorners, hasPasses: (session: AnalysisSessionRow) => ownOf(session) !== undefined, analyse };
}

/**
 * The corner analysis of the session's player, with each habit against their previous analysed session at the layout
 * in the same car. Null without the session, its player, a centre line or counted passes of the current build.
 */
export function readSessionCornerAnalysis(reader: CornerAnalysisReader, sessionId: string, loadTrack?: TrackLoader): SessionCornerAnalysis | null {
  const session = reader.getAnalysisSession(sessionId);
  if (!session) return null;
  const car = carModel(session.carType);
  // Newest first, before this one: the session the habits are measured against.
  const earlier = reader.listAnalysisSessions(session.layoutKey, session.carClass)
    .filter(other => other.sessionId !== sessionId && carModel(other.carType) === car
      && (other.timestamp < session.timestamp || (other.timestamp === session.timestamp && other.sessionId < sessionId)))
    .reverse();
  const analyser = layoutAnalyser(reader, session.layoutKey, session.carClass, [session, ...earlier], loadTrack);
  if (!analyser?.hasPasses(session)) return null;
  const before = earlier.find(analyser.hasPasses);
  const [now, then = null] = analyser.analyse(before ? [session, before] : [session]);
  const { sessionId: _sessionId, timestamp: _timestamp, sessionType: _sessionType, analysis } = now;
  return {
    sessionId, layoutKey: session.layoutKey, carClass: session.carClass, driverOrdinal: session.driverOrdinal, ...analysis,
    sinceLast: then && {
      session: { sessionId: then.sessionId, timestamp: then.timestamp, sessionType: then.sessionType },
      habits: [...analysis.habits, ...analysis.unexplained].map(habit => habitChange(habit, now, then, analyser.layout.lengthM)),
    },
  };
}

/**
 * Each corner's habit over the player's latest analysed sessions at the layout (of the car model `carType`, lower case,
 * '' for any): the latest session's car, its last HISTORY_SESSIONS analysed sessions. Empty without any.
 */
export function readCornerHabitTrends(
  reader: CornerAnalysisReader, layoutKey: string, carClass: string, carType: string, loadTrack?: TrackLoader,
): Map<number, CornerHabitTrend> {
  const sessions = reader.listAnalysisSessions(layoutKey, carClass)
    .filter(session => !carType || (session.carType ?? '').trim().toLowerCase() === carType)
    .reverse();
  const analyser = sessions.length ? layoutAnalyser(reader, layoutKey, carClass, sessions, loadTrack) : null;
  if (!analyser) return new Map();
  // The latest analysable session's car, its last HISTORY_SESSIONS sessions with counted passes.
  const latest = sessions.find(analyser.hasPasses);
  const car = latest && carModel(latest.carType);
  const analysed = analyser.analyse(sessions.filter(session => analyser.hasPasses(session) && carModel(session.carType) === car).slice(0, HISTORY_SESSIONS));
  return new Map(analyser.corners.flatMap(corner => {
    const trend = cornerHabitTrend(corner.id, analysed, analyser.layout.lengthM);
    return trend ? [[corner.id, trend] as const] : [];
  }));
}
