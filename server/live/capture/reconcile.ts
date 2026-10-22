import { readdir } from 'node:fs/promises';
import type { Database } from 'better-sqlite3';
import { getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { normalizeCarClass, resolveVehicle } from '../../../shared/domain/vehicleMapping.js';
import type { LiveCaptureLapAnchor, LiveCaptureManifest } from '../../../shared/types/liveCapture.js';
import {
  getLiveCaptureIndexRows, setLiveCaptureAvailability, setLiveCaptureMatch,
} from '../../core/live/dbLiveCaptureStore.js';

const SESSION_START_LOOKBACK_MS = 26 * 60 * 60 * 1000;
const SESSION_END_TOLERANCE_MS = 20 * 60 * 1000;
const LAP_TIME_TOLERANCE_SECONDS = 0.05;
const MIN_MATCHING_LAPS = 1;

interface SessionCandidate {
  id: string;
  timestamp: number;
  file_mtime_ms: number;
  track_venue: string;
  track_course: string;
  track_length_meters: number | null;
  session_type: string;
  session_name: string;
  game_version: string | null;
  player_name: string;
  car_type: string | null;
  car_class: string | null;
}

interface SessionLap {
  lap_number: number;
  lap_time: number | null;
}

export interface LiveCaptureReconcileResult {
  changed: boolean;
  indexed: number;
  verified: number;
  pending: number;
  withdrawn: number;
  filesChecked: boolean;
}

function sessionKind(value: string, sessionType: string, sessionName: string): string | null {
  const text = `${value} ${sessionType} ${sessionName}`.toLowerCase();
  if (/race|\br\d+\b/.test(text)) return 'race';
  if (/qual|\bq\d+\b/.test(text)) return 'qualifying';
  if (/warm.?up/.test(text)) return 'warmup';
  if (/practice|\bp\d+\b/.test(text)) return 'practice';
  return null;
}

function sameSessionKind(manifest: LiveCaptureManifest, candidate: SessionCandidate): boolean {
  const captureKind = sessionKind(manifest.sessionKind, '', '');
  const xmlKind = sessionKind('', candidate.session_type, candidate.session_name);
  return captureKind !== null && captureKind === xmlKind;
}

function knownLayoutKey(venue: string | null | undefined, course?: string | null, explicitKey?: string | null, length?: number | null): string | null {
  if (!venue && !explicitKey) return null;
  const spec = getCircuitSpecification(venue, course, null, null, explicitKey, length);
  return spec.layoutKey === 'unknown' ? null : spec.layoutKey;
}

function sameLayout(manifest: LiveCaptureManifest, candidate: SessionCandidate): boolean {
  // A venue name alone can resolve to a guessed default layout. Captures without a canonical key
  // remain pending until the recorder has enough evidence to identify the exact layout.
  if (!manifest.layoutKey) return false;
  const captureKey = knownLayoutKey(null, null, manifest.layoutKey);
  const sessionKey = knownLayoutKey(candidate.track_venue, candidate.track_course, null, candidate.track_length_meters);
  return captureKey !== null && sessionKey !== null && captureKey === sessionKey;
}

/**
 * The same car: the same model when both name a known car (the capture's entry name, "Vista AF Corse 2026 #21:LM", or
 * its model; the log's car type), else the same class. The lap anchors still have to agree.
 */
function vehicleMatches(manifest: LiveCaptureManifest, candidate: SessionCandidate): boolean {
  const captureModel = resolveVehicle(manifest.vehicleName)?.model ?? resolveVehicle(manifest.vehicleModel)?.model;
  const sessionModel = resolveVehicle(candidate.car_type)?.model;
  if (captureModel && sessionModel) return captureModel === sessionModel;
  return manifest.carClass !== null && manifest.carClass === normalizeCarClass(candidate.car_class);
}

function hasMonotonicAnchors(anchors: readonly LiveCaptureLapAnchor[]): boolean {
  let previous = 0;
  for (const anchor of anchors) {
    if (!Number.isInteger(anchor.lapNumber) || anchor.lapNumber <= previous) return false;
    previous = anchor.lapNumber;
  }
  return true;
}

function anchorsAgree(db: Database, sessionId: string, playerName: string, anchors: readonly LiveCaptureLapAnchor[]): boolean {
  const usable = anchors.filter(anchor => anchor.lapSeconds !== null && Number.isFinite(anchor.lapSeconds) && anchor.lapSeconds > 0);
  if (usable.length < MIN_MATCHING_LAPS || !hasMonotonicAnchors(anchors)) return false;
  const driver = db.prepare(`SELECT d.driver_ordinal FROM session_drivers d
    JOIN drivers n ON n.driver_id = d.driver_id WHERE d.session_id = ? AND n.name = ? AND d.is_player = 1`)
    .get(sessionId, playerName) as { driver_ordinal: number } | undefined;
  if (!driver) return false;
  const laps = db.prepare(`SELECT lap_number, lap_time FROM session_laps
    WHERE session_id = ? AND driver_ordinal = ? AND lap_number IN (${usable.map(() => '?').join(',')})`)
    .all(sessionId, driver.driver_ordinal, ...usable.map(anchor => anchor.lapNumber)) as SessionLap[];
  const byNumber = new Map(laps.filter(lap => lap.lap_time !== null && lap.lap_time > 0)
    .map(lap => [lap.lap_number, lap.lap_time!]));
  let matched = 0;
  for (const anchor of usable) {
    const lapTime = byNumber.get(anchor.lapNumber);
    if (lapTime !== undefined && Math.abs(lapTime - anchor.lapSeconds!) > LAP_TIME_TOLERANCE_SECONDS) return false;
    if (lapTime !== undefined && Math.abs(lapTime - anchor.lapSeconds!) <= LAP_TIME_TOLERANCE_SECONDS) matched += 1;
  }
  return matched >= MIN_MATCHING_LAPS;
}

function timeWindowMatches(manifest: LiveCaptureManifest, candidate: SessionCandidate): boolean {
  const captureEnd = manifest.endedAt ?? manifest.updatedAt;
  const startFloor = manifest.startedAt - SESSION_START_LOOKBACK_MS;
  const endCeiling = captureEnd + SESSION_END_TOLERANCE_MS;
  return candidate.timestamp >= startFloor && candidate.timestamp <= endCeiling
    && candidate.file_mtime_ms >= manifest.startedAt - SESSION_END_TOLERANCE_MS
    && candidate.file_mtime_ms <= endCeiling;
}

export function findLiveCaptureCandidates(db: Database, manifest: LiveCaptureManifest): SessionCandidate[] {
  const end = manifest.endedAt ?? manifest.updatedAt;
  const rows = db.prepare(`SELECT s.id, s.timestamp, s.file_mtime_ms, s.track_venue, s.track_course,
      s.track_length_meters, s.session_type, s.session_name, s.game_version,
      n.name AS player_name, v.car_type, v.car_class
    FROM sessions s JOIN session_drivers d ON d.session_id = s.id AND d.is_player = 1
    JOIN drivers n ON n.driver_id = d.driver_id LEFT JOIN vehicles v ON v.vehicle_id = d.vehicle_id
    WHERE s.timestamp BETWEEN ? AND ? AND s.file_mtime_ms BETWEEN ? AND ?
      AND n.name = ? ORDER BY s.timestamp, s.id LIMIT 128`)
    .all(manifest.startedAt - SESSION_START_LOOKBACK_MS, end + SESSION_END_TOLERANCE_MS,
      manifest.startedAt - SESSION_END_TOLERANCE_MS, end + SESSION_END_TOLERANCE_MS, manifest.driverName) as SessionCandidate[];
  return rows.filter(candidate => timeWindowMatches(manifest, candidate)
    && sameLayout(manifest, candidate)
    && sameSessionKind(manifest, candidate)
    && vehicleMatches(manifest, candidate)
    && anchorsAgree(db, candidate.id, candidate.player_name, manifest.anchors));
}

/**
 * Reconcile retained capture manifests against a bounded XML candidate window. Every link requires
 * exact player identity, canonical layout/vehicle/session kind, wall-time overlap and one timed lap anchor
 * with no timed lap that disagrees.
 * The matching relation must be one-to-one; restarts and competing candidates remain pending.
 */
export async function reconcileLiveCaptures(db: Database, directory: string): Promise<LiveCaptureReconcileResult> {
  let filesChecked = false;
  let changed = false;
  let names: string[] | null = null;
  try {
    names = await readdir(directory);
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') names = [];
    // Preserve the last known availability for temporarily inaccessible directories.
  }
  if (names !== null) {
    const availableFilenames = new Set(names);
    const entries = getLiveCaptureIndexRows(db);
    const availableIds = new Set(entries.filter(entry => availableFilenames.has(entry.filename)).map(entry => entry.manifest.recordingId));
    db.transaction(() => {
      for (const entry of entries) changed = setLiveCaptureAvailability(db, entry.manifest.recordingId,
        availableIds.has(entry.manifest.recordingId)) || changed;
    })();
    filesChecked = true;
  }

  const entries = getLiveCaptureIndexRows(db);
  const edges = new Map<string, string[]>();
  const sessionOwners = new Map<string, string[]>();
  for (const entry of entries) {
    const candidates = findLiveCaptureCandidates(db, entry.manifest).map(candidate => candidate.id);
    edges.set(entry.manifest.recordingId, candidates);
    for (const sessionId of candidates) {
      const owners = sessionOwners.get(sessionId) ?? [];
      owners.push(entry.manifest.recordingId);
      sessionOwners.set(sessionId, owners);
    }
  }

  db.transaction(() => {
    for (const entry of entries) {
      const matches = edges.get(entry.manifest.recordingId) ?? [];
      const sessionId = matches.length === 1 && sessionOwners.get(matches[0]!)?.length === 1 ? matches[0]! : null;
      const gameVersion = sessionId
        ? (db.prepare('SELECT game_version FROM sessions WHERE id = ?').get(sessionId) as { game_version: string | null } | undefined)?.game_version ?? null
        : null;
      changed = setLiveCaptureMatch(db, entry.manifest.recordingId, sessionId, gameVersion, sessionId ? 'verified' : 'pending') || changed;
    }
  })();
  const refreshed = getLiveCaptureIndexRows(db);
  const verified = refreshed.filter(entry => entry.manifest.sessionId !== null).length;
  const pending = refreshed.length - verified;
  const refreshedOwners = new Map(refreshed.map(entry => [entry.manifest.recordingId, entry.manifest.sessionId]));
  const withdrawn = entries.filter(entry => entry.manifest.sessionId !== null
    && refreshedOwners.get(entry.manifest.recordingId) !== entry.manifest.sessionId).length;
  return { changed, indexed: refreshed.length, verified, pending, withdrawn, filesChecked };
}
