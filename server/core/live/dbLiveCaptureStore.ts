import type { Database } from 'better-sqlite3';
import type { LiveCaptureManifest, SessionLiveCapture } from '../../../shared/types/liveCapture.js';

export const LIVE_CAPTURE_MATCH_RULE_VERSION = 1;

/** Cheap hint for player telemetry requests; full identity/clock checks belong to the evidence reader. */
export function hasVerifiedLiveCapture(db: Database, sessionId: string, driverOrdinal: number): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM live_capture_index i JOIN session_drivers d ON d.session_id=i.session_id
    WHERE i.session_id=? AND d.driver_ordinal=? AND d.is_player=1 AND i.available=1
      AND i.match_status='verified' AND i.match_rule_version=? LIMIT 1`)
    .get(sessionId, driverOrdinal, LIVE_CAPTURE_MATCH_RULE_VERSION));
}

function filenameOnly(filename: string): string {
  const normalized = filename.replace(/\\/g, '/');
  const name = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (!name || name === '.' || name === '..') throw new Error('Live capture filename must be a filename');
  return name;
}

type IndexedRow = {
  manifest_json: string;
  session_id: string | null;
  game_version: string | null;
  match_version: number;
  match_status: string;
  available: number;
  bytes: number;
};

function manifestFromRow(row: IndexedRow): LiveCaptureManifest {
  const manifest = JSON.parse(row.manifest_json) as LiveCaptureManifest;
  return { ...manifest, sessionId: row.session_id, gameVersion: row.game_version };
}

/** Persists the manifest, preserving verified XML links; returns true for a newly available recording. */
export function upsertLiveCapture(db: Database, manifest: LiveCaptureManifest, bytes: number, available = true): boolean {
  const filename = filenameOnly(manifest.filename);
  const current = db.prepare('SELECT session_id, game_version, match_status, available FROM live_capture_index WHERE recording_id = ?')
    .get(manifest.recordingId) as { session_id: string | null; game_version: string | null; match_status: string; available: number } | undefined;
  // The persisted row is authoritative even when its link was explicitly withdrawn. A delayed writer
  // acknowledgement may update capture coverage, but it can never recreate a verified XML link.
  const sessionId = current?.session_id ?? null;
  const gameVersion = sessionId ? current?.game_version ?? null : null;
  const durable = { ...manifest, filename, sessionId, gameVersion };
  db.prepare(`INSERT INTO live_capture_index
    (recording_id, filename, manifest_json, bytes, available, session_id, game_version,
     match_version, match_rule_version, match_status, started_at, ended_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    ON CONFLICT(recording_id) DO UPDATE SET filename=excluded.filename, manifest_json=excluded.manifest_json,
      bytes=excluded.bytes, available=excluded.available, session_id=excluded.session_id,
      game_version=excluded.game_version,
      started_at=excluded.started_at, ended_at=excluded.ended_at,
      updated_at=excluded.updated_at`).run(
    manifest.recordingId, filename, JSON.stringify(durable), Math.max(0, Math.trunc(bytes)), Number(available),
    sessionId, gameVersion, LIVE_CAPTURE_MATCH_RULE_VERSION, current?.match_status ?? 'pending',
    manifest.startedAt, manifest.endedAt, Date.now(),
  );
  return available && (!current || current.available === 0);
}

export function getSessionLiveCaptures(db: Database, sessionId: string): SessionLiveCapture[] {
  const rows = db.prepare(`SELECT recording_id, filename, manifest_json, bytes, available, session_id, game_version,
      match_version, match_status FROM live_capture_index WHERE session_id = ? ORDER BY started_at, recording_id`)
    .all(sessionId) as Array<IndexedRow & { recording_id: string; filename: string }>;
  return rows.map(row => {
    const manifest = manifestFromRow(row);
    return {
      recordingId: row.recording_id, filename: row.filename, source: manifest.source, available: row.available !== 0,
      status: manifest.status, samples: manifest.samples, droppedSamples: manifest.droppedSamples,
      startedAt: manifest.startedAt, endedAt: manifest.endedAt, bytes: row.bytes, gameVersion: row.game_version,
    };
  });
}

export function listLiveCaptureManifests(db: Database): LiveCaptureManifest[] {
  const rows = db.prepare(`SELECT manifest_json, session_id, game_version, match_version, match_status,
      available, bytes FROM live_capture_index ORDER BY started_at, recording_id`).all() as IndexedRow[];
  return rows.map(manifestFromRow);
}

export function setLiveCaptureAvailability(db: Database, recordingId: string, available: boolean): boolean {
  return db.prepare(`UPDATE live_capture_index SET available = ?, updated_at = ?
    WHERE recording_id = ? AND available != ?`).run(Number(available), Date.now(), recordingId, Number(available)).changes > 0;
}

export interface LiveCaptureIndexRow {
  manifest: LiveCaptureManifest;
  filename: string;
  bytes: number;
  available: boolean;
  matchVersion: number;
  matchStatus: string;
}

/** Reconciliation reads compact index rows; raw recording files are never opened here. */
export function getLiveCaptureIndexRows(db: Database): LiveCaptureIndexRow[] {
  const rows = db.prepare(`SELECT recording_id, filename, manifest_json, bytes, available, session_id,
      game_version, match_version, match_status FROM live_capture_index ORDER BY started_at, recording_id`)
    .all() as Array<IndexedRow & { recording_id: string; filename: string }>;
  return rows.map(row => ({ manifest: manifestFromRow(row), filename: row.filename, bytes: row.bytes,
    available: row.available !== 0, matchVersion: row.match_version, matchStatus: row.match_status }));
}

export function setLiveCaptureMatch(
  db: Database,
  recordingId: string,
  sessionId: string | null,
  gameVersion: string | null,
  status: 'verified' | 'pending',
  ruleVersion = LIVE_CAPTURE_MATCH_RULE_VERSION,
): boolean {
  const row = db.prepare('SELECT manifest_json, session_id, game_version, match_version, match_status, match_rule_version FROM live_capture_index WHERE recording_id = ?')
    .get(recordingId) as { manifest_json: string; session_id: string | null; game_version: string | null; match_status: string; match_rule_version: number } | undefined;
  if (!row) return false;
  if (row.session_id === sessionId && row.game_version === gameVersion && row.match_status === status
    && row.match_rule_version === ruleVersion) return false;
  const manifest = JSON.parse(row.manifest_json) as LiveCaptureManifest;
  const next = { ...manifest, sessionId, gameVersion };
  db.prepare(`UPDATE live_capture_index SET manifest_json = ?, session_id = ?, game_version = ?, match_status = ?,
      match_version = match_version + 1, match_rule_version = ?, updated_at = ? WHERE recording_id = ?`)
    .run(JSON.stringify(next), sessionId, gameVersion, status, ruleVersion, Date.now(), recordingId);
  return true;
}
