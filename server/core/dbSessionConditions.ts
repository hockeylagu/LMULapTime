import { Database as DatabaseType } from 'better-sqlite3';
import { DetailedSession } from '../../shared/types/index.js';
import { getReplayConditions } from './replay/dbReplayLapStore.js';
import { classifySessionLaps } from '../sessions/sessionLapClassification.js';
import { replayWeatherCondition, type RainOverLap } from '../../shared/domain/lapConditions.js';
import type { ReplayConditionFact } from '../replay/decode/replayFacts.js';
import { readSession } from './sessionRows/reader.js';
import { updateTargetedConditions } from './sessionRows/targeted.js';


/** The rainy spans of a replay's stored conditions; undefined when it has none stored yet. */
function storedRainSpans(db: DatabaseType, replayName: string | undefined): ReplayConditionFact[] | undefined {
  if (!replayName) return undefined;
  const conditions = getReplayConditions(db, replayName);
  return conditions.length > 0 ? conditions.filter(c => (c.rain ?? 0) > 0) : undefined;
}

type RainSpansByReplay = Map<string, ReplayConditionFact[] | undefined>;

function rainSpansFor(db: DatabaseType, replayName: string | undefined, cache?: RainSpansByReplay): ReplayConditionFact[] | undefined {
  if (!replayName) return undefined;
  if (!cache) return storedRainSpans(db, replayName);
  if (!cache.has(replayName)) cache.set(replayName, storedRainSpans(db, replayName));
  return cache.get(replayName);
}

function rainOverLapFromSpans(spans: ReplayConditionFact[] | undefined): RainOverLap | undefined {
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
 * Peak rain of a replay over a stretch of session time, from its stored conditions; undefined when
 * the replay has none (not decoded yet, or deleted before its events were stored). Session lap times
 * (the XML's et) and replay times share one clock: a replay lap starts 0-0.23 s after its et.
 */
export function replayRainOverLap(db: DatabaseType, replayName: string | undefined): RainOverLap | undefined {
  return rainOverLapFromSpans(rainSpansFor(db, replayName));
}

/**
 * The session's weather from every stored condition of its replay. The link's own figures come from
 * the replay header scan, which samples 30 windows of the stream and can miss the peak rain.
 */
function applyStoredReplayWeather(session: DetailedSession, spans: ReplayConditionFact[] | undefined): void {
  const link = session.matchingReplayFile;
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
export function classifySessionConditions(db: DatabaseType, session: DetailedSession, cache?: RainSpansByReplay): void {
  const spans = rainSpansFor(db, session.matchingReplayFile?.name, cache);
  classifySessionLaps(session.drivers ?? [], rainOverLapFromSpans(spans));
  applyStoredReplayWeather(session, spans);
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
  const rainCache: RainSpansByReplay = new Map();
  const ids = 'ids' in which
    ? which.ids
    : (db.prepare('SELECT id FROM sessions WHERE recording_name = ?').all(which.replayName) as Array<{ id: string }>).map(row => row.id);
  // Conditions and weather are updated in place, followed by targeted projection update.
  return ids.flatMap((id) => {
    const session = readSession(db, id);
    if (!session) return [];
    classifySessionConditions(db, session, rainCache);
    updateTargetedConditions(db, session, Date.now());
    return [session];
  });
}

