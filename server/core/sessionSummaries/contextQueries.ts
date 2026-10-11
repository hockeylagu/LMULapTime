import type { Database } from 'better-sqlite3';
import type { DetailedSession } from '../types.js';
import type { SessionCard } from '../../../shared/types/sessionSummaries.js';
import { findWeekendSessions } from '../../../shared/domain/weekendSessions.js';
import { driverClass } from '../../../shared/domain/leaderboard.js';
import { normalizeCarClass } from '../../../shared/domain/paceCategory.js';
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

function queryPersonalBest(db: Database, scope: PersonalBestScope, carClass: string, driverName: string): number | null {
  const best = db.prepare(`SELECT min(d.best_lap_time) best FROM sessions s
    CROSS JOIN session_drivers d ON d.session_id=s.id
    JOIN drivers n ON n.driver_id=d.driver_id
    WHERE ${scope.where} AND d.driver_class=? AND lower(n.name)=lower(?) AND d.best_lap_time>0`);
  return (best.get(...scope.args,carClass,driverName) as { best: number | null }).best;
}

export function querySessionPersonalBest(db: Database, session: DetailedSession, driverOrdinal: number) {
  if (!isSessionSummaryReady(db)) return { driverOrdinal, bestLapTime: null, ready: false };
  const driver = session.drivers[driverOrdinal];
  return { driverOrdinal, bestLapTime: queryPersonalBest(db, sessionScope(db, session), driverClass(driver), driver.name), ready: true };
}

/** Reads only the selected driver's identity and session layout for the on-demand PB endpoint. */
export function querySessionPersonalBestById(db: Database, sessionId: string, driverOrdinal: number) {
  const target = db.prepare(`SELECT s.layout_key,s.track_venue,s.track_course,n.name,v.car_type,v.car_class,d.driver_class
    FROM sessions s JOIN session_drivers d ON d.session_id=s.id AND d.driver_ordinal=?
    LEFT JOIN drivers n ON n.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
    WHERE s.id=?`).get(driverOrdinal, sessionId) as {
      layout_key: string; track_venue: string; track_course: string; name: string | null;
      car_type: string | null; car_class: string | null; driver_class: string | null;
    } | undefined;
  if (!target) return null;
  if (!isSessionSummaryReady(db)) return { driverOrdinal, bestLapTime: null, ready: false };

  const scope = personalBestScope(target.layout_key,target.track_venue,target.track_course);
  const carClass = target.driver_class ?? normalizeCarClass(target.car_class ?? '', target.car_type ?? '');
  return {
    driverOrdinal,
    bestLapTime: queryPersonalBest(db,scope,carClass,target.name ?? ''),
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
  const playerOrdinal = session.drivers.findIndex(driver => driver.name === session.playerDriver?.name);
  const driverOrdinal = playerOrdinal >= 0 ? playerOrdinal : 0;
  const result = session.drivers[driverOrdinal] ? querySessionPersonalBest(db, session, driverOrdinal) : null;
  const personalBests = result ? [{ driverOrdinal, bestLapTime: result.bestLapTime }] : [];
  return {relatedSessions,personalBests,ready:true};
}

