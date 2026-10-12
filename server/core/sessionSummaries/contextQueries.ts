import type { Database } from 'better-sqlite3';
import type { DetailedSession } from '../../../shared/types/index.js';
import type { SessionCard } from '../../../shared/types/sessionSummaries.js';
import { findWeekendSessions } from '../../../shared/domain/weekendSessions.js';
import { isSessionSummaryReady } from './store.js';
import { readSessionCards } from './cards.js';

type PersonalBestScope = { where: string; args: string[] };

function personalBestScope(layoutKey: string, trackVenue: string, trackCourse: string): PersonalBestScope {
  return layoutKey === 'unknown'
    ? { where: 's.layout_key=? AND s.track_venue=? AND s.track_course=?', args: [layoutKey,trackVenue,trackCourse] }
    : { where: 's.layout_key=?', args: [layoutKey] };
}

function sessionScope(db: Database, session: DetailedSession): PersonalBestScope {
  const source=db.prepare('SELECT layout_key FROM sessions WHERE id=?').get(session.id) as {layout_key:string};
  return personalBestScope(source.layout_key,session.trackVenue,session.trackCourse);
}

function queryPersonalBest(db: Database, scope: PersonalBestScope, carClass: string, driverId: number): number | null {
  const best = db.prepare(`SELECT min(d.best_lap_time) best FROM sessions s
    CROSS JOIN session_drivers d ON d.session_id=s.id
    WHERE ${scope.where} AND d.driver_class=? AND d.driver_id=? AND d.best_lap_time>0`);
  return (best.get(...scope.args,carClass,driverId) as { best: number | null }).best;
}

export function querySessionPersonalBest(db: Database, session: DetailedSession, driverOrdinal: number) {
  if (!isSessionSummaryReady(db)) return { driverOrdinal, bestLapTime: null, ready: false };
  const driverId = (db.prepare('SELECT driver_id FROM session_drivers WHERE session_id=? AND driver_ordinal=?')
    .get(session.id, driverOrdinal) as { driver_id: number } | undefined)?.driver_id;
  if (driverId === undefined) return { driverOrdinal, bestLapTime: null, ready: true };
  const driver = session.drivers[driverOrdinal];
  if (!driver) return { driverOrdinal, bestLapTime: null, ready: true };
  return { driverOrdinal, bestLapTime: queryPersonalBest(db, sessionScope(db, session), driver.carClass, driverId), ready: true };
}

/** Reads only the selected driver's identity and session layout for the on-demand PB endpoint. */
export function querySessionPersonalBestById(db: Database, sessionId: string, driverOrdinal: number) {
  const target = db.prepare(`SELECT s.layout_key,s.track_venue,s.track_course,d.driver_id,d.driver_class
    FROM sessions s JOIN session_drivers d ON d.session_id=s.id AND d.driver_ordinal=?
    WHERE s.id=?`).get(driverOrdinal, sessionId) as {
      layout_key: string; track_venue: string; track_course: string; driver_id: number;
      driver_class: string;
    } | undefined;
  if (!target) return null;
  if (!isSessionSummaryReady(db)) return { driverOrdinal, bestLapTime: null, ready: false };

  const scope = personalBestScope(target.layout_key,target.track_venue,target.track_course);
  const carClass = target.driver_class;
  return {
    driverOrdinal,
    bestLapTime: queryPersonalBest(db,scope,carClass,target.driver_id),
    ready: true,
  };
}

export function querySessionContext(db: Database, session: DetailedSession) {
  if (!isSessionSummaryReady(db)) return { relatedSessions: [], personalBests: [], ready: false };
  const scope = sessionScope(db, session);
  const bounds=3.5*60*60*1000;
  const ids=(db.prepare(`SELECT s.id FROM sessions s WHERE ${scope.where} AND s.timestamp BETWEEN ? AND ? ORDER BY s.timestamp DESC,s.id DESC`)
    .all(...scope.args,session.timestamp-bounds,session.timestamp+bounds) as Array<{id:string}>).map(row=>row.id);
  const candidates:Iterable<SessionCard>=readSessionCards(db,ids);
  const relatedSessions=findWeekendSessions(session,candidates);
  const markedPlayers = session.drivers.filter(driver => driver.isPlayer);
  const playerOrdinal = typeof session.playerDriver?.driverOrdinal === 'number'
    ? session.playerDriver.driverOrdinal
    : markedPlayers.length === 1 ? session.drivers.indexOf(markedPlayers[0]) : undefined;
  const driverOrdinal = playerOrdinal;
  const result = typeof driverOrdinal === 'number' ? querySessionPersonalBest(db, session, driverOrdinal) : null;
  const personalBests = result ? [{ driverOrdinal, bestLapTime: result.bestLapTime }] : [];
  return {relatedSessions,personalBests,ready:true};
}

