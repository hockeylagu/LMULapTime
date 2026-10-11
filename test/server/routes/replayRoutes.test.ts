import express from 'express';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayRecordingService } from '../../../server/replay/replayRecordingService.js';
import { SessionDatabase } from '../../../server/core/db.js';
import { createReplayRouter } from '../../../server/routes/replayRoutes.js';
import { ServerContext } from '../../../server/core/serverContext.js';
import { TelemetryCatalog } from '../../../server/telemetry/telemetryCatalog.js';
import type { DetailedSession } from '../../../server/core/types.js';
import { createSliceVcrBuffer } from '../../utils/mockVcr.js';
import { session as sessionFixture, driver, lap } from '../core/sessionRows/builders.js';
import { ReplayTrajectoryService } from '../../../server/replay/replayTrajectoryService.js';
import { RaceTrafficService } from '../../../server/traffic/raceTrafficService.js';
import type { ReplayTrajectoryData } from '../../../server/core/types.js';

describe('session telemetry routes', () => {
  let db: SessionDatabase;
  let tempDir: string;
  let replayPath: string;
  let app: express.Express;
  let session: DetailedSession;

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
        carClass: 'LMGT3',
        carType: 'Test Car',
        laps: [{ lapNum: 1, lapTime: 99.123, lapTimeString: '1:39.123', s1: 30.111, s2: 34.222, s3: 34.79, isValid: true }],
      }],
      playerDriver: {
        name: 'Route Driver', driverName: 'Route Driver', carClass: 'LMGT3', carType: 'Test Car',
        bestLapTime: 99.123,
        laps: [{ lapNum: 1, lapTime: 99.123, lapTimeString: '1:39.123', s1: 30.111, s2: 34.222, s3: 34.79, isValid: true }],
      },
    } as unknown as DetailedSession;
    session = sessionFixture(session.drivers.map(item => driver(item.name,
      item.laps.map(itemLap => lap(itemLap.lapNum, itemLap)), item)), session);
    db.upsertSession(session, 'session-1.xml', 1, 1);
    vi.spyOn(db, 'getSessionById');

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
    expect(response.body.drivers[0]).toMatchObject({
      name: 'Route Driver',
      sessionDriverOrdinal: 0,
      sessionLapOrdinals: { '1': 0 },
    });
    expect(db.getSessionById).not.toHaveBeenCalled();
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
    const trajectory = await request(app).get('/api/session/session-1.xml/telemetry?driverOrdinal=0&lapOrdinal=0&source=vcr');
    expect(trajectory.status).toBe(200);
    expect(getTrajectory.mock.calls[0][0]).toMatchObject({ driverOrdinal: 0, lapOrdinal: 0, allowDuckDb: false,
      session: { id: 'session-1', drivers: [{ name: 'Route Driver', laps: [{ lapNum: 1, lapOrdinal: 0 }] }] } });
    expect(getTrajectory.mock.calls[0][0].session.drivers[0].laps[0]).not.toHaveProperty('topSpeed');
    const response = await request(app).get('/api/session/session-1/traffic');
    expect(response.status).toBe(200);
    expect(traffic.mock.calls[0][0].session?.drivers[0]).toMatchObject({ name: 'Route Driver', carClass: 'LMGT3', laps: [] });
    expect(db.getSessionById).not.toHaveBeenCalled();
  });

  it('does not expose replay-name telemetry routes', async () => {
    const list = await request(app).get('/api/replays');
    const metadata = await request(app).get('/api/replays/Route_Test_P1.Vcr/metadata');
    const trajectory = await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1&lap=1');

    expect(list.status).toBe(404);
    expect(metadata.status).toBe(404);
    expect(trajectory.status).toBe(404);
  });

  it('keeps replay cache and upgrade controls available for maintenance', async () => {
    const cache = await request(app).get('/api/replays/cache');
    const upgrade = await request(app).get('/api/replays/upgrade');

    expect(cache.status).toBe(200);
    expect(Array.isArray(cache.body)).toBe(true);
    expect(upgrade.status).toBe(503);
  });
});
