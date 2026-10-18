import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { DuckDbReader } from '../../telemetry/duckdbReader.js';
import { LIVE_CAPTURE_CHANNELS } from './channels.js';
import { LIVE_CAPTURE_NORMALIZATION_VERSION, LIVE_CAPTURE_SCHEMA_VERSION } from '../../../shared/types/liveCapture.js';
import type { LiveCaptureManifest } from '../../../shared/types/liveCapture.js';
import { LiveEvidenceReadError } from './readError.js';

/** Shared identity/convention gate for off-track analytics and learning readers. Caller closes the handle. */
export async function openVerifiedLiveRecording(directory: string, manifest: LiveCaptureManifest): Promise<DuckDbReader> {
  if (manifest.source !== 'live-capture' || manifest.schemaVersion !== LIVE_CAPTURE_SCHEMA_VERSION
    || manifest.normalizationVersion !== LIVE_CAPTURE_NORMALIZATION_VERSION || manifest.signConvention !== 'iso8855') {
    throw new LiveEvidenceReadError('incompatible', 'Capture schema or normalization is incompatible with this reader');
  }
  if (!manifest.sessionId || manifest.status === 'recording') throw new LiveEvidenceReadError('unlinked', 'Capture is not finalized and verified');
  const root = path.resolve(directory);
  const filename = path.resolve(root, manifest.filename);
  if (path.dirname(filename) !== root || path.basename(manifest.filename) !== manifest.filename) {
    throw new LiveEvidenceReadError('incompatible', 'Invalid recording filename');
  }
  try {
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new LiveEvidenceReadError('incompatible', 'Recording is not a regular file');
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      throw new LiveEvidenceReadError('missing', 'Live capture file was removed');
    }
    throw error;
  }
  const reader = new DuckDbReader(filename);
  try {
    const metadata = new Map((await reader.queryAll<{ key: string; value: string }>('SELECT key, value FROM capture_metadata'))
      .map(row => [row.key, row.value]));
    if (metadata.get('source') !== 'live-capture' || metadata.get('recording_id') !== manifest.recordingId
      || metadata.get('schema_version') !== String(LIVE_CAPTURE_SCHEMA_VERSION)
      || metadata.get('normalization_version') !== String(LIVE_CAPTURE_NORMALIZATION_VERSION)
      || metadata.get('sign_convention') !== 'iso8855' || metadata.get('filename') !== manifest.filename) {
      throw new LiveEvidenceReadError('incompatible', 'Live capture signature does not match the verified index');
    }
    const rows = await reader.queryAll<{ manifest_json: string }>('SELECT CAST(manifest_json AS VARCHAR) AS manifest_json FROM capture_manifest WHERE singleton = TRUE');
    const stored = rows.length === 1 ? JSON.parse(rows[0].manifest_json) as LiveCaptureManifest : null;
    if (!stored || stored.recordingId !== manifest.recordingId || stored.layoutKey !== manifest.layoutKey
      || stored.driverName !== manifest.driverName || stored.vehicleName !== manifest.vehicleName
      || stored.sessionCode !== manifest.sessionCode || stored.startedAt !== manifest.startedAt
      || stored.samples !== manifest.samples || stored.lastElapsedSeconds !== manifest.lastElapsedSeconds
      || stored.sessionId !== null && stored.sessionId !== manifest.sessionId
      || JSON.stringify(stored.anchors) !== JSON.stringify(manifest.anchors)) {
      throw new LiveEvidenceReadError('changed', 'Recording identity or coverage changed; refresh the capture index');
    }
    const catalog = await reader.queryAll<{ ordinal: number; name: string; unit: string; frame: string; verified: boolean }>(
      'SELECT ordinal, name, unit, frame, verified FROM capture_channels ORDER BY ordinal');
    if (catalog.length !== LIVE_CAPTURE_CHANNELS.length || catalog.some((item, index) => {
      const expected = LIVE_CAPTURE_CHANNELS[index];
      return item.ordinal !== index || item.name !== expected.name || item.unit !== expected.unit
        || item.frame !== expected.frame || item.verified !== expected.verified;
    })) throw new LiveEvidenceReadError('incompatible', 'Live capture channel conventions do not match this reader');
    return reader;
  } catch (error) { await reader.close(); throw error; }
}
