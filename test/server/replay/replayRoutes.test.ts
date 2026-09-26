import express from 'express';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayCacheService } from '../../../server/replay/replayCacheService.js';
import { SessionDatabase } from '../../../server/core/db.js';
import { createReplayRouter } from '../../../server/routes/replayRoutes.js';
import { ServerContext } from '../../../server/core/serverContext.js';
import { TelemetryCatalog } from '../../../server/telemetry/telemetryCatalog.js';
import * as telemetryMatcher from '../../../server/telemetry/telemetryMatcher.js';
import type { DuckDbFileInfo } from '../../../server/telemetry/telemetryMatcher.js';
import type { DuckDbLapTelemetry } from '../../../server/core/types.js';
import { DuckDbReader } from '../../../server/telemetry/duckdbReader.js';
import { createSliceVcrBuffer } from '../../utils/mockVcr.js';

describe('Replay routes', () => {
  let db: SessionDatabase;
  let tempDir: string;
  let replayPath: string;
  let app: express.Express;
  let sessions: unknown[];
  let telemetryCatalog: TelemetryCatalog;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test', 'fixtures', 'replay-routes-'));
    replayPath = path.join(tempDir, 'Route_Test_P1.Vcr');
    fs.writeFileSync(replayPath, createSliceVcrBuffer({
      drivers: [{ name: 'Route Driver', vehicleId: '21_26_AFCO95641716', team: 'Test Team', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 10, y: 0, z: 20 },
        { sTime: 1, driverSlot: 1, x: 11, y: 0, z: 21 },
      ],
    }));

    telemetryCatalog = new TelemetryCatalog(db);
    const replayCache = new ReplayCacheService(db);
    sessions = [];
    const context = {
      replaysDir: tempDir,
      sessionDb: db,
      telemetryCatalog,
      replayCache,
      currentParser: { configuredPlayerName: 'Route Driver' },
      loadSessions: () => sessions,
    } as unknown as ServerContext;

    app = express();
    app.use('/api', createReplayRouter(context));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('lists replays and serves trajectory data from cache after source deletion', async () => {
    const listResponse = await request(app).get('/api/replays');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0]).toEqual(expect.objectContaining({
      name: 'Route_Test_P1.Vcr',
      trackName: expect.any(String),
      driversCount: 1,
    }));

    const metadataResponse = await request(app).get('/api/replays/Route_Test_P1.Vcr/metadata');
    expect(metadataResponse.status).toBe(200);
    expect(metadataResponse.body.drivers[0].name).toBe('Route Driver');

    const trajectoryResponse = await request(app)
      .get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1&source=vcr&maxPoints=1');
    expect(trajectoryResponse.status).toBe(200);
    expect(trajectoryResponse.body.source).toBe('vcr');
    expect(trajectoryResponse.body.points).toHaveLength(1);

    fs.rmSync(replayPath);

    const listAfterDeletion = await request(app).get('/api/replays');
    expect(listAfterDeletion.status).toBe(200);
    expect(listAfterDeletion.body).toHaveLength(1);
    expect(listAfterDeletion.body[0].name).toBe('Route_Test_P1.Vcr');

    const cachedMetadataResponse = await request(app).get('/api/replays/Route_Test_P1.Vcr/metadata');
    expect(cachedMetadataResponse.status).toBe(200);
    expect(cachedMetadataResponse.body.drivers[0].name).toBe('Route Driver');

    const cachedTrajectoryResponse = await request(app)
      .get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1&source=vcr');
    expect(cachedTrajectoryResponse.status).toBe(200);
    expect(cachedTrajectoryResponse.body.points.length).toBeGreaterThan(0);

    // Trajectory with DuckDB allowed should not throw ENOENT when file is missing from disk
    const cachedTrajectoryWithDuckDb = await request(app)
      .get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1');
    expect(cachedTrajectoryWithDuckDb.status).toBe(200);
    expect(cachedTrajectoryWithDuckDb.body.points.length).toBeGreaterThan(0);
  });

  it('rejects unsafe replay names and bounded trajectory parameters', async () => {
    const unsafe = await request(app).get('/api/replays/%2E%2E%2Fsecret.Vcr/metadata');
    expect(unsafe.status).toBe(400);

    const wrongExtension = await request(app).get('/api/replays/Route_Test_P1.txt/metadata');
    expect(wrongExtension.status).toBe(400);

    const invalidDriver = await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=129');
    expect(invalidDriver.status).toBe(400);

    const invalidLap = await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?lap=-1');
    expect(invalidLap.status).toBe(400);

    const invalidMaxPoints = await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?maxPoints=100001');
    expect(invalidMaxPoints.status).toBe(400);
  });

  it('returns 404 for missing files when no cached metadata or trajectory exists', async () => {
    const metadata = await request(app).get('/api/replays/Missing_P1.Vcr/metadata');
    expect(metadata.status).toBe(404);

    const trajectory = await request(app).get('/api/replays/Missing_P1.Vcr/trajectory');
    expect(trajectory.status).toBe(404);
  });

  it('supports raw trajectory requests and the replay cache list endpoint', async () => {
    const raw = await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?source=vcr&maxPoints=raw');
    expect(raw.status).toBe(200);
    expect(raw.body.maxPoints).toBe(0);

    const cache = await request(app).get('/api/replays/cache');
    expect(cache.status).toBe(200);
    expect(Array.isArray(cache.body)).toBe(true);
  });

  it('fuses a cached DuckDB lap with VCR coordinates for the player trajectory', async () => {
    const duckFile: DuckDbFileInfo = {
      filename: 'Route_Test_P1.duckdb',
      filePath: path.join(tempDir, 'Route_Test_P1.duckdb'),
      fileMtimeMs: Date.now(),
      fileSizeBytes: 1024,
      trackName: 'Route Test',
      sessionType: 'P1',
      timestampStr: '2026-09-23T00:00:00Z',
      timestampEpochMs: Date.now(),
    };
    const duckLap: DuckDbLapTelemetry = {
      lapNumber: 1,
      lapTimeSec: 2,
      pointsCount: 3,
      sampleRateHz: 100,
      points: [
        { x: 0, y: 0, z: 0, timeSec: 0, speedKmh: 101, throttle: 20 },
        { x: 0, y: 0, z: 0, timeSec: 0.5, speedKmh: 111, throttle: 60 },
        { x: 0, y: 0, z: 0, timeSec: 1, speedKmh: 121, throttle: 100 },
      ],
    };
    vi.spyOn(telemetryCatalog, 'getFiles').mockReturnValue([duckFile]);
    vi.spyOn(telemetryMatcher, 'matchDuckDbToReplay').mockReturnValue(duckFile);
    db.upsertTelemetryLapCache(duckFile.filename, 1, duckLap);

    const response = await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      source: 'duckdb',
      duckdbFilename: duckFile.filename,
      duckdbRawPointsCount: 3,
      duckdbRawSampleRateHz: 100,
    });
    expect(response.body.points).toHaveLength(3);
    expect(response.body.points[1]).toMatchObject({ throttle: 60, speedKmh: 111 });
  });

  it('returns an empty replay list when the replay directory does not exist', async () => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    const response = await request(app).get('/api/replays');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('enriches matched sessions and validates official lap timing', async () => {
    fs.writeFileSync(replayPath, createSliceVcrBuffer({
      drivers: [{ name: 'Route Driver', vehicleId: '21_26_AFCO95641716', team: 'Test Team', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 10, y: 0, z: 20, timing: { splitSec: 30, sector: 1, lapIdx: 1 } },
        { sTime: 1, driverSlot: 1, x: 11, y: 0, z: 21, timing: { splitSec: 35, sector: 2, lapIdx: 1 } },
        { sTime: 2, driverSlot: 1, x: 12, y: 0, z: 22, timing: { splitSec: 35, sector: 3, lapIdx: 1 } },
      ],
    }));
    sessions.push({
      id: 'session-1',
      matchingReplayFile: { name: 'Route_Test_P1.Vcr' },
      trackVenue: 'Test Venue',
      trackCourse: 'Test Course',
      sessionType: 'Practice',
      totalLapsCount: 1,
      drivers: [{
        name: 'Route Driver',
        driverName: 'Route Driver',
        carClass: 'LMGT3',
        carType: 'Test Car',
        bestLapTime: 99.123,
        laps: [{ lapNum: 1, lapTime: 99.123, lapTimeString: '1:39.123', s1: 30.111, s2: 34.222, s3: 34.79, isValid: true }],
      }],
      playerDriver: {
        name: 'Route Driver',
        driverName: 'Route Driver',
        carClass: 'LMGT3',
        carType: 'Test Car',
        bestLapTime: 99.123,
        laps: [{ lapNum: 1, lapTime: 99.123, lapTimeString: '1:39.123', s1: 30.111, s2: 34.222, s3: 34.79, isValid: true }],
      },
    });

    const metadata = await request(app).get('/api/replays/Route_Test_P1.Vcr/metadata');
    expect(metadata.status).toBe(200);
    expect(metadata.body).toEqual(expect.objectContaining({
      trackVenue: 'Test Venue',
      trackCourse: 'Test Course',
      carClass: 'LMGT3',
      carModel: 'Test Car',
      laps: [expect.objectContaining({ lapNumber: 1, lapTimeSec: 99.123, isBest: true })],
    }));

    const trajectory = await request(app)
      .get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1&source=vcr');
    expect(trajectory.status).toBe(200);
    expect(trajectory.body.validation).toEqual(expect.objectContaining({
      matchedSessionId: 'session-1',
      driverName: 'Route Driver',
      officialBestLapTime: 99.123,
    }));
    expect(trajectory.body.validation.officialLaps[0]).toEqual(expect.objectContaining({
      lapNumber: 1,
      lapTimeSec: 99.123,
      s1Sec: 30.111,
    }));
  });

  it('does not mutate cached metadata across repeated metadata requests', async () => {
    sessions.push({
      id: 'session-repeat',
      matchingReplayFile: { name: 'Route_Test_P1.Vcr' },
      trackVenue: 'Overlay Venue',
      trackCourse: 'Overlay Course',
      playerDriver: {
        carClass: 'Hypercar',
        carType: 'Ferrari 499P',
        laps: [{ lapNum: 1, lapTime: 95.5, s1: 30, s2: 32, s3: 33.5 }],
      },
    });

    const firstResponse = await request(app).get('/api/replays/Route_Test_P1.Vcr/metadata');
    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.carClass).toBe('Hypercar');
    expect(firstResponse.body.trackVenue).toBe('Overlay Venue');

    const secondResponse = await request(app).get('/api/replays/Route_Test_P1.Vcr/metadata');
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body).toEqual(firstResponse.body);

    const cachedRow = db.getStoredReplayMetadata('Route_Test_P1.Vcr');
    if (cachedRow) {
      expect(cachedRow.trackVenue).not.toBe('Overlay Venue');
    }
  });

  it('handles DuckDbReader failure by logging ingest error and falling back to native VCR', async () => {
    const duckFile: DuckDbFileInfo = {
      filename: 'Route_Test_P1.duckdb',
      filePath: path.join(tempDir, 'Route_Test_P1.duckdb'),
      fileMtimeMs: Date.now(),
      fileSizeBytes: 1024,
      trackName: 'Route Test',
      sessionType: 'P1',
      timestampStr: '2026-09-23T00:00:00Z',
      timestampEpochMs: Date.now(),
    };
    vi.spyOn(telemetryCatalog, 'getFiles').mockReturnValue([duckFile]);
    vi.spyOn(telemetryMatcher, 'matchDuckDbToReplay').mockReturnValue(duckFile);
    vi.spyOn(DuckDbReader.prototype, 'open').mockRejectedValueOnce(new Error('Corrupted duckdb header'));
    const ingestSpy = vi.spyOn(db, 'recordIngestError');

    const response = await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1');
    expect(response.status).toBe(200);
    expect(response.body.source).toBe('vcr');
    expect(ingestSpy).toHaveBeenCalledWith('duckdb', duckFile.filePath, expect.any(Error));
  });

  it('marks duckdbAvailable as false when duckdb lap telemetry is incomplete compared to expected lap time', async () => {
    const duckFile: DuckDbFileInfo = {
      filename: 'Route_Test_P1.duckdb',
      filePath: path.join(tempDir, 'Route_Test_P1.duckdb'),
      fileMtimeMs: Date.now(),
      fileSizeBytes: 1024,
      trackName: 'Route Test',
      sessionType: 'P1',
      timestampStr: '2026-09-23T00:00:00Z',
      timestampEpochMs: Date.now(),
    };
    const incompleteDuckLap: DuckDbLapTelemetry = {
      lapNumber: 1,
      lapTimeSec: 0.1,
      pointsCount: 2,
      sampleRateHz: 100,
      points: [
        { x: 0, y: 0, z: 0, timeSec: 0, speedKmh: 100 },
        { x: 0, y: 0, z: 0, timeSec: 0.1, speedKmh: 105 },
      ],
    };
    vi.spyOn(telemetryCatalog, 'getFiles').mockReturnValue([duckFile]);
    vi.spyOn(telemetryMatcher, 'matchDuckDbToReplay').mockReturnValue(duckFile);
    db.upsertTelemetryLapCache(duckFile.filename, 1, incompleteDuckLap);

    const response = await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1');
    expect(response.status).toBe(200);
    expect(response.body.source).toBe('vcr');
    expect(response.body.duckdbAvailable).toBe(false);
    expect(response.body.duckdbUnavailableReason).toContain('DuckDB telemetry is incomplete for this lap; using Native VCR data.');
  });

  it('resolves driver slot by driverName query parameter', async () => {
    const response = await request(app)
      .get('/api/replays/Route_Test_P1.Vcr/trajectory?driverName=Route%20Driver&source=vcr');
    expect(response.status).toBe(200);
    expect(response.body.driverSlot).toBe(1);
    expect(response.body.driverName).toBe('Route Driver');
  });

  it('serves trajectory and metadata from database archive when replay file is removed from disk', async () => {
    // Prime the cache
    await request(app).get('/api/replays/Route_Test_P1.Vcr/metadata');
    await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1&source=vcr');

    // Remove the file from disk
    fs.rmSync(replayPath);
    expect(fs.existsSync(replayPath)).toBe(false);

    // Both metadata and trajectory must succeed from SQLite archive
    const metaRes = await request(app).get('/api/replays/Route_Test_P1.Vcr/metadata');
    expect(metaRes.status).toBe(200);
    expect(metaRes.body.filename).toBe('Route_Test_P1.Vcr');

    const trajRes = await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1&source=vcr');
    expect(trajRes.status).toBe(200);
    expect(trajRes.body.points.length).toBeGreaterThan(0);
  });

  it('falls back to odometer projection when track layout is unknown', async () => {
    sessions.push({
      id: 'unknown-session',
      matchingReplayFile: { name: 'Route_Test_P1.Vcr' },
      trackVenue: 'Unknown Fantasy Venue',
      trackCourse: 'Fictional Layout',
      playerDriver: { name: 'Route Driver', laps: [] },
    });

    const response = await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1&source=vcr');
    expect(response.status).toBe(200);
    expect(response.body.points[0]).toHaveProperty('stationM');
    expect(response.body.points[0].stationM).toBe(0);
    expect(response.body.points[0].lateralOffsetM).toBe(0);
    expect(response.body.timingGates).toBeDefined();
  });

  it('isolates circuit layout specifications between variants of the same facility', async () => {
    sessions.push({
      id: 'bahrain-outer-session',
      matchingReplayFile: { name: 'Route_Test_P1.Vcr' },
      trackVenue: 'Bahrain International Circuit',
      trackCourse: 'Outer Circuit',
      trackLengthMeters: 3543,
      playerDriver: { name: 'Route Driver', laps: [] },
    });

    const response = await request(app).get('/api/replays/Route_Test_P1.Vcr/trajectory?driverSlot=1&source=vcr');
    expect(response.status).toBe(200);
    expect(response.body.layoutKey).toBe('bahrain_outer');
  });
});
