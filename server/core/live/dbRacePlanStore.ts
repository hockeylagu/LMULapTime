import type { Database } from 'better-sqlite3';
import type { LiveRaceStrategies } from '../../../shared/types/liveStrategy.js';

/** The race plan the garage showed before the start, saved once per race recording; the last one before the green wins. */
export function saveRacePlan(db: Database, recordingId: string, plan: LiveRaceStrategies, savedAt: number): void {
  db.prepare(`INSERT INTO live_race_plans(recording_id,plan_json,saved_at) VALUES(?,?,?)
    ON CONFLICT(recording_id) DO UPDATE SET plan_json=excluded.plan_json,saved_at=excluded.saved_at`)
    .run(recordingId, JSON.stringify(plan), savedAt);
}

/** The plan of a session's race, through its live recordings (the newest when several hold one); null without one. */
export function readSessionRacePlan(db: Database, sessionId: string): LiveRaceStrategies | null {
  const row = db.prepare(`SELECT plan.plan_json FROM live_race_plans plan
    JOIN live_capture_index capture ON capture.recording_id = plan.recording_id
    WHERE capture.session_id = ? ORDER BY plan.saved_at DESC LIMIT 1`).get(sessionId) as { plan_json: string } | undefined;
  return row ? JSON.parse(row.plan_json) as LiveRaceStrategies : null;
}
