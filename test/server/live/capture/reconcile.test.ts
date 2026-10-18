import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import { getSessionLiveCaptures, listLiveCaptureManifests, upsertLiveCapture } from '../../../../server/core/live/dbLiveCaptureStore.js';
import { reconcileLiveCaptures } from '../../../../server/live/capture/reconcile.js';
import type { LiveCaptureManifest } from '../../../../shared/types/liveCapture.js';

const databases: SessionDatabase[] = [];
const folders: string[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) db.close();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

function database(): SessionDatabase {
  const db = new SessionDatabase(':memory:');
  databases.push(db);
  return db;
}

async function recordingDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'lmu-live-capture-'));
  folders.push(directory);
  return directory;
}

function addSession(db: SessionDatabase, values: {
  id: string; timestamp: number; mtime: number; venue?: string; course?: string; type?: string;
  driver?: string; car?: string; carClass?: string; laps?: Array<{ number: number; time: number }>;
}): void {
  const raw = db.getDb();
  raw.prepare(`INSERT INTO sessions (id, filename, file_path, file_mtime_ms, file_size_bytes, timestamp,
    track_venue, track_course, session_type, session_name, drivers_count, updated_at, game_version)
    VALUES (?, ?, ?, ?, 100, ?, ?, ?, ?, ?, 1, 0, 'Build-42')`).run(
    values.id, `${values.id}.xml`, `C:/results/${values.id}.xml`, values.mtime, values.timestamp,
    values.venue ?? 'Monza', values.course ?? 'GP', values.type ?? 'Race', values.type === 'Practice' ? 'P1' : 'R1');
  raw.prepare('INSERT OR IGNORE INTO drivers (name, normalized_name) VALUES (?, ?)').run(values.driver ?? 'Player One', (values.driver ?? 'Player One').toLowerCase());
  const driverId = (raw.prepare('SELECT driver_id FROM drivers WHERE name = ?').get(values.driver ?? 'Player One') as { driver_id: number }).driver_id;
  raw.prepare('INSERT OR IGNORE INTO vehicles (car_type, car_class) VALUES (?, ?)').run(values.car ?? 'Ferrari 296 GT3', values.carClass ?? 'GT3');
  const vehicleId = (raw.prepare('SELECT vehicle_id FROM vehicles WHERE car_type = ? AND car_class = ?').get(values.car ?? 'Ferrari 296 GT3', values.carClass ?? 'GT3') as { vehicle_id: number }).vehicle_id;
  raw.prepare(`INSERT INTO session_drivers (session_id, driver_ordinal, driver_id, vehicle_id, is_player)
    VALUES (?, 0, ?, ?, 1)`).run(values.id, driverId, vehicleId);
  const insertLap = raw.prepare(`INSERT INTO session_laps (session_id, driver_ordinal, lap_ordinal, lap_number, lap_time, is_valid)
    VALUES (?, 0, ?, ?, ?, 1)`);
  for (const [ordinal, lap] of (values.laps ?? [{ number: 2, time: 101.2 }, { number: 3, time: 100.9 }]).entries()) {
    insertLap.run(values.id, ordinal, lap.number, lap.time);
  }
}

function manifest(overrides: Partial<LiveCaptureManifest> = {}): LiveCaptureManifest {
  return {
    recordingId: 'recording-a', source: 'live-capture', schemaVersion: 1, normalizationVersion: 1,
    signConvention: 'iso8855', filename: 'recording-a.duckdb', layoutKey: 'monza_gp', trackName: 'Monza',
    driverName: 'Player One', vehicleName: 'Ferrari 296 GT3', vehicleModel: 'Ferrari 296 GT3', carClass: 'GT3',
    sessionCode: 3, sessionKind: 'race', startedAt: Date.parse('2026-10-10T11:00:00Z'),
    updatedAt: Date.parse('2026-10-10T12:00:00Z'), firstElapsedSeconds: 0, lastElapsedSeconds: 3600,
    endedAt: Date.parse('2026-10-10T12:00:00Z'), status: 'completed', samples: 360000, droppedSamples: 0,
    anchors: [{ lapNumber: 2, startSeconds: 300, lapSeconds: 101.2 }, { lapNumber: 3, startSeconds: 401.2, lapSeconds: 100.9 }],
    sessionId: null, gameVersion: null, ...overrides,
  };
}

describe('live capture XML reconciliation', () => {
  it('links only a unique candidate with matching identity, interval, layout and two lap anchors', async () => {
    const db = database();
    const directory = await recordingDirectory();
    const start = Date.parse('2026-10-10T11:00:00Z');
    addSession(db, { id: 'session-match', timestamp: start - 5_000, mtime: start + 3600_000 });
    addSession(db, { id: 'wrong-layout', timestamp: start - 5_000, mtime: start + 3600_000, venue: 'Bahrain', course: 'GP' });
    addSession(db, { id: 'wrong-driver', timestamp: start - 5_000, mtime: start + 3600_000, driver: 'Other Driver' });
    addSession(db, { id: 'wrong-car-same-class', timestamp: start - 5_000, mtime: start + 3600_000, car: 'BMW M4 GT3' });
    const capture = manifest();
    upsertLiveCapture(db.getDb(), capture, 4096);
    await writeFile(path.join(directory, capture.filename), 'capture');

    const result = await reconcileLiveCaptures(db.getDb(), directory);
    expect(result).toMatchObject({ changed: true, indexed: 1, verified: 1, pending: 0, withdrawn: 0, filesChecked: true });
    expect(getSessionLiveCaptures(db.getDb(), 'session-match')).toEqual([expect.objectContaining({
      recordingId: capture.recordingId, available: true, gameVersion: 'Build-42', bytes: 4096,
    })]);
    expect((await reconcileLiveCaptures(db.getDb(), directory)).changed).toBe(false);
  });

  it('keeps insufficient, restarted and ambiguous evidence pending, then withdraws a no-longer-unique link', async () => {
    const db = database();
    const directory = await recordingDirectory();
    const start = Date.parse('2026-10-10T11:00:00Z');
    addSession(db, { id: 'session-a', timestamp: start - 5_000, mtime: start + 3600_000 });
    const capture = manifest({ anchors: [{ lapNumber: 2, startSeconds: 300, lapSeconds: 101.2 }] });
    upsertLiveCapture(db.getDb(), capture, 123);
    await writeFile(path.join(directory, capture.filename), 'capture');
    expect((await reconcileLiveCaptures(db.getDb(), directory)).pending).toBe(1);

    const valid = manifest({ recordingId: 'recording-b', filename: 'recording-b.duckdb' });
    upsertLiveCapture(db.getDb(), valid, 456);
    await writeFile(path.join(directory, valid.filename), 'capture');
    expect((await reconcileLiveCaptures(db.getDb(), directory)).verified).toBe(1);

    addSession(db, { id: 'session-b', timestamp: start - 4_000, mtime: start + 3601_000 });
    const result = await reconcileLiveCaptures(db.getDb(), directory);
    expect(result).toMatchObject({ changed: true, verified: 0, pending: 2, withdrawn: 1 });
  });

  it('withdraws stale XML version provenance when the XML session is reparsed or disappears', async () => {
    const db = database();
    const directory = await recordingDirectory();
    const start = Date.parse('2026-10-10T11:00:00Z');
    addSession(db, { id: 'session-a', timestamp: start - 5_000, mtime: start + 3600_000 });
    const capture = manifest();
    upsertLiveCapture(db.getDb(), capture, 123);
    const recordingPath = path.join(directory, capture.filename);
    await writeFile(recordingPath, 'capture');
    expect((await reconcileLiveCaptures(db.getDb(), directory)).verified).toBe(1);
    expect(listLiveCaptureManifests(db.getDb())[0]?.gameVersion).toBe('Build-42');

    await rm(recordingPath);
    expect(await reconcileLiveCaptures(db.getDb(), directory)).toMatchObject({ changed: true, filesChecked: true });
    expect(getSessionLiveCaptures(db.getDb(), 'session-a')[0]?.available).toBe(false);
    expect(listLiveCaptureManifests(db.getDb())).toHaveLength(1);
    await writeFile(recordingPath, 'capture');
    expect((await reconcileLiveCaptures(db.getDb(), directory)).changed).toBe(true);
    expect(getSessionLiveCaptures(db.getDb(), 'session-a')[0]?.available).toBe(true);

    db.getDb().prepare('UPDATE sessions SET game_version = ? WHERE id = ?').run('Build-43', 'session-a');
    expect((await reconcileLiveCaptures(db.getDb(), directory)).changed).toBe(true);
    expect(listLiveCaptureManifests(db.getDb())[0]?.gameVersion).toBe('Build-43');

    db.getDb().prepare('DELETE FROM sessions WHERE id = ?').run('session-a');
    const result = await reconcileLiveCaptures(db.getDb(), directory);
    expect(result).toMatchObject({ verified: 0, pending: 1, withdrawn: 1 });

    // A delayed writer acknowledgement contains an old verified manifest; it must not restore a withdrawn link.
    upsertLiveCapture(db.getDb(), { ...capture, sessionId: 'session-a', gameVersion: 'Build-42' }, 456);
    expect(listLiveCaptureManifests(db.getDb())[0]).toMatchObject({ sessionId: null, gameVersion: null });
  });
});
