import type { DetailedSession, DriverData, LapData, ReferenceLaptimeEntry } from '../types/index.js';
import type {
  Leaderboard,
  LeaderboardEntry,
  LeaderboardLap,
  LeaderboardLayout,
  LeaderboardLayoutClass,
  LeaderboardScope,
} from '../types/leaderboard.js';
import { getCircuitSpecification } from './circuitSpecs.js';
import { getDisplayTrackName } from './formatters.js';
import { selectCleanLapCandidates } from './lapComparison.js';
import { lapConditionGroup } from './lapConditions.js';
import { findMatchingTrackBenchmarkEntries, matchesCarClass, normalizeCarClass } from './paceCategory.js';

/**
 * Leaderboards of the drivers met on a layout, one car class at a time.
 *
 * Only real people are ranked: the player's own laps from any session, and the other drivers of
 * online (Multiplayer) sessions. Offline sessions are raced against AI, whose laps never count.
 * Only representative laps count: valid flying laps at racing speed, not marked non-representative
 * by the parser (contact, traffic, off pace), and dry (no wet tyres or rain). Layouts of one facility are
 * never mixed: every session is keyed by its circuit specification's layoutKey.
 */

export interface LeaderboardQuery {
  layoutKey: string;
  carClass: string;
  /** Limits the board to one car (scope 'car'); the whole class otherwise. */
  carType?: string | null;
}

const isPlayerDriver = (session: DetailedSession, driver: DriverData) =>
  Boolean(driver.isPlayer || (session.playerDriver && session.playerDriver.name === driver.name));

/** A multiplayer session: its mode says so, or it names the server it ran on. */
export const isOnlineSession = (session: { settings?: { modeSetting?: string; serverName?: string } }): boolean =>
  (session.settings?.modeSetting ?? '').trim().toLowerCase() === 'multiplayer' || Boolean(session.settings?.serverName);

/** A real person: the player, or anyone in an online session. Other drivers offline are AI. */
export function isHumanDriver(session: DetailedSession, driver: DriverData): boolean {
  return isOnlineSession(session) || isPlayerDriver(session, driver);
}

/**
 * The laps of a driver's session that may stand on a leaderboard. Laps on wet tyres or in the
 * rain (the parser's conditions tag) are another race than the dry board.
 */
export function selectLeaderboardLaps(laps: LapData[]): LapData[] {
  return selectCleanLapCandidates(laps).filter(
    (lap) => lap.isValid && lap.lapTime !== null && lap.lapTime > 0 && lapConditionGroup(lap) === 'dry'
  );
}

export function sessionLayoutKey(session: DetailedSession): string {
  return getCircuitSpecification(session.trackVenue, session.trackCourse, null, null, null, session.trackLengthMeters).layoutKey;
}

export function driverClass(driver: DriverData): string {
  return normalizeCarClass(driver.carClass, driver.carType);
}

const sameCar = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface DriverAccumulator {
  driverName: string;
  isPlayer: boolean;
  laps: LeaderboardLap[];
  top3Average: number | null;
  sessionIds: Set<string>;
  lastDriven: number;
}

function toLeaderboardLap(session: DetailedSession, driver: DriverData, lap: LapData): LeaderboardLap {
  const replay = session.matchingReplayFile;
  const driverOrdinal = driver.driverOrdinal ?? session.drivers.indexOf(driver);
  const lapOrdinal = lap.lapOrdinal ?? driver.laps.indexOf(lap);
  return {
    sessionId: session.id,
    sessionName: session.sessionName,
    sessionType: session.sessionType,
    timestamp: session.timestamp,
    ...(driverOrdinal >= 0 ? { driverOrdinal } : {}),
    ...(lapOrdinal >= 0 ? { lapOrdinal } : {}),
    lapNum: lap.lapNum,
    lapTime: lap.lapTime as number,
    s1: lap.s1,
    s2: lap.s2,
    s3: lap.s3,
    carType: driver.carType,
    telemetryAvailable: Boolean(typeof replay === 'string' ? replay : replay?.name),
  };
}

function top3Of(laps: LapData[]): number | null {
  if (laps.length < 3) return null;
  const times = laps.map((l) => l.lapTime as number).sort((a, b) => a - b);
  return (times[0] + times[1] + times[2]) / 3;
}

/** Visits every ranked driver of every session, with the layout and class the laps belong to. */
function forEachRankedDriver(
  sessions: DetailedSession[],
  visit: (session: DetailedSession, driver: DriverData, layoutKey: string, carClass: string, laps: LapData[]) => void
): void {
  for (const session of sessions) {
    let layoutKey: string | null = null;
    for (const driver of session.drivers ?? []) {
      if (!isHumanDriver(session, driver)) continue;
      const laps = selectLeaderboardLaps(driver.laps ?? []);
      if (laps.length === 0) continue;
      layoutKey ??= sessionLayoutKey(session);
      visit(session, driver, layoutKey, driverClass(driver), laps);
    }
  }
}

function accumulate(acc: Map<string, DriverAccumulator>, session: DetailedSession, driver: DriverData, laps: LapData[]) {
  let entry = acc.get(driver.name);
  if (!entry) {
    entry = { driverName: driver.name, isPlayer: false, laps: [], top3Average: null, sessionIds: new Set(), lastDriven: 0 };
    acc.set(driver.name, entry);
  }
  entry.isPlayer ||= isPlayerDriver(session, driver);
  for (const lap of laps) entry.laps.push(toLeaderboardLap(session, driver, lap));
  const top3 = top3Of(laps);
  if (top3 !== null && (entry.top3Average === null || top3 < entry.top3Average)) entry.top3Average = top3;
  entry.sessionIds.add(session.id);
  entry.lastDriven = Math.max(entry.lastDriven, session.timestamp);
}

const minOf = (values: Array<number | null>): number | null => {
  let best: number | null = null;
  for (const v of values) if (v !== null && v > 0 && (best === null || v < best)) best = v;
  return best;
};

/** 1-based ranks of a value per entry (null values stay unranked); ties share the better rank. */
function rankBy(entries: LeaderboardEntry[], pick: (e: LeaderboardEntry) => number | null): Array<number | null> {
  const values = entries.map(pick);
  const sorted = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  return values.map((v) => (v === null ? null : sorted.indexOf(v) + 1));
}

function toEntries(acc: Map<string, DriverAccumulator>): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (const driver of acc.values()) {
    const bestLap = driver.laps.reduce((best, lap) =>
      lap.lapTime < best.lapTime || (lap.lapTime === best.lapTime && lap.timestamp < best.timestamp) ? lap : best
    );
    const bestS1 = minOf(driver.laps.map((l) => l.s1));
    const bestS2 = minOf(driver.laps.map((l) => l.s2));
    const bestS3 = minOf(driver.laps.map((l) => l.s3));
    entries.push({
      driverName: driver.driverName,
      isPlayer: driver.isPlayer,
      rank: 0,
      bestLap,
      bestS1,
      bestS2,
      bestS3,
      s1Rank: null,
      s2Rank: null,
      s3Rank: null,
      theoreticalBest: bestS1 !== null && bestS2 !== null && bestS3 !== null ? Number((bestS1 + bestS2 + bestS3).toFixed(3)) : null,
      top3Average: driver.top3Average === null ? null : Number(driver.top3Average.toFixed(3)),
      top3AverageRank: null,
      gapToLeader: 0,
      representativeLaps: driver.laps.length,
      sessions: driver.sessionIds.size,
      lastDriven: driver.lastDriven,
    });
  }

  entries.sort((a, b) => a.bestLap.lapTime - b.bestLap.lapTime || a.bestLap.timestamp - b.bestLap.timestamp);
  const leader = entries[0]?.bestLap.lapTime ?? 0;
  const s1 = rankBy(entries, (e) => e.bestS1);
  const s2 = rankBy(entries, (e) => e.bestS2);
  const s3 = rankBy(entries, (e) => e.bestS3);
  const top3 = rankBy(entries, (e) => e.top3Average);
  entries.forEach((e, i) => {
    e.rank = i + 1;
    e.gapToLeader = Number((e.bestLap.lapTime - leader).toFixed(3));
    e.s1Rank = s1[i];
    e.s2Rank = s2[i];
    e.s3Rank = s3[i];
    e.top3AverageRank = top3[i];
  });
  return entries;
}

/**
 * The community benchmark for a layout in one class. Unlike a track-only lookup it never falls
 * back to another class: a GT3 target on a Hypercar board would be meaningless.
 */
export function findLayoutBenchmark(
  entries: Record<string, ReferenceLaptimeEntry> | ReferenceLaptimeEntry[],
  layoutKey: string,
  carClass: string
): ReferenceLaptimeEntry | null {
  const onLayout = findMatchingTrackBenchmarkEntries(entries, layoutKey);
  return onLayout.find((e) => matchesCarClass(e.carClass, '', carClass) && matchesCarClass(carClass, '', e.carClass)) ?? null;
}

export function buildLeaderboard(
  sessions: DetailedSession[],
  query: LeaderboardQuery,
  benchmarks: Record<string, ReferenceLaptimeEntry> | ReferenceLaptimeEntry[] = []
): Leaderboard {
  const carClass = normalizeCarClass(query.carClass);
  const carType = query.carType?.trim() || null;
  const acc = new Map<string, DriverAccumulator>();
  forEachRankedDriver(sessions, (session, driver, layoutKey, cls, laps) => {
    if (layoutKey !== query.layoutKey || cls !== carClass) return;
    if (carType && !sameCar(driver.carType, carType)) return;
    accumulate(acc, session, driver, laps);
  });

  const entries = toEntries(acc);
  const spec = getCircuitSpecification(query.layoutKey);
  const scope: LeaderboardScope = carType ? 'car' : 'class';
  return {
    layoutKey: query.layoutKey,
    layoutName: spec.layoutName || spec.officialName,
    carClass,
    scope,
    carType,
    entries,
    player: entries.find((e) => e.isPlayer) ?? null,
    benchmark: findLayoutBenchmark(benchmarks, query.layoutKey, carClass),
  };
}

/** The player's best representative lap of each session on a board, oldest first. */
export function playerSessionBests(
  sessions: DetailedSession[],
  query: LeaderboardQuery
): Array<{ sessionId: string; sessionName: string; timestamp: number; best: number }> {
  const carClass = normalizeCarClass(query.carClass);
  const carType = query.carType?.trim() || null;
  const bests: Array<{ sessionId: string; sessionName: string; timestamp: number; best: number }> = [];
  forEachRankedDriver(sessions, (session, driver, layoutKey, cls, laps) => {
    if (layoutKey !== query.layoutKey || cls !== carClass || !isPlayerDriver(session, driver)) return;
    if (carType && !sameCar(driver.carType, carType)) return;
    const best = Math.min(...laps.map((l) => l.lapTime as number));
    bests.push({ sessionId: session.id, sessionName: session.sessionName, timestamp: session.timestamp, best });
  });
  return bests.sort((a, b) => a.timestamp - b.timestamp);
}

interface LayoutAccumulator {
  trackName: string;
  lastDriven: number;
  lastCarClass: string;
  classes: Map<string, { lastDriven: number; lastCarType: string; drivers: Map<string, DriverAccumulator> }>;
}

/**
 * The layouts the player has driven, newest first, with the player's rank in each class driven:
 * the cards of the track ribbon.
 */
export function listLeaderboardLayouts(sessions: DetailedSession[]): LeaderboardLayout[] {
  const layouts = new Map<string, LayoutAccumulator>();
  forEachRankedDriver(sessions, (session, driver, layoutKey, cls, laps) => {
    let layout = layouts.get(layoutKey);
    if (!layout) {
      layout = { trackName: '', lastDriven: 0, lastCarClass: '', classes: new Map() };
      layouts.set(layoutKey, layout);
    }
    let byClass = layout.classes.get(cls);
    if (!byClass) {
      byClass = { lastDriven: 0, lastCarType: '', drivers: new Map() };
      layout.classes.set(cls, byClass);
    }
    accumulate(byClass.drivers, session, driver, laps);
    if (isPlayerDriver(session, driver)) {
      if (session.timestamp >= byClass.lastDriven) {
        byClass.lastDriven = session.timestamp;
        byClass.lastCarType = driver.carType;
      }
      if (session.timestamp >= layout.lastDriven) {
        layout.lastDriven = session.timestamp;
        layout.lastCarClass = cls;
        layout.trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
      }
    }
  });

  const result: LeaderboardLayout[] = [];
  for (const [layoutKey, layout] of layouts) {
    const classes: LeaderboardLayoutClass[] = [];
    for (const [carClass, byClass] of layout.classes) {
      if (byClass.lastDriven === 0) continue; // only others drove this class here
      const entries = toEntries(byClass.drivers);
      const player = entries.find((e) => e.isPlayer) ?? null;
      classes.push({
        carClass,
        lastDriven: byClass.lastDriven,
        lastCarType: byClass.lastCarType,
        playerBest: player?.bestLap.lapTime ?? null,
        playerRank: player?.rank ?? null,
        fieldSize: entries.length,
      });
    }
    if (classes.length === 0) continue; // the player never drove here
    classes.sort((a, b) => b.lastDriven - a.lastDriven);
    const spec = getCircuitSpecification(layoutKey);
    result.push({
      layoutKey,
      layoutName: spec.layoutName || spec.officialName,
      trackName: layout.trackName,
      circuitName: spec.officialName || layout.trackName,
      countryCode: spec.countryCode,
      flagEmoji: spec.flagEmoji,
      lastDriven: layout.lastDriven,
      lastCarClass: layout.lastCarClass,
      classes,
    });
  }
  return result.sort((a, b) => b.lastDriven - a.lastDriven);
}
