import type { Database } from 'better-sqlite3';
import type { LiveEvidenceReadRequest, LiveEvidenceResponse, LiveEvidenceUnavailableReason, LiveLapEvidence } from '../../../shared/types/liveEvidence.js';
import { LIVE_CAPTURE_MATCH_RULE_VERSION } from '../../core/live/dbLiveCaptureStore.js';
import type { LiveCaptureManifest } from '../../../shared/types/liveCapture.js';
import { LiveEvidenceReadError } from './readError.js';
import { findLiveCaptureCandidates } from './reconcile.js';

export interface LiveEvidenceLocator { sessionId: string; driverOrdinal: number; lapOrdinal: number }
interface LapRow { lap_number: number; lap_time: number | null; is_player: number }

/** Returns null only for an unknown session/driver/lap locator. No raw file is opened without verified ownership. */
export async function getLiveLapEvidence(db: Database, directory: string, locator: LiveEvidenceLocator,
  sessionLoaded: () => boolean, read: (request: LiveEvidenceReadRequest) => Promise<LiveLapEvidence>): Promise<LiveEvidenceResponse | null> {
  const unavailable = (reason: LiveEvidenceUnavailableReason, message: string): LiveEvidenceResponse =>
    ({ state: 'unavailable', ...locator, reason, message });
  const lap = db.prepare(`SELECT l.lap_number, l.lap_time, d.is_player FROM session_laps l
    JOIN session_drivers d ON d.session_id=l.session_id AND d.driver_ordinal=l.driver_ordinal
    WHERE l.session_id=? AND l.driver_ordinal=? AND l.lap_ordinal=?`)
    .get(locator.sessionId, locator.driverOrdinal, locator.lapOrdinal) as LapRow | undefined;
  if (!lap) return null;
  if (!lap.is_player) return unavailable('not-player', 'Live capture contains only the player car');
  if (sessionLoaded()) return unavailable('session-loaded', 'Live evidence reads resume after the loaded game session');
  if (lap.lap_time === null || !Number.isFinite(lap.lap_time) || lap.lap_time <= 0) return unavailable('incomplete-lap', 'This lap has no completed XML duration');
  const rows = db.prepare(`SELECT manifest_json, available, session_id, game_version, match_version FROM live_capture_index
    WHERE session_id=? AND match_status='verified' AND match_rule_version=? ORDER BY recording_id LIMIT 3`)
    .all(locator.sessionId, LIVE_CAPTURE_MATCH_RULE_VERSION) as Array<{
      manifest_json: string; available: number; session_id: string; game_version: string | null; match_version: number;
    }>;
  if (!rows.length) return unavailable('unlinked', 'No verified live capture is attached to this session');
  if (rows.length !== 1) return unavailable('ambiguous', 'Several captures claim this session; reconciliation is required');
  const row = rows[0];
  if (!row.available) return unavailable('missing', 'The live capture file is no longer available');
  const manifest = { ...JSON.parse(row.manifest_json) as LiveCaptureManifest, sessionId: row.session_id, gameVersion: row.game_version };
  const ownershipIsCurrent = (): boolean => {
    const candidates = findLiveCaptureCandidates(db, manifest);
    return candidates.length === 1 && candidates[0].id === locator.sessionId && candidates[0].game_version === row.game_version;
  };
  if (!ownershipIsCurrent()) return unavailable('changed', 'XML identity or lap evidence changed; reconciliation is required');
  const anchors = manifest.anchors.filter(anchor => anchor.lapNumber === lap.lap_number);
  if (anchors.length !== 1 || anchors[0].lapSeconds === null || Math.abs(anchors[0].lapSeconds - lap.lap_time) > 0.05) {
    return unavailable('unverified-clock', 'No unique live lap clock matches the XML lap');
  }
  try {
    const evidence = await read({ directory, manifest, lapNumber: lap.lap_number,
      startSeconds: anchors[0].startSeconds, durationSeconds: lap.lap_time });
    // XML reparses or reconciliation can withdraw ownership while the worker is reading.
    const current = db.prepare(`SELECT session_id, match_version, available FROM live_capture_index
      WHERE recording_id=? AND match_status='verified' AND match_rule_version=?`)
      .get(manifest.recordingId, LIVE_CAPTURE_MATCH_RULE_VERSION) as { session_id: string; match_version: number; available: number } | undefined;
    if (!current || current.session_id !== locator.sessionId || current.match_version !== row.match_version || !current.available
      || !ownershipIsCurrent()) {
      return unavailable('changed', 'Capture ownership changed during the read; refresh the session');
    }
    if (sessionLoaded()) return unavailable('session-loaded', 'A game session loaded during the evidence read');
    return { state: 'available', ...locator, evidence };
  } catch (error: unknown) {
    return unavailable(error instanceof LiveEvidenceReadError ? error.reason : 'failed',
      error instanceof Error ? error.message : 'Live evidence could not be read');
  }
}
