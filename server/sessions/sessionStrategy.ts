import type { SessionStrategy, StrategyLapState } from '../../shared/types/index.js';
import { measureSessionStrategy } from '../../shared/domain/strategy/sessionStrategy.js';
import { STRATEGY_HISTORY_RACES } from '../../shared/domain/strategy/strategyHistory.js';
import type { SessionDatabase } from '../core/db.js';
import { DuckDbReader } from '../telemetry/duckdbReader.js';
import { TelemetryLinks } from '../telemetry/telemetryLinks.js';

export type SessionStrategySource = Pick<SessionDatabase, 'getDb' | 'getSessionById' | 'getTelemetryMetadata'
  | 'getTelemetryLapCacheFilenames' | 'recordIngestError'>;

/**
 * The strategy a session measured, from the player's native telemetry files linked to it (online races write no
 * fuel, VE or wear in their results XML). Read when asked, never stored: a race reads in about 0.2 s. A session
 * spread over several files takes each lap's state from the first file, in recording order, that has it.
 * `undefined` when the session does not exist; null without telemetry or a player.
 */
export async function readSessionStrategy(sessionDb: SessionStrategySource, sessionId: string): Promise<SessionStrategy | null | undefined> {
  const session = sessionDb.getSessionById(sessionId);
  if (!session) return undefined;
  const player = session.playerDriver ?? session.drivers.find(driver => driver.isPlayer);
  if (!player) return null;
  return measureSessionStrategy(await readSessionLapStates(sessionDb, sessionId), player.laps ?? []);
}

/** Native end states, shared by strategy history and tyre learning; earlier linked files own duplicate laps. */
export async function readSessionLapStates(sessionDb: SessionStrategySource, sessionId: string, signal?: AbortSignal): Promise<StrategyLapState[]> {
  signal?.throwIfAborted();
  const session = sessionDb.getSessionById(sessionId);
  if (!session) return [];
  const links = TelemetryLinks.load(sessionDb, session.id);
  const files = links.filesForSession(session).map(filename => links.row(filename)).filter(row => row !== undefined);
  const states = new Map<number, StrategyLapState>();
  for (const file of files) {
    signal?.throwIfAborted();
    const reader = new DuckDbReader(file.filePath);
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- One file at a time: earlier files keep their laps.
      await reader.open();
      signal?.throwIfAborted();
      // oxlint-disable-next-line eslint/no-await-in-loop -- One file at a time: earlier files keep their laps.
      for (const state of await reader.getLapEndStates()) if (!states.has(state.lap)) states.set(state.lap, state);
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn(`[DuckDB] Failed to read the strategy from ${file.filename}:`, error);
      sessionDb.recordIngestError('duckdb', file.filePath, error);
    } finally {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Closed before the next file opens.
      await reader.close().catch(() => undefined);
    }
  }
  signal?.throwIfAborted();
  return [...states.values()].sort((a, b) => a.lap - b.lap);
}

/**
 * The player's newest races on one layout in one class that have a native telemetry recording, measured, newest
 * first: what the live race plan uses before the event has a lap. Read once per layout and class (about 0.2 s a race).
 */
export async function readStrategyHistory(sessionDb: SessionDatabase, layoutKey: string, carClass: string): Promise<SessionStrategy[]> {
  const ids = sessionDb.getDb().prepare(`SELECT s.id FROM sessions s WHERE s.layout_key = ? AND s.player_car_class = ?
      AND s.session_type = 'Race' AND EXISTS (SELECT 1 FROM telemetry_metadata t WHERE t.matched_session_id = s.id)
    ORDER BY s.timestamp DESC`).all(layoutKey, carClass) as Array<{ id: string }>;
  const races: SessionStrategy[] = [];
  // A linked race whose telemetry no longer reads gives way to an older one.
  for (const { id } of ids) {
    if (races.length === STRATEGY_HISTORY_RACES) break;
    // oxlint-disable-next-line eslint/no-await-in-loop -- One race at a time: the reads share the DuckDB files' I/O.
    const strategy = await readSessionStrategy(sessionDb, id);
    if (strategy) races.push(strategy);
  }
  return races;
}
