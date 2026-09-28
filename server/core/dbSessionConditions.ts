import { Database as DatabaseType } from 'better-sqlite3';
import { DetailedSession } from './types.js';
import { getReplayConditions } from './replay/dbReplayLapStore.js';
import { classifySessionLaps } from '../sessions/sessionLapClassification.js';
import type { RainOverLap } from '../../shared/domain/lapConditions.js';

/**
 * Peak rain of a replay over a stretch of session time, from its stored conditions; undefined when
 * the replay has none (not decoded yet, or deleted before its events were stored). Session lap times
 * (the XML's et) and replay times share one clock: a replay lap starts 0-0.23 s after its et.
 */
export function replayRainOverLap(db: DatabaseType, replayName: string | undefined): RainOverLap | undefined {
  if (!replayName) return undefined;
  const spans = getReplayConditions(db, replayName).filter(c => (c.rain ?? 0) > 0);
  const hasConditions = spans.length > 0 || db.prepare('SELECT 1 FROM replay_conditions WHERE filename = ? LIMIT 1').get(replayName);
  if (!hasConditions) return undefined;
  return (startSec, endSec) => {
    let peak = 0;
    for (const span of spans) {
      if (span.startSec >= endSec) break;
      if (span.endSec > startSec) peak = Math.max(peak, span.rain ?? 0);
    }
    return peak;
  };
}

/**
 * Classifies a session's laps with its linked replay's rain (sessionLapClassification.ts). The
 * player's copy (playerDriver) is stored apart from `drivers`, so it is replaced by the classified one.
 */
export function classifySessionConditions(db: DatabaseType, session: DetailedSession): void {
  classifySessionLaps(session.drivers ?? [], replayRainOverLap(db, session.matchingReplayFile?.name));
  if (session.playerDriver) {
    const player = session.drivers?.find(d => d.name === session.playerDriver?.name);
    if (player) session.playerDriver = player;
  }
}

/**
 * Classifies stored sessions again and rewrites their rows: the sessions whose ids are given, or the
 * sessions linked to a replay whose conditions were just stored. Returns the sessions rewritten.
 */
export function reclassifyStoredSessions(db: DatabaseType, which: { ids: string[] } | { replayName: string }): DetailedSession[] {
  const rows = 'ids' in which
    ? which.ids.map(id => db.prepare('SELECT id, data_json FROM sessions WHERE id = ?').get(id) as { id: string; data_json: string } | undefined)
      .filter((row): row is { id: string; data_json: string } => row !== undefined)
    : db.prepare("SELECT id, data_json FROM sessions WHERE json_extract(metadata_json, '$.matchingReplayFile.name') = ?")
      .all(which.replayName) as Array<{ id: string; data_json: string }>;
  const update = db.prepare('UPDATE sessions SET metadata_json = ?, data_json = ?, updated_at = ? WHERE id = ?');
  return rows.map((row) => {
    const session = JSON.parse(row.data_json) as DetailedSession;
    classifySessionConditions(db, session);
    const { drivers: _drivers, ...meta } = session;
    update.run(JSON.stringify(meta), JSON.stringify(session), Date.now(), row.id);
    return session;
  });
}
