import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SessionDatabase } from '../../../server/core/db.js';
import { ReplayTelemetryService } from '../../../server/replay/replayTelemetryService.js';
import { DuckDbReader } from '../../../server/telemetry/duckdbReader.js';
import type { DuckDbFileInfo } from '../../../server/telemetry/telemetryMatcher.js';
import type {
  DetailedSession,
  DuckDbLapTelemetry,
  ReplayMetadata,
  ReplayTrajectoryData,
} from '../../../server/core/types.js';

describe('ReplayTelemetryService', () => {
  let db: SessionDatabase;
  let tempDir: string;
  let service: ReplayTelemetryService;

  const mockDuckFile: DuckDbFileInfo = {
    filename: 'Daytona_R_2026.duckdb',
    filePath: '/telemetry/Daytona_R_2026.duckdb',
    fileMtimeMs: 100000,
    fileSizeBytes: 2048,
    trackName: 'Daytona International Speedway',
    sessionType: 'R',
    timestampStr: '2026-09-25T22:42:51Z',
    timestampEpochMs: 100000,
  };

  const mockDuckLap: DuckDbLapTelemetry = {
    lapNumber: 1,
    lapTimeSec: 96.0,
    pointsCount: 3,
    sampleRateHz: 100,
    points: [
      { x: 0, y: 0, z: 0, timeSec: 0, speedKmh: 100, throttle: 20 },
      { x: 10, y: 0, z: 20, timeSec: 1, speedKmh: 150, throttle: 100 },
      { x: 20, y: 0, z: 40, timeSec: 2, speedKmh: 200, throttle: 100 },
    ],
  };

  const mockVcrTraj = {
    replayName: 'Daytona.Vcr',
    bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
    source: 'vcr',
    currentLap: 1,
    points: [
      { x: 0, y: 0, z: 0, timeSec: 0, speedKmh: 100 },
      { x: 10, y: 0, z: 20, timeSec: 1, speedKmh: 150 },
      { x: 20, y: 0, z: 40, timeSec: 2, speedKmh: 200 },
    ],
    pointsCount: 3,
    rawPointsCount: 3,
    rawSampleRateHz: 50,
    laps: [{ lapNumber: 1, lapTimeSec: 96.0, s1Sec: 30, s2Sec: 36, s3Sec: 30 }],
  } as unknown as ReplayTrajectoryData;

  const mockMetadata = {
    filename: 'Daytona.Vcr',
    filePath: '/replays/Daytona.Vcr',
    trackName: 'Daytona International Speedway',
    drivers: [{ slot: 0, name: 'Samuel Lague', isPlayer: true }],
  } as unknown as ReplayMetadata;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    service = new ReplayTelemetryService(db);
    tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test', 'fixtures', 'replay-telemetry-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const onDisk = (file: DuckDbFileInfo): DuckDbFileInfo => {
    const filePath = path.join(tempDir, file.filename);
    fs.writeFileSync(filePath, '');
    return { ...file, filePath };
  };

  const request = (overrides: Partial<Parameters<ReplayTelemetryService['enrichWithTelemetry']>[0]> = {}) => service.enrichWithTelemetry({
    replayName: 'Daytona.Vcr',
    filePath: '/replays/Daytona.Vcr',
    isPlayer: true,
    allowDuckDb: true,
    metadata: mockMetadata,
    fullTrajectory: mockVcrTraj,
    // The service writes into the trajectory it is given.
    currentTrajectory: { ...mockVcrTraj },
    lapNumber: 1,
    ...overrides,
  });

  const session = { id: 'session-456', trackVenue: 'Daytona International Speedway', trackCourse: 'Road Course' } as DetailedSession;


  it('skips DuckDB telemetry fusion when not player or allowDuckDb is false', async () => {
    const notPlayer = await service.enrichWithTelemetry({
      replayName: 'Daytona.Vcr',
      filePath: '/replays/Daytona.Vcr',
      isPlayer: false,
      allowDuckDb: true,
      metadata: mockMetadata,
      fullTrajectory: mockVcrTraj,
      currentTrajectory: mockVcrTraj,
    });
    expect(notPlayer.fused).toBe(false);
    expect(notPlayer.trajectory.source).toBe('vcr');

    const disallowed = await service.enrichWithTelemetry({
      replayName: 'Daytona.Vcr',
      filePath: '/replays/Daytona.Vcr',
      isPlayer: true,
      allowDuckDb: false,
      metadata: mockMetadata,
      fullTrajectory: mockVcrTraj,
      currentTrajectory: mockVcrTraj,
    });
    expect(disallowed.fused).toBe(false);
    expect(disallowed.trajectory.source).toBe('vcr');
  });

  it('fuses the lap of the file stored for the session of the replay', async () => {
    db.upsertTelemetryMetadata(mockDuckFile, 'session-456', undefined);
    db.upsertTelemetryLapCache(mockDuckFile.filename, 1, mockDuckLap);

    const result = await request({ matchedSession: session });

    expect(result.fused).toBe(true);
    expect(result.trajectory.source).toBe('duckdb');
    expect(result.trajectory.duckdbFilename).toBe(mockDuckFile.filename);
  });

  it('fuses the lap of the file stored for a replay with no session', async () => {
    db.upsertTelemetryMetadata(mockDuckFile, undefined, 'Daytona.Vcr');
    db.upsertTelemetryLapCache(mockDuckFile.filename, 1, mockDuckLap);

    const result = await request();

    expect(result.fused).toBe(true);
    expect(result.trajectory.duckdbFilename).toBe(mockDuckFile.filename);
  });

  it('reads the file of the session before the file of the replay', async () => {
    const replayFile = { ...mockDuckFile, filename: 'Daytona_R_other.duckdb' };
    db.upsertTelemetryMetadata(mockDuckFile, 'session-456', undefined);
    db.upsertTelemetryMetadata(replayFile, undefined, 'Daytona.Vcr');
    db.upsertTelemetryLapCache(mockDuckFile.filename, 1, mockDuckLap);
    db.upsertTelemetryLapCache(replayFile.filename, 1, mockDuckLap);

    const result = await request({ matchedSession: session });

    expect(result.trajectory.duckdbFilename).toBe(mockDuckFile.filename);
  });

  it('never matches a file on its own, and writes nothing, when no match is stored', async () => {
    // Catalogued, on the same track and session type, but matched to nothing.
    db.upsertTelemetryMetadata(onDisk(mockDuckFile));
    db.upsertTelemetryLapCache(mockDuckFile.filename, 1, mockDuckLap);
    const revision = db.getTelemetryMetadataRevision();

    const result = await request({ matchedSession: session, metadata: { ...mockMetadata, duckdbFilename: mockDuckFile.filename } as ReplayMetadata });

    expect(result.fused).toBe(false);
    expect(result.trajectory.source).toBe('vcr');
    expect(result.trajectory.duckdbFilename).toBeUndefined();
    expect(db.getTelemetryMetadataRevision()).toBe(revision);
    expect(db.getTelemetryMetadata()[0]).toMatchObject({ matchedSessionId: null, matchedReplayFilename: null });
  });

  it('serves a cached lap after the DuckDB file is deleted', async () => {
    // mockDuckFile.filePath is not on disk.
    db.upsertTelemetryMetadata(mockDuckFile, 'session-456', undefined);
    db.upsertTelemetryLapCache(mockDuckFile.filename, 1, mockDuckLap);
    const open = vi.spyOn(DuckDbReader.prototype, 'open');

    const result = await request({ matchedSession: session });

    expect(result.fused).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it('reports a lap that was never read before the DuckDB file was deleted', async () => {
    db.upsertTelemetryMetadata(mockDuckFile, 'session-456', undefined);
    db.upsertTelemetryLapCache(mockDuckFile.filename, 2, { ...mockDuckLap, lapNumber: 2 });
    const open = vi.spyOn(DuckDbReader.prototype, 'open');

    const result = await request({ matchedSession: session });

    expect(result.fused).toBe(false);
    expect(result.trajectory.source).toBe('vcr');
    expect(result.duckdbUnavailableReason).toContain('was deleted');
    expect(open).not.toHaveBeenCalled();
  });

  it('marks duckdbAvailable as false when lap telemetry is incomplete', async () => {
    const incompleteLap: DuckDbLapTelemetry = {
      ...mockDuckLap,
      lapTimeSec: 10.0, // Expected is 96.0s
    };
    db.upsertTelemetryMetadata(mockDuckFile, undefined, 'Daytona.Vcr');
    db.upsertTelemetryLapCache(mockDuckFile.filename, 1, incompleteLap);

    const result = await service.enrichWithTelemetry({
      replayName: 'Daytona.Vcr',
      filePath: '/replays/Daytona.Vcr',
      isPlayer: true,
      allowDuckDb: true,
      metadata: mockMetadata,
      fullTrajectory: mockVcrTraj,
      currentTrajectory: mockVcrTraj,
      lapNumber: 1,
    });

    expect(result.fused).toBe(false);
    expect(result.trajectory.source).toBe('vcr');
    expect(result.duckdbUnavailableReason).toContain('DuckDB telemetry is incomplete for this lap');
    expect(result.trajectory.duckdbAvailable).toBe(false);
  });

  it('logs ingest error and leaves source as vcr when DuckDbReader throws', async () => {
    const file = onDisk(mockDuckFile);
    db.upsertTelemetryMetadata(file, undefined, 'Daytona.Vcr');
    vi.spyOn(DuckDbReader.prototype, 'open').mockRejectedValueOnce(new Error('DuckDB parse error'));
    const ingestSpy = vi.spyOn(db, 'recordIngestError');

    const result = await request();

    expect(result.fused).toBe(false);
    expect(result.trajectory.source).toBe('vcr');
    expect(ingestSpy).toHaveBeenCalledWith('duckdb', file.filePath, expect.any(Error));
  });
});
