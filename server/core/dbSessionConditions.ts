import { Database as DatabaseType } from 'better-sqlite3';
import { DetailedSession } from './types.js';
import { getReplayConditions } from './replay/dbReplayLapStore.js';
import { classifySessionLaps } from '../sessions/sessionLapClassification.js';
import { replayWeatherCondition, type RainOverLap } from '../../shared/domain/lapConditions.js';
import type { ReplayConditionFact } from '../replay/decode/replayFacts.js';
import { persistSessionProjection } from './sessionSummaries/store.js';
import { loadSession, writeSessionJson } from './sessionRows/access.js';

/** The rainy spans of a replay's stored conditions; undefined when it has none stored yet. */
function storedRainSpans(db: DatabaseType, replayName: string | undefined): ReplayConditionFact[] | undefined {
  if (!replayName) return undefined;
  const spans = getReplayConditions(db, replayName).filter(c => (c.rain ?? 0) > 0);
  const hasConditions = spans.length > 0 || db.prepare('SELECT 1 FROM replay_conditions WHERE filename = ? LIMIT 1').get(replayName);
  return hasConditions ? spans : undefined;
}

/**
 * Peak rain of a replay over a stretch of session time, from its stored conditions; undefined when
 * the replay has none (not decoded yet, or deleted before its events were stored). Session lap times
 * (the XML's et) and replay times share one clock: a replay lap starts 0-0.23 s after its et.
 */
export function replayRainOverLap(db: DatabaseType, replayName: string | undefined): RainOverLap | undefined {
  const spans = storedRainSpans(db, replayName);
  if (!spans) return undefined;
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
 * The session's weather from every stored condition of its replay. The link's own figures come from
 * the replay header scan, which samples 30 windows of the stream and can miss the peak rain.
 */
function applyStoredReplayWeather(db: DatabaseType, session: DetailedSession): void {
  const link = session.matchingReplayFile;
  const spans = storedRainSpans(db, link?.name);
  if (!link || !spans) return;
  const peak = spans.reduce((max, span) => Math.max(max, span.rain ?? 0), 0);
  link.hasRain = peak > 0;
  link.weatherCondition = replayWeatherCondition(peak);
  if (peak > 0) link.maxRainIntensity = peak;
  else delete link.maxRainIntensity;
}

/**
 * Classifies a session's laps with its linked replay's rain (sessionLapClassification.ts). The
 * player's copy (playerDriver) is stored apart from `drivers`, so it is replaced by the classified one.
 */
export function classifySessionConditions(db: DatabaseType, session: DetailedSession): void {
  classifySessionLaps(session.drivers ?? [], replayRainOverLap(db, session.matchingReplayFile?.name));
  applyStoredReplayWeather(db, session);
  if (session.playerDriver) {
    const player = session.drivers?.find(d => d.isPlayer) ?? session.drivers?.find(d => d.name === session.playerDriver?.name);
    if (player) session.playerDriver = player;
  }
}

/**
 * Classifies stored sessions again and rewrites their rows: the sessions whose ids are given, or the
 * sessions linked to a replay whose conditions were just stored. Returns the sessions rewritten.
 */
export function reclassifyStoredSessions(db: DatabaseType, which: { ids: string[] } | { replayName: string }): DetailedSession[] {
  const ids = 'ids' in which
    ? which.ids
    : (db.prepare('SELECT id FROM sessions WHERE recording_name = ?').all(which.replayName) as Array<{ id: string }>).map(row => row.id);
  // The rows are rewritten whole: classification can change lap conditions and reasons, the link's
  // weather and the best-lap flags, and the derived lap columns and summaries follow from them.
  return ids.flatMap((id) => {
    const session = loadSession(db, id);
    if (!session) return [];
    classifySessionConditions(db, session);
    db.transaction(() => {
      writeSessionJson(db, session, Date.now());
      persistSessionProjection(db, session);
    })();
    return [session];
  });
}
