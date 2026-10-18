import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import { createLiveEvidenceRouter } from '../../../server/routes/liveEvidenceRoutes.js';
import { setLiveCaptureMatch, upsertLiveCapture } from '../../../server/core/live/dbLiveCaptureStore.js';
import type { ServerContext } from '../../../server/core/serverContext.js';
import type { LiveCaptureManifest } from '../../../shared/types/liveCapture.js';
import type { LiveLapEvidence } from '../../../shared/types/liveEvidence.js';

const databases: SessionDatabase[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function fixture() {
  const store = new SessionDatabase(':memory:');
  databases.push(store);
  const db = store.getDb();
  db.exec(`INSERT INTO sessions (id,filename,file_path,file_mtime_ms,file_size_bytes,timestamp,track_venue,track_course,session_type,session_name,drivers_count,updated_at,game_version)
    VALUES ('session','session.xml','session.xml',0,0,0,'Monza','GP','Race','R1',2,0,'Build-42');
    INSERT INTO drivers (driver_id,name,normalized_name) VALUES (1,'Player','player'),(2,'Opponent','opponent');
    INSERT INTO vehicles (vehicle_id,car_type,car_class) VALUES (1,'Ferrari 296 GT3','GT3');
    INSERT INTO session_drivers (session_id,driver_ordinal,driver_id,vehicle_id,is_player) VALUES ('session',0,1,1,1),('session',1,2,1,0);
    INSERT INTO session_laps (session_id,driver_ordinal,lap_ordinal,lap_number,lap_time,is_valid)
      VALUES ('session',0,0,2,90,1),('session',1,0,2,90,1),('session',0,1,3,91,1),('session',0,2,4,NULL,0);`);
  const manifest: LiveCaptureManifest = { recordingId: 'capture', filename: 'capture.live.duckdb', source: 'live-capture',
    schemaVersion: 1, normalizationVersion: 1, signConvention: 'iso8855', layoutKey: 'monza_gp', trackName: 'Monza',
    driverName: 'Player', vehicleName: 'Ferrari 296 GT3', vehicleModel: 'Ferrari 296 GT3', carClass: 'GT3',
    sessionCode: 10, sessionKind: 'race', startedAt: 0, updatedAt: 1000, firstElapsedSeconds: 0, lastElapsedSeconds: 190,
    endedAt: 1000, status: 'completed', samples: 100, droppedSamples: 0,
    anchors: [{ lapNumber: 2, startSeconds: 100, lapSeconds: 90 }, { lapNumber: 3, startSeconds: 190, lapSeconds: 91 }], sessionId: null, gameVersion: null };
  const evidence: LiveLapEvidence = { source: 'live-capture', recordingId: 'capture', schemaVersion: 1,
    normalizationVersion: 1, signConvention: 'iso8855', gameVersion: 'Build-42', lapNumber: 2, startSeconds: 100,
    durationSeconds: 90, channels: [], points: [], observations: [], sessionObservations: [], observationsTruncated: false,
    coverage: { firstLapSeconds: null, lastLapSeconds: null, gaps: [], recordingDroppedSamples: 0 } };
  const read = vi.fn(async () => evidence);
  let loaded = false;
  const context = { sessionDb: store, getScanStatus: () => ({ heldForLiveSession: loaded }) } as unknown as ServerContext;
  const app = express();
  app.use('/api', createLiveEvidenceRouter(context, 'unused', { read }));
  const link = () => { upsertLiveCapture(db, manifest, 100); setLiveCaptureMatch(db, 'capture', 'session', 'Build-42', 'verified'); };
  return { app, db, read, evidence, manifest, link, load: () => { loaded = true; } };
}

const url = '/api/session/session/live-evidence?driverOrdinal=0&lapOrdinal=0';

describe('session live evidence API', () => {
  it('validates exact ordinal locators and refuses unknown laps without a file read', async () => {
    const t = fixture();
    for (const suffix of ['', '?driverOrdinal=-1&lapOrdinal=0', '?driverOrdinal=0&lapOrdinal=1.5', '?driverOrdinal=0&lapOrdinal=0&filename=other']) {
      expect((await request(t.app).get(`/api/session/session/live-evidence${suffix}`)).status).toBe(400);
    }
    expect((await request(t.app).get(url.replace('lapOrdinal=0', 'lapOrdinal=99'))).status).toBe(404);
    expect(t.read).not.toHaveBeenCalled();
  });

  it('keeps opponent, missing, incomplete and loaded-session evidence unavailable', async () => {
    const t = fixture();
    expect((await request(t.app).get(url)).body.reason).toBe('unlinked');
    t.link();
    expect((await request(t.app).get(url.replace('driverOrdinal=0', 'driverOrdinal=1'))).body.reason).toBe('not-player');
    expect((await request(t.app).get(url.replace('lapOrdinal=0', 'lapOrdinal=2'))).body.reason).toBe('incomplete-lap');
    t.db.prepare('UPDATE live_capture_index SET available=0').run();
    expect((await request(t.app).get(url)).body.reason).toBe('missing');
    t.load();
    expect((await request(t.app).get(url)).body.reason).toBe('session-loaded');
    expect(t.read).not.toHaveBeenCalled();
  });

  it('passes only verified lap bounds to the reader and returns provenance without caching', async () => {
    const t = fixture(); t.link();
    const response = await request(t.app).get(url);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ state: 'available', sessionId: 'session', driverOrdinal: 0, lapOrdinal: 0,
      evidence: { gameVersion: 'Build-42', startSeconds: 100, durationSeconds: 90 } });
    expect(t.read).toHaveBeenCalledWith(expect.objectContaining({ lapNumber: 2, startSeconds: 100, durationSeconds: 90,
      manifest: expect.objectContaining({ sessionId: 'session', gameVersion: 'Build-42' }) }));
  });

  it('withdraws a response when ownership changes while the reader is working', async () => {
    const t = fixture(); t.link();
    t.read.mockImplementation(async () => {
      setLiveCaptureMatch(t.db, 'capture', null, null, 'pending');
      return t.evidence;
    });
    expect((await request(t.app).get(url)).body.reason).toBe('changed');
  });

  it('does not trust a stale link after XML lap timing or player identity changes', async () => {
    const t = fixture(); t.link();
    t.db.prepare('UPDATE drivers SET name=? WHERE driver_id=1').run('Another Player');
    expect((await request(t.app).get(url)).body.reason).toBe('changed');
    expect(t.read).not.toHaveBeenCalled();
  });

  it('rejects XML changes made during an otherwise successful worker read', async () => {
    const t = fixture(); t.link();
    t.read.mockImplementation(async () => {
      t.db.prepare('UPDATE session_laps SET lap_time=100 WHERE driver_ordinal=0 AND lap_ordinal=0').run();
      return t.evidence;
    });
    expect((await request(t.app).get(url)).body.reason).toBe('changed');
  });
});
