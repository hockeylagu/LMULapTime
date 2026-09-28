import { Database as DatabaseType } from 'better-sqlite3';
import { ReplayTrajectoryData } from '../types.js';
import {
  ReplayConditionFact,
  ReplayDriverEventFact,
  ReplayDriverEventKind,
  ReplayLapFact,
  ReplayRunningOrderFact,
  ReplayWideFacts,
  LapSpan,
  emptyLapFact,
  factsDriverSlot,
  lapFactsFrom,
  lapSpanFrom,
  replayWideFactsFrom,
} from '../../replay/replayFacts.js';

// The normalized replay tables (see dbSchema.ts): replay_facts, replay_laps, replay_conditions,
// replay_driver_events and replay_running_order. Writers run inside the caller's transaction.

const REPLAY_WIDE_TABLES = ['replay_conditions', 'replay_driver_events', 'replay_running_order', 'replay_facts'] as const;
const ALL_FACT_TABLES = [...REPLAY_WIDE_TABLES, 'replay_laps'] as const;

const toInt = (value: boolean | null): number | null => (value === null ? null : value ? 1 : 0);
const toBool = (value: number | null): boolean | null => (value === null ? null : value !== 0);

interface LapRow {
  lap_number: number;
  start_sec: number | null;
  end_sec: number | null;
  lap_time_sec: number | null;
  s1_sec: number | null;
  s2_sec: number | null;
  s3_sec: number | null;
  lap_dist_m: number | null;
  is_outlap: number | null;
  is_valid: number | null;
  is_best: number | null;
  start_frame: number | null;
  end_frame: number | null;
}

/** Replaces one driver's lap facts. */
export function replaceReplayDriverLapFacts(db: DatabaseType, filename: string, driverSlot: number, laps: ReadonlyArray<ReplayLapFact>, sourceVersion: string): void {
  db.prepare('DELETE FROM replay_laps WHERE filename = ? AND driver_slot = ?').run(filename, driverSlot);
  const insert = db.prepare(`
    INSERT INTO replay_laps (filename, driver_slot, lap_number, start_sec, end_sec, lap_time_sec, s1_sec, s2_sec, s3_sec,
      lap_dist_m, is_outlap, is_valid, is_best, start_frame, end_frame, source_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const lap of laps) {
    insert.run(filename, driverSlot, lap.lapNumber, lap.startSec, lap.endSec, lap.lapTimeSec, lap.s1Sec, lap.s2Sec, lap.s3Sec,
      lap.lapDistM, toInt(lap.isOutlap), toInt(lap.isValid), toInt(lap.isBest), lap.startFrame, lap.endFrame, sourceVersion);
  }
}

/** Replaces a replay's replay-wide facts (conditions, driver events, running order). */
export function replaceReplayWideFacts(db: DatabaseType, filename: string, facts: ReplayWideFacts, sourceVersion: string): void {
  for (const table of REPLAY_WIDE_TABLES) db.prepare(`DELETE FROM ${table} WHERE filename = ?`).run(filename);
  db.prepare('INSERT INTO replay_facts (filename, source_version, end_sec, session_running_order, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(filename, sourceVersion, facts.endSec, facts.sessionRunningOrder ? JSON.stringify(facts.sessionRunningOrder) : null, Date.now());
  const condition = db.prepare(`
    INSERT INTO replay_conditions (filename, start_sec, end_sec, rain, ambient_c, flag_state, sector_mask, driver_flag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of facts.conditions) condition.run(filename, c.startSec, c.endSec, c.rain, c.ambientC, c.flagState, c.sectorMask, c.driverFlag);
  const event = db.prepare(`
    INSERT INTO replay_driver_events (filename, kind, seq, driver_slot, time_sec, code, value, other_slot, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const e of facts.driverEvents) {
    event.run(filename, e.kind, e.seq, e.driverSlot, e.timeSec, e.code, e.value, e.otherSlot, e.detail ? JSON.stringify(e.detail) : null);
  }
  const order = db.prepare('INSERT INTO replay_running_order (filename, time_sec, order_json) VALUES (?, ?, ?)');
  for (const o of facts.runningOrder) order.run(filename, o.timeSec, JSON.stringify(o.order));
}

/** The parser version the replay's replay-wide facts come from; null when none are stored. */
export function getReplayFactsVersion(db: DatabaseType, filename: string): string | null {
  const row = db.prepare('SELECT source_version FROM replay_facts WHERE filename = ?').get(filename) as { source_version: string } | undefined;
  return row?.source_version ?? null;
}

export function getReplayFactsEnd(db: DatabaseType, filename: string): { endSec: number; sessionRunningOrder: number[] | null } | null {
  const row = db.prepare('SELECT end_sec, session_running_order FROM replay_facts WHERE filename = ?').get(filename) as
    { end_sec: number; session_running_order: string | null } | undefined;
  if (!row) return null;
  return { endSec: row.end_sec, sessionRunningOrder: row.session_running_order ? JSON.parse(row.session_running_order) as number[] : null };
}

export interface ReplayLapFactRow extends ReplayLapFact {
  driverSlot: number;
}

/** The lap facts of a replay, or of one of its drivers, by driver then lap. */
export function getReplayLaps(db: DatabaseType, filename: string, driverSlot?: number): ReplayLapFactRow[] {
  const rows = (driverSlot === undefined
    ? db.prepare('SELECT * FROM replay_laps WHERE filename = ? ORDER BY driver_slot, lap_number').all(filename)
    : db.prepare('SELECT * FROM replay_laps WHERE filename = ? AND driver_slot = ? ORDER BY lap_number').all(filename, driverSlot)) as Array<LapRow & { driver_slot: number }>;
  return rows.map(r => ({
    driverSlot: r.driver_slot,
    lapNumber: r.lap_number,
    startSec: r.start_sec,
    endSec: r.end_sec,
    lapTimeSec: r.lap_time_sec,
    s1Sec: r.s1_sec,
    s2Sec: r.s2_sec,
    s3Sec: r.s3_sec,
    lapDistM: r.lap_dist_m,
    isOutlap: toBool(r.is_outlap),
    isValid: toBool(r.is_valid),
    isBest: toBool(r.is_best),
    startFrame: r.start_frame,
    endFrame: r.end_frame,
  }));
}

export function getReplayConditions(db: DatabaseType, filename: string): ReplayConditionFact[] {
  const rows = db.prepare('SELECT * FROM replay_conditions WHERE filename = ? ORDER BY start_sec').all(filename) as Array<{
    start_sec: number; end_sec: number; rain: number | null; ambient_c: number | null; flag_state: number | null; sector_mask: number | null; driver_flag: number | null;
  }>;
  return rows.map(r => ({
    startSec: r.start_sec, endSec: r.end_sec, rain: r.rain, ambientC: r.ambient_c, flagState: r.flag_state, sectorMask: r.sector_mask, driverFlag: r.driver_flag,
  }));
}

export interface ReplayLapConditions {
  driverSlot: number;
  lapNumber: number;
  maxRain: number | null;
  rainAtStart: number | null;
  minAmbientC: number | null;
  fullCourseYellow: boolean;
}

/** Each lap's conditions over its time span (the replay_lap_conditions view). */
export function getLapConditions(db: DatabaseType, filename: string): ReplayLapConditions[] {
  const rows = db.prepare('SELECT * FROM replay_lap_conditions WHERE filename = ? ORDER BY driver_slot, lap_number').all(filename) as Array<{
    driver_slot: number; lap_number: number; max_rain: number | null; rain_at_start: number | null; min_ambient_c: number | null; full_course_yellow: number;
  }>;
  return rows.map(r => ({
    driverSlot: r.driver_slot, lapNumber: r.lap_number, maxRain: r.max_rain, rainAtStart: r.rain_at_start,
    minAmbientC: r.min_ambient_c, fullCourseYellow: r.full_course_yellow === 1,
  }));
}

/** A replay's driver events, optionally one driver's and within [fromSec, toSec], in time order. */
export function getDriverEvents(db: DatabaseType, filename: string, options: { driverSlot?: number; fromSec?: number; toSec?: number } = {}): ReplayDriverEventFact[] {
  const rows = db.prepare(`
    SELECT kind, seq, driver_slot, time_sec, code, value, other_slot, detail FROM replay_driver_events
    WHERE filename = @filename
      AND (@driverSlot IS NULL OR driver_slot = @driverSlot)
      AND (@fromSec IS NULL OR time_sec >= @fromSec)
      AND (@toSec IS NULL OR time_sec <= @toSec)
    ORDER BY time_sec, kind, seq
  `).all({ filename, driverSlot: options.driverSlot ?? null, fromSec: options.fromSec ?? null, toSec: options.toSec ?? null }) as Array<{
    kind: ReplayDriverEventKind; seq: number; driver_slot: number; time_sec: number; code: number | null; value: number | null; other_slot: number | null; detail: string | null;
  }>;
  return rows.map(r => ({
    kind: r.kind, seq: r.seq, driverSlot: r.driver_slot, timeSec: r.time_sec, code: r.code, value: r.value, otherSlot: r.other_slot,
    detail: r.detail ? JSON.parse(r.detail) as Record<string, unknown> : null,
  }));
}

export function getRunningOrder(db: DatabaseType, filename: string): ReplayRunningOrderFact[] {
  return (db.prepare('SELECT time_sec, order_json FROM replay_running_order WHERE filename = ? ORDER BY time_sec').all(filename) as Array<{ time_sec: number; order_json: string }>)
    .map(r => ({ timeSec: r.time_sec, order: JSON.parse(r.order_json) as number[] }));
}

/** Drops one driver's lap facts (the replay-wide facts belong to every driver and stay). */
export function deleteReplayDriverLapFacts(db: DatabaseType, filename: string, driverSlot: number): void {
  db.prepare('DELETE FROM replay_laps WHERE filename = ? AND driver_slot = ?').run(filename, driverSlot);
}

/** Moves every fact of a replay to its new name (a stored recording archived on a name collision). */
export function renameReplayFacts(db: DatabaseType, filename: string, newName: string): void {
  for (const table of ALL_FACT_TABLES) db.prepare(`UPDATE ${table} SET filename = ? WHERE filename = ?`).run(newName, filename);
}

/**
 * Writes the facts of a new decode of one driver, in the transaction that stores its lap rows: the
 * driver's lap facts, and the replay-wide facts when none are stored at this parser version yet
 * (every driver's decode holds the same replay-wide arrays).
 */
export function storeDecodedReplayFacts(db: DatabaseType, filename: string, driverSlotKey: number, trajectory: ReplayTrajectoryData, sourceVersion: string): void {
  const perLap = trajectory.allLapsData && trajectory.allLapsData.length > 0 ? trajectory.allLapsData : [trajectory];
  const spans = new Map<number, LapSpan>();
  const storedLaps: number[] = [];
  for (const lap of perLap) {
    if (typeof lap.currentLap !== 'number' || lap.currentLap <= 0) continue;
    storedLaps.push(lap.currentLap);
    const span = lapSpanFrom(lap.points ?? []);
    if (span) spans.set(lap.currentLap, span);
  }
  // A decode that could not name its slot (-1) has no driver to file the laps under.
  const slot = factsDriverSlot(driverSlotKey, trajectory);
  if (slot !== null) {
    const facts = lapFactsFrom(trajectory.laps ?? [], spans);
    // Every stored lap gets its row, even without a list entry or a timed sample.
    for (const lapNumber of storedLaps) {
      if (!facts.some(f => f.lapNumber === lapNumber)) facts.push(emptyLapFact(lapNumber));
    }
    facts.sort((a, b) => a.lapNumber - b.lapNumber);
    replaceReplayDriverLapFacts(db, filename, slot, facts, sourceVersion);
  }
  if (getReplayFactsVersion(db, filename) !== sourceVersion) {
    const lastLapEnd = Math.max(0, ...[...spans.values()].map(s => s.endSec));
    replaceReplayWideFacts(db, filename, replayWideFactsFrom(trajectory, lastLapEnd), sourceVersion);
  }
}
