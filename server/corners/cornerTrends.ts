import { sessionKindOf } from '../../shared/domain/compareLapScope.js';
import { median } from '../../shared/domain/pitStops.js';
import type { CornerTrend, CornerTrendPoint, CornerTrendsResponse } from '../../shared/types/corners/cornerTrends.js';
import type { CornerTrendPassRow, CornerTrendScope, CornerTrendSessionRow } from '../core/replay/dbCornerTrendStore.js';
import type { StoredSequenceMap } from '../core/replay/dbSequenceMapStore.js';
import { layoutPassKey, placeLayout, type TrackLoader } from './cornerPassService.js';
import { placedLayoutCorners } from './sessionCornerPasses.js';

/**
 * Fewer counted passes than this in a session: no point for it (one or two laps say little about a habit). On a long
 * layout two will do (driver, 2026-11-19): a short Le Mans race holds two counted laps, lap 1 never counting.
 */
const MIN_TREND_PASSES = 3;
const LONG_LAYOUT_MIN_TREND_PASSES = 2;
const LONG_LAYOUT_M = 10_000;

export const minTrendPasses = (lengthM: number): number => (lengthM >= LONG_LAYOUT_M ? LONG_LAYOUT_MIN_TREND_PASSES : MIN_TREND_PASSES);
/** A qualifying session's point can be its one flying lap (driver, 2026-11-19); the class reference stays a usual. */
const QUALIFYING_MIN_TREND_PASSES = 1;

/** The driver a corner's cost is against (`CornerAnalysis.target`): one car of another session. */
export interface TrendTarget { sessionId: string; driverOrdinal: number }

export interface CornerTrendReader {
  getSequenceMap(layoutKey: string, carClass: string): StoredSequenceMap | null;
  listCornerTrendSessions(scope: CornerTrendScope): CornerTrendSessionRow[];
  listCornerTrendPasses(scope: CornerTrendScope): CornerTrendPassRow[];
}

/** One car's counted passes through one corner in one session, as a point; null below the minimum. */
function pointOf(session: CornerTrendSessionRow, passes: readonly CornerTrendPassRow[], minPasses: number): CornerTrendPoint | null {
  if (passes.length < minPasses) return null;
  const times = passes.map(pass => pass.durationMs);
  return {
    sessionId: session.sessionId, timestamp: session.timestamp, sessionType: session.sessionType, sessionName: session.sessionName,
    carType: session.carType, passCount: passes.length, usualSec: (median(times) ?? 0) / 1000, bestSec: Math.min(...times) / 1000,
  };
}

const groupBy =<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(key(row));
    if (list) list.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
};

/**
 * The driver's corner times at a layout, session by session, for a class (and car model): each corner of the class's
 * map (else the official turns) with a point per session of at least `minTrendPasses` counted dry passes (one in
 * qualifying), and as the reference the target's usual through the corner (the driver the habit's cost is against,
 * measured here the way the points are), else the class's fastest usual by another driver (same minimum; among the
 * quickest by lap time), as the cost falls back to it. Only passes of the current build and map count; the sessions
 * left out are counted by reason. Null without a centre line.
 */
export function readCornerTrends(
  reader: CornerTrendReader, layoutKey: string, carClass: string, carType = '', loadTrack?: TrackLoader, target: TrendTarget | null = null,
): CornerTrendsResponse | null {
  const layout = placeLayout(layoutKey, loadTrack);
  if (!layout) return null;
  const { corners, map } = placedLayoutCorners(layout, carClass, (layoutOf, classOf) => reader.getSequenceMap(layoutOf, classOf));
  const minPasses = minTrendPasses(layout.lengthM);
  const scope: CornerTrendScope = {
    layoutKey, carClass, carType: carType.trim().toLowerCase(), kind: corners.kind,
    buildPrefix: layoutPassKey(layout), mapMarker: map ? `|${carClass}:${map.mapKey}|` : '', minLaps: minPasses,
  };
  const sessions = reader.listCornerTrendSessions(scope);
  const bySession = new Map(sessions.map(session => [session.sessionId, session]));
  const rows = reader.listCornerTrendPasses(scope);

  const own = groupBy(rows.filter(row => row.isPlayer && bySession.has(row.sessionId)), row => `${row.segment}|${row.sessionId}`);
  const others = groupBy(rows.filter(row => !row.isPlayer), row => `${row.segment}|${row.sessionId}|${row.driverOrdinal}`);
  const reference = new Map<number, { usualSec: number; sessionId: string }>();
  const targetUsual = new Map<number, number>();
  for (const passes of others.values()) {
    if (passes.length < minPasses) continue;
    const { segment, sessionId, driverOrdinal } = passes[0];
    const usualSec = (median(passes.map(pass => pass.durationMs)) ?? 0) / 1000;
    if (target && sessionId === target.sessionId && driverOrdinal === target.driverOrdinal) targetUsual.set(segment, usualSec);
    const best = reference.get(segment);
    // Tied: the earlier session id, whatever order the query returns rows in.
    if (!best || usualSec < best.usualSec || (usualSec === best.usualSec && sessionId < best.sessionId)) reference.set(segment, { usualSec, sessionId });
  }

  const withPoint = new Set<string>();
  const trends: CornerTrend[] = corners.corners.map(corner => {
    const points = sessions.flatMap(session => {
      const point = pointOf(session, own.get(`${corner.id}|${session.sessionId}`) ?? [],
        sessionKindOf(session.sessionType) === 'quali' ? QUALIFYING_MIN_TREND_PASSES : minPasses);
      if (point) withPoint.add(session.sessionId);
      return point ? [point] : [];
    });
    const usualSec = targetUsual.get(corner.id) ?? reference.get(corner.id)?.usualSec;
    return {
      id: corner.id, label: corner.label, title: corner.title, name: corner.name || corner.label || corner.title, points,
      reference: usualSec === undefined ? null : { usualSec },
      // The route adds it from the corner analysis (readCornerHabitTrends), which reads these minimums from here.
      habit: null,
    };
  });
  return {
    corners: trends,
    sessions: {
      total: sessions.length,
      noReplay: sessions.filter(session => !session.filename).length,
      waiting: sessions.filter(session => session.filename && !session.current).length,
      tooFewPasses: sessions.filter(session => session.current && !withPoint.has(session.sessionId)).length,
    },
  };
}
