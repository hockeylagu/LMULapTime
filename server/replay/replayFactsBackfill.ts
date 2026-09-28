import zlib from 'zlib';
import { Database as DatabaseType } from 'better-sqlite3';
import { ReplayFactsBackfillStatus, ReplayLapSummary } from '../core/types.js';
import { decompressTrajectory, upgradeStoredTrajectory } from '../core/replay/replayTrajectoryCodec.js';
import { getReplayFactsVersion, getReplayLapDrivers, replaceReplayDriverLapFacts, replaceReplayWideFacts } from '../core/replay/dbReplayLapStore.js';
import { LapSpan, emptyLapFact, lapFactsFrom, replayWideFactsFrom } from './replayFacts.js';

// Fills the normalized replay tables (dbSchema.ts) for laps stored before they existed, from the
// stored rows alone: no replay is decoded again, so replays LMU has deleted are included. It only
// reads their rows. One transaction per replay; a replay is done once it has its replay-wide facts
// and every driver with stored laps has lap facts, so an interrupted run resumes where it stopped.

export interface ReplayFactsBackfillProgress {
  processed: number;
  total: number;
  currentFile: string;
}

export interface ReplayFactsBackfillResult {
  replays: number;
  laps: number;
  interrupted: boolean;
}

/** Replays with stored laps that lack their replay-wide facts or a driver's lap facts. */
export function listReplayFactsBacklog(db: DatabaseType): string[] {
  return (db.prepare(`
    SELECT DISTINCT t.filename FROM replay_trajectories t
    WHERE t.lap_key > 0 AND t.driver_slot >= 0
      AND (NOT EXISTS (SELECT 1 FROM replay_facts f WHERE f.filename = t.filename)
        OR NOT EXISTS (SELECT 1 FROM replay_laps l WHERE l.filename = t.filename AND l.driver_slot = t.driver_slot))
    ORDER BY t.filename
  `).all() as Array<{ filename: string }>).map(r => r.filename);
}

interface StoredLapHead {
  laps?: ReplayLapSummary[];
  pointsLength?: number;
  constants?: Record<string, unknown>;
  columns?: Record<string, Array<unknown>>;
  points?: Array<{ timeSec?: unknown }>;
}

/** A stored lap's lap list and time span, without turning its columns into point objects. */
export function readStoredLapHead(blob: Buffer): { laps: ReplayLapSummary[]; span: LapSpan | null } {
  const stored = JSON.parse(zlib.brotliDecompressSync(blob).toString('utf8')) as StoredLapHead;
  const times = stored.points
    ? stored.points.map(p => p.timeSec)
    : stored.columns?.timeSec ?? (stored.constants?.timeSec !== undefined ? [stored.constants.timeSec] : []);
  const numbers = times.filter((t): t is number => typeof t === 'number');
  const span = numbers.length > 0 ? { startSec: numbers[0], endSec: numbers[numbers.length - 1] } : null;
  return { laps: stored.laps ?? [], span };
}

const versionNumber = (version: string): number => Number(version.replace(/^v/, '')) || 0;

interface RowKey {
  driver_slot: number;
  lap_key: number;
  parser_version: string;
}

const yieldToEventLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

/** Backfills one replay; returns how many lap facts it wrote. Yields between stored rows. */
async function backfillReplay(db: DatabaseType, filename: string): Promise<number> {
  const keys = db.prepare(
    'SELECT driver_slot, lap_key, parser_version FROM replay_trajectories WHERE filename = ? AND lap_key > 0 AND driver_slot >= 0 ORDER BY driver_slot, lap_key'
  ).all(filename) as RowKey[];
  if (keys.length === 0) return 0;
  const blobOf = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE filename = ? AND driver_slot = ? AND lap_key = ?');
  const readBlob = (key: RowKey): Buffer | null =>
    (blobOf.get(filename, key.driver_slot, key.lap_key) as { trajectory_br: Buffer } | undefined)?.trajectory_br ?? null;

  const newest = keys.reduce((best, key) => (versionNumber(key.parser_version) > versionNumber(best.parser_version) ? key : best));
  const newestBlob = getReplayFactsVersion(db, filename) === null ? readBlob(newest) : null;
  const wide = newestBlob
    ? { facts: replayWideFactsFrom(upgradeStoredTrajectory(decompressTrajectory(newestBlob), newest.parser_version)), version: newest.parser_version }
    : null;

  const haveLaps = new Set(getReplayLapDrivers(db, filename));
  const drivers = new Map<number, { laps: ReplayLapSummary[]; spans: Map<number, LapSpan>; lapKeys: number[]; version: string }>();
  for (const key of keys) {
    if (haveLaps.has(key.driver_slot)) continue;
    await yieldToEventLoop();
    const blob = readBlob(key);
    // Rows replaced by a decode during the yields are that decode's to index.
    if (!blob) continue;
    const head = readStoredLapHead(blob);
    const driver = drivers.get(key.driver_slot) ?? { laps: head.laps, spans: new Map<number, LapSpan>(), lapKeys: [], version: key.parser_version };
    driver.lapKeys.push(key.lap_key);
    if (head.span) driver.spans.set(key.lap_key, head.span);
    if (versionNumber(key.parser_version) > versionNumber(driver.version)) {
      driver.laps = head.laps;
      driver.version = key.parser_version;
    }
    drivers.set(key.driver_slot, driver);
  }

  let laps = 0;
  db.transaction(() => {
    // A decode stored while this replay's rows were being read has written fresher facts: keep them.
    if (wide && getReplayFactsVersion(db, filename) === null) {
      const lastLapEnd = Math.max(wide.facts.endSec, ...[...drivers.values()].flatMap(d => [...d.spans.values()].map(s => s.endSec)));
      replaceReplayWideFacts(db, filename, { ...wide.facts, endSec: lastLapEnd, conditions: extendLast(wide.facts.conditions, lastLapEnd) }, wide.version);
    }
    const nowHaveLaps = new Set(getReplayLapDrivers(db, filename));
    for (const [slot, driver] of drivers) {
      if (nowHaveLaps.has(slot)) continue;
      const facts = lapFactsFrom(driver.laps, driver.spans);
      // A stored lap with neither a list entry nor a timed sample still gets its row: the driver is done.
      for (const lapKey of driver.lapKeys) {
        if (!facts.some(f => f.lapNumber === lapKey)) facts.push(emptyLapFact(lapKey));
      }
      replaceReplayDriverLapFacts(db, filename, slot, facts, driver.version);
      laps += facts.length;
    }
  })();
  return laps;
}

function extendLast<T extends { endSec: number }>(rows: T[], endSec: number): T[] {
  if (rows.length === 0) return rows;
  const last = rows[rows.length - 1];
  return [...rows.slice(0, -1), { ...last, endSec: Math.max(last.endSec, endSec) }];
}

export async function* backfillReplayFactsAsyncIterator(
  db: DatabaseType,
  options: { shouldStop?: () => boolean } = {}
): AsyncGenerator<ReplayFactsBackfillProgress, ReplayFactsBackfillResult, void> {
  const backlog = listReplayFactsBacklog(db);
  let laps = 0;
  let replays = 0;
  for (const filename of backlog) {
    if (options.shouldStop?.()) return { replays, laps, interrupted: true };
    yield { processed: replays, total: backlog.length, currentFile: filename };
    laps += await backfillReplay(db, filename);
    replays++;
  }
  return { replays, laps, interrupted: false };
}

function idleStatus(): ReplayFactsBackfillStatus {
  return { running: false, processed: 0, total: 0, currentFile: null, startedAt: null, finishedAt: null, result: null, error: null };
}

/**
 * Runs the backfill in the background, after the replay upgrade (serverContext.ts). A scan asks it
 * to stop, which it does between replays; the next run resumes from the backlog.
 */
export class ReplayFactsBackfillRunner {
  private status: ReplayFactsBackfillStatus = idleStatus();
  private stopRequested = false;

  public constructor(private readonly db: DatabaseType) {}

  public getStatus(): ReplayFactsBackfillStatus {
    return this.status;
  }

  /** How many replays still lack some of their facts. */
  public getPendingCount(): number {
    return listReplayFactsBacklog(this.db).length;
  }

  public stop(): void {
    if (this.status.running) this.stopRequested = true;
  }

  /** False when a run is already going. */
  public start(): boolean {
    if (this.status.running) return false;
    this.stopRequested = false;
    this.status = { ...idleStatus(), running: true, startedAt: new Date().toISOString() };
    const iterator = backfillReplayFactsAsyncIterator(this.db, { shouldStop: () => this.stopRequested });
    const finish = (): void => {
      this.status.running = false;
      this.status.currentFile = null;
      this.status.finishedAt = new Date().toISOString();
    };
    const step = async (): Promise<void> => {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          this.status.result = value;
          this.status.processed = value.replays;
          if (value.replays > 0) {
            console.log(`[SQLite Cache] Replay facts: ${value.laps} laps across ${value.replays} replays${value.interrupted ? ' (paused)' : ''}`);
          }
          finish();
          return;
        }
        this.status.processed = value.processed;
        this.status.total = value.total;
        this.status.currentFile = value.currentFile;
        setImmediate(() => { void step(); });
      } catch (error) {
        this.status.error = error instanceof Error ? error.message : String(error);
        console.warn('[SQLite Cache] Replay facts backfill warning:', error);
        finish();
      }
    };
    setImmediate(() => { void step(); });
    return true;
  }
}
