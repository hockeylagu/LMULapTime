import type { Database } from 'better-sqlite3';
import type { LiveRadioOutcome, SessionRadioCall } from '../../../shared/types/live.js';
import type { RadioLogEntry } from '../../live/radio/radioScheduler.js';

/** Outcomes a call can still leave: a page reports at most once, after the server sent it. */
const OPEN_OUTCOMES: readonly LiveRadioOutcome[] = ['queued', 'sent'];

export function logRadioCall(db: Database, entry: RadioLogEntry, now = Date.now()): number {
  const result = db.prepare(`INSERT INTO live_radio_calls(run_id,recording_id,created_at,game_time,lap,call_key,priority,family,text,outcome)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(entry.runId, entry.recordingId, now, entry.gameTime, entry.lap, entry.key, entry.priority,
    entry.family, entry.text, entry.outcome);
  return Number(result.lastInsertRowid);
}

/** Records what became of a call; false when the call is unknown or already settled. */
export function settleRadioCall(db: Database, id: number, outcome: LiveRadioOutcome, now = Date.now()): boolean {
  return db.prepare(`UPDATE live_radio_calls SET outcome=?, settled_at=? WHERE id=? AND outcome IN (${OPEN_OUTCOMES.map(() => '?').join(',')})`)
    .run(outcome, now, id, ...OPEN_OUTCOMES).changes > 0;
}

/** A session's calls in game-time order, from every recording matched to it. */
export function readSessionRadioCalls(db: Database, sessionId: string): SessionRadioCall[] {
  return db.prepare(`SELECT c.id, c.game_time AS gameTime, c.lap, c.priority, c.family, c.text, c.outcome
    FROM live_radio_calls c JOIN live_capture_index i ON i.recording_id = c.recording_id
    WHERE i.session_id=? ORDER BY c.game_time, c.id`).all(sessionId) as SessionRadioCall[];
}
