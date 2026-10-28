import express from 'express';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ReplayRecordingService } from '../../../server/replay/replayRecordingService.js';
import { SessionDatabase } from '../../../server/core/db.js';
import { createReplayRouter } from '../../../server/routes/replayRoutes.js';
import { ServerContext } from '../../../server/core/serverContext.js';
import { TelemetryCatalog } from '../../../server/telemetry/telemetryCatalog.js';
import type { DetailedSession } from '../../../shared/types/index.js';
import { createSliceVcrBuffer } from '../../utils/mockVcr.js';
import { session as sessionFixture, driver, lap } from '../core/sessionRows/builders.js';
import { ReplayTrajectoryService } from '../../../server/replay/replayTrajectoryService.js';
import { RaceTrafficService } from '../../../server/traffic/raceTrafficService.js';
import type { ReplayTrajectoryData } from '../../../shared/types/index.js';
import { setLiveCaptureMatch, upsertLiveCapture } from '../../../server/core/live/dbLiveCaptureStore.js';
import type { LiveCaptureManifest } from '../../../shared/types/liveCapture.js';

describe('session telemetry routes', () => {
  let db: SessionDatabase;
  let tempDir: string;
  let replayPath: string;
  let app: express.Express;
  let session: DetailedSession;
  let getSessionById: MockInstance<SessionDatabase['getSessionById']>;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test', 'fixtures', 'session-telemetry-routes-'));
    replayPath = path.join(tempDir, 'Route_Test_P1.Vcr');
    fs.writeFileSync(replayPath, createSliceVcrBuffer({
      drivers: [{ name: 'Route Driver', vehicleId: '21_26_AFCO95641716', team: 'Test Team', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 10, y: 0, z: 20 },
        { sTime: 1, driverSlot: 1, x: 11, y: 0, z: 21 },
      ],
    }));

    session = {
      id: 'session-1',
      matchingReplayFile: { name: 'Route_Test_P1.Vcr' },
      trackVenue: 'Test Venue',
      trackCourse: 'Test Course',
      sessionType: 'Practice',
      drivers: [{
        name: 'Route Driver',
        driverName: 'Route Driver',
        carClass: 'GT3',
        carType: 'Test Car',
        laps: [{ lapNumber: 1, lapTime: 99.123, s1: 30.111, s2: 34.222, s3: 34.79, isValid: true }],
      }],
      playerDriver: {
        name: 'Route Driver', driverName: 'Route Driver', carClass: 'GT3', carType: 'Test Car',
        bestLapTime: 99.123,
        laps: [{ lapNumber: 1, lapTime: 99.123, s1: 30.111, s2: 34.222, s3: 34.79, isValid: true }],
      },
    } as unknown as DetailedSession;
    session = sessionFixture(session.drivers.map(item => driver(item.name,
      item.laps.map(itemLap => lap(itemLap.lapNumber, itemLap)), item)), session);
    db.upsertSession(session, 'session-1.xml', 1, 1);
    getSessionById = vi.spyOn(db, 'getSessionById');

    const context = {
      replaysDir: tempDir,
      sessionDb: db,
      telemetryCatalog: new TelemetryCatalog(db),
      replayRecordings: new ReplayRecordingService(db),
      currentParser: { configuredPlayerName: 'Route Driver' },
      replayUpgrade: undefined,
      startReplayUpgradeWhenIdle: vi.fn(),
      loadSessions: vi.fn(() => [session]),
    } as unknown as ServerContext;

    app = express();
    app.use(express.json());
    app.use('/api', createReplayRouter(context));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves metadata only through a session ID and exposes source-order locators', async () => {
    const response = await request(app).get('/api/session/session-1/telemetry/metadata');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ filename: 'Route_Test_P1.Vcr', trackVenue: 'Test Venue' });
    expect(response.body).toHaveProperty('drivers.0', expect.objectContaining({
      name: 'Route Driver',
      sessionDriverOrdinal: 0,
      sessionLapOrdinals: { '1': 0 },
    }));
    expect(getSessionById).not.toHaveBeenCalled();
  });

  it('requires session driver and lap ordinals for telemetry requests', async () => {
    const missingLocator = await request(app).get('/api/session/session-1/telemetry?source=vcr');
    expect(missingLocator.status).toBe(400);

    const invalidLocator = await request(app)
      .get('/api/session/session-1/telemetry?driverOrdinal=129&lapOrdinal=0&source=vcr');
    expect(invalidLocator.status).toBe(400);

    const noSession = await request(app)
      .get('/api/session/missing/telemetry?driverOrdinal=0&lapOrdinal=0&source=vcr');
    expect(noSession.status).toBe(404);
  });

  it('serves a trajectory through compact timing context and traffic without lap histories', async () => {
    const getTrajectory = vi.spyOn(ReplayTrajectoryService.prototype, 'getTrajectory')
      .mockResolvedValue({ points: [], pointsCount: 0 } as unknown as ReplayTrajectoryData);
    const traffic = vi.spyOn(RaceTrafficService.prototype, 'getDriverTraffic')
      .mockResolvedValue({ available: true, laps: [] });
    const alias = await request(app).get('/api/session/session-1.xml/telemetry?driverOrdinal=0&lapOrdinal=0&source=vcr');
    expect(alias.status).toBe(404);
    const trajectory = await request(app).get('/api/session/session-1/telemetry?driverOrdinal=0&lapOrdinal=0&source=vcr');
    expect(trajectory.status).toBe(200);
    expect(getTrajectory.mock.calls[0][0]).toMatchObject({ driverOrdinal: 0, lapOrdinal: 0, allowDuckDb: false,
      session: { id: 'session-1', drivers: [{ name: 'Route Driver', laps: [{ lapNumber: 1, lapOrdinal: 0 }] }] } });
    expect(getTrajectory.mock.calls[0][0].session.drivers[0].laps[0]).not.toHaveProperty('topSpeed');
    const response = await request(app).get('/api/session/session-1/traffic');
    expect(response.status).toBe(200);
    expect(traffic.mock.calls[0][0].session?.drivers[0]).toMatchObject({ name: 'Route Driver', carClass: 'GT3', laps: [] });
    expect(getSessionById).not.toHaveBeenCalled();
  });

  it('does not expose replay-name telemetry routes', async () => {
    const list = await request(app).get('/api/replays');
    const metadata = await request(app).get('/api/replays/Route_Test_P1.Vcr/metadata');
    const trajectory = await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1&lap=1');

    expect(list.status).toBe(404);
    expect(metadata.status).toBe(404);
    expect(trajectory.status).toBe(404);
  });

  it('advertises live evidence only for the player with a current verified available attachment', async () => {
    db.getDb().prepare('UPDATE session_drivers SET is_player=1 WHERE session_id=? AND driver_ordinal=0').run('session-1');
    const retained = { points: [], pointsCount: 0 } as unknown as ReplayTrajectoryData;
    vi.spyOn(ReplayTrajectoryService.prototype, 'getTrajectory').mockResolvedValue(retained);
    const capture: LiveCaptureManifest = { recordingId: 'capture', filename: 'capture.live.duckdb', source: 'live-capture',
      schemaVersion: 1, normalizationVersion: 1, signConvention: 'iso8855', layoutKey: 'monza_gp', trackName: 'Monza',
      driverName: 'Route Driver', vehicleName: 'Test Car', vehicleModel: null, carClass: 'GT3', sessionCode: 1,
      sessionKind: 'practice', startedAt: 0, updatedAt: 1000, firstElapsedSeconds: 0, lastElapsedSeconds: 100,
      endedAt: 1000, status: 'completed', samples: 1, droppedSamples: 0, anchors: [], sessionId: null, gameVersion: null };
    upsertLiveCapture(db.getDb(), capture, 100);
    setLiveCaptureMatch(db.getDb(), 'capture', 'session-1', 'Build-42', 'verified');
    const url = '/api/session/session-1/telemetry?driverOrdinal=0&lapOrdinal=0';
    expect((await request(app).get(url)).body).toHaveProperty('hasLiveCapture', true);
    expect(retained.hasLiveCapture).toBeUndefined();
    db.getDb().prepare('UPDATE session_drivers SET is_player=0 WHERE session_id=?').run('session-1');
    expect((await request(app).get(url)).body).not.toHaveProperty('hasLiveCapture');
    db.getDb().prepare('UPDATE session_drivers SET is_player=1 WHERE session_id=?').run('session-1');
    db.getDb().prepare('UPDATE live_capture_index SET available=0').run();
    expect((await request(app).get(url)).body).not.toHaveProperty('hasLiveCapture');
  });

  it('keeps replay cache and upgrade controls available for maintenance', async () => {
    const cache = await request(app).get('/api/replays/cache');
    const upgrade = await request(app).get('/api/replays/upgrade');

    expect(cache.status).toBe(200);
    expect(Array.isArray(cache.body)).toBe(true);
    expect(upgrade.status).toBe(503);
  });
});
