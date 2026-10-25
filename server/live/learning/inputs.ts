import { createHash } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { LIVE_LEARNING_VERSION } from '../../../shared/types/liveLearning.js';
import { LEARNING_EXAMPLE_RULES_VERSION, type LearningLap } from '../../../shared/domain/learning/examples.js';
import { LIVE_CAPTURE_MATCH_RULE_VERSION } from '../../core/live/dbLiveCaptureStore.js';
import type { LiveCaptureIndexRow } from '../../core/live/dbLiveCaptureStore.js';
import { findLiveCaptureCandidates } from '../capture/reconcile.js';

/** Canonical XML projection + current attachment identity form the rebuild/invalidation signature. */
export function learningProjectionInputs(db: Database, entry: LiveCaptureIndexRow): { signature: string; laps: LearningLap[] } | null {
  const manifest = entry.manifest;
  if (!manifest.sessionId || entry.matchStatus !== 'verified' || manifest.status === 'recording') return null;
  const ownership = db.prepare(`SELECT recording_id FROM live_capture_index WHERE session_id=?
    AND match_status='verified' AND match_rule_version=?`).all(manifest.sessionId, LIVE_CAPTURE_MATCH_RULE_VERSION) as Array<{ recording_id: string }>;
  const candidates = findLiveCaptureCandidates(db, manifest);
  if (ownership.length !== 1 || ownership[0].recording_id !== manifest.recordingId || candidates.length !== 1
    || candidates[0].id !== manifest.sessionId || candidates[0].game_version !== manifest.gameVersion) return null;
  const rows = db.prepare(`SELECT l.driver_ordinal,l.lap_ordinal,l.lap_number,l.lap_time,
      l.is_clean,l.is_representative,l.condition_group FROM session_laps l
    JOIN session_drivers d ON d.session_id=l.session_id AND d.driver_ordinal=l.driver_ordinal
    JOIN drivers n ON n.driver_id=d.driver_id
    WHERE l.session_id=? AND d.is_player=1 AND n.name=? ORDER BY l.driver_ordinal,l.lap_ordinal`)
    .all(manifest.sessionId, manifest.driverName) as Array<{
      driver_ordinal: number; lap_ordinal: number; lap_number: number; lap_time: number | null;
      is_clean: number | null; is_representative: number | null; condition_group: string | null;
    }>;
  const signature = createHash('sha256').update(JSON.stringify({ version: LIVE_LEARNING_VERSION,
    rules: LEARNING_EXAMPLE_RULES_VERSION, manifest, matchVersion: entry.matchVersion, rows })).digest('hex');
  return { signature, laps: rows.map(row => ({ driverOrdinal: row.driver_ordinal, lapOrdinal: row.lap_ordinal,
    lapNumber: row.lap_number, lapSeconds: row.lap_time, isClean: row.is_clean === 1,
    isRepresentative: row.is_representative === 1, condition: row.condition_group })) };
}
