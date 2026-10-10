import type { Database } from 'better-sqlite3';
import type { DetailedSession } from '../types.js';
import type { SessionCard } from '../../../shared/types/sessionSummaries.js';
import { findWeekendSessions } from '../../../shared/domain/weekendSessions.js';
import { driverClass } from '../../../shared/domain/leaderboard.js';
import { isSessionSummaryReady } from './store.js';
import { readSessionCards } from './cards.js';

export function querySessionContext(db: Database, session: DetailedSession) {
  if (!isSessionSummaryReady(db)) return { relatedSessions: [], personalBests: [], ready: false };
  const source=db.prepare('SELECT layout_key FROM sessions WHERE id=?').get(session.id) as {layout_key:string};
  const bounds=3.5*60*60*1000;
  const scope=source.layout_key==='unknown' ? 'layout_key=? AND track_venue=? AND track_course=?' : 'layout_key=?';
  const scopeArgs=source.layout_key==='unknown' ? [source.layout_key,session.trackVenue,session.trackCourse] : [source.layout_key];
  const ids=(db.prepare(`SELECT id FROM sessions WHERE ${scope} AND timestamp BETWEEN ? AND ? ORDER BY timestamp DESC,id DESC`)
    .all(...scopeArgs,session.timestamp-bounds,session.timestamp+bounds) as Array<{id:string}>).map(row=>row.id);
  const candidates:Iterable<SessionCard>=readSessionCards(db,ids);
  const relatedSessions=findWeekendSessions(session,candidates);
  const best=db.prepare(`SELECT min(d.best_lap_time) best FROM session_drivers d JOIN drivers n ON n.driver_id=d.driver_id JOIN sessions s ON s.id=d.session_id
    WHERE ${scope.replace(/layout_key/g,'s.layout_key').replace(/track_venue/g,'s.track_venue').replace(/track_course/g,'s.track_course')}
    AND d.driver_class=? AND lower(n.name)=lower(?) AND d.best_lap_time>0`);
  const personalBests=session.drivers.map((driver,driverOrdinal)=>({driverOrdinal,bestLapTime:
    (best.get(...scopeArgs,driverClass(driver),driver.name) as {best:number|null}).best}));
  return {relatedSessions,personalBests,ready:true};
}

