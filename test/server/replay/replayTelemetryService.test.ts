import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import { TelemetryCatalog } from '../../../server/telemetry/telemetryCatalog.js';
import { ReplayTelemetryService } from '../../../server/replay/replayTelemetryService.js';
import { DuckDbReader } from '../../../server/telemetry/duckdbReader.js';
import * as telemetryMatcher from '../../../server/telemetry/telemetryMatcher.js';
import type { DuckDbFileInfo } from '../../../server/telemetry/telemetryMatcher.js';
import type {
  DetailedSession,
  DuckDbLapTelemetry,
  ReplayMetadata,
  ReplayTrajectoryData,
} from '../../../server/core/types.js';

describe('ReplayTelemetryService', () => {
  let db: SessionDatabase;
  let catalog: TelemetryCatalog;
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
    catalog = new TelemetryCatalog(db);
    service = new ReplayTelemetryService(db, catalog);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes catalog files and telemetry metadata accessors', () => {
    vi.spyOn(catalog, 'getFiles').mockReturnValue([mockDuckFile]);
    db.upsertTelemetryMetadata(mockDuckFile, 'session-123', 'Daytona.Vcr');

    expect(service.getFiles()).toHaveLength(1);
    expect(service.getFiles()[0].filename).toBe(mockDuckFile.filename);

    const meta = service.getTelemetryMeta();
    expect(meta).toHaveLength(1);
    expect(meta[0].matchedReplayFilename).toBe('Daytona.Vcr');
  });

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

  it('does not use a replay-name cache association when live matching cannot validate it', async () => {
    vi.spyOn(catalog, 'getFiles').mockReturnValue([mockDuckFile]);
    vi.spyOn(telemetryMatcher, 'matchDuckDbToReplay').mockReturnValue(null);
    db.upsertTelemetryMetadata(mockDuckFile, undefined, 'Daytona.Vcr');
    db.upsertTelemetryLapCache(mockDuckFile.filename, 1, mockDuckLap);

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
    expect(result.trajectory.duckdbFilename).toBeUndefined();
  });

  it('does not use metadata.duckdbFilename when live matching cannot validate it', async () => {
    vi.spyOn(catalog, 'getFiles').mockReturnValue([mockDuckFile]);
    vi.spyOn(telemetryMatcher, 'matchDuckDbToReplay').mockReturnValue(null);
    db.upsertTelemetryLapCache(mockDuckFile.filename, 1, mockDuckLap);

    const metaWithDuck = {
      ...mockMetadata,
      duckdbFilename: mockDuckFile.filename,
    } as ReplayMetadata;

    const result = await service.enrichWithTelemetry({
      replayName: 'Daytona.Vcr',
      filePath: '/replays/Daytona.Vcr',
      isPlayer: true,
      allowDuckDb: true,
      metadata: metaWithDuck,
      fullTrajectory: mockVcrTraj,
      currentTrajectory: mockVcrTraj,
      lapNumber: 1,
    });

    expect(result.fused).toBe(false);
    expect(result.trajectory.source).toBe('vcr');
    expect(result.trajectory.duckdbFilename).toBeUndefined();
  });

  it('uses a session-bound cache association when live matching cannot disambiguate it', async () => {
    vi.spyOn(catalog, 'getFiles').mockReturnValue([mockDuckFile]);
    vi.spyOn(telemetryMatcher, 'matchDuckDbToReplay').mockReturnValue(null);
    vi.spyOn(telemetryMatcher, 'matchDuckDbToSession').mockReturnValue(null);
    db.upsertTelemetryMetadata(mockDuckFile, 'session-456', undefined);
    db.upsertTelemetryLapCache(mockDuckFile.filename, 1, mockDuckLap);

    const session = {
      id: 'session-456',
      trackVenue: 'Daytona International Speedway',
      trackCourse: 'Road Course',
    } as DetailedSession;

    const result = await service.enrichWithTelemetry({
      replayName: 'Daytona.Vcr',
      filePath: '/replays/Daytona.Vcr',
      isPlayer: true,
      allowDuckDb: true,
      metadata: mockMetadata,
      matchedSession: session,
      fullTrajectory: mockVcrTraj,
      currentTrajectory: mockVcrTraj,
      lapNumber: 1,
    });

    expect(result.fused).toBe(true);
    expect(result.trajectory.source).toBe('duckdb');
  });

  it('marks duckdbAvailable as false when lap telemetry is incomplete', async () => {
    const incompleteLap: DuckDbLapTelemetry = {
      ...mockDuckLap,
      lapTimeSec: 10.0, // Expected is 96.0s
    };
    vi.spyOn(catalog, 'getFiles').mockReturnValue([mockDuckFile]);
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
    vi.spyOn(catalog, 'getFiles').mockReturnValue([mockDuckFile]);
    db.upsertTelemetryMetadata(mockDuckFile, undefined, 'Daytona.Vcr');
    vi.spyOn(DuckDbReader.prototype, 'open').mockRejectedValueOnce(new Error('DuckDB parse error'));
    const ingestSpy = vi.spyOn(db, 'recordIngestError');

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
    expect(ingestSpy).toHaveBeenCalledWith('duckdb', mockDuckFile.filePath, expect.any(Error));
  });

  it('prefers valid current replay match over a stale cached DuckDB association', async () => {
    const staleDuckFile: DuckDbFileInfo = {
      filename: 'Daytona_R_stale.duckdb',
      filePath: '/telemetry/Daytona_R_stale.duckdb',
      fileMtimeMs: 10000,
      fileSizeBytes: 2048,
      trackName: 'Daytona International Speedway',
      sessionType: 'R',
      timestampStr: '2026-09-01T12:00:00Z',
      timestampEpochMs: 10000,
    };

    const currentDuckFile: DuckDbFileInfo = {
      filename: 'Daytona_R_current.duckdb',
      filePath: '/telemetry/Daytona_R_current.duckdb',
      fileMtimeMs: 200000,
      fileSizeBytes: 2048,
      trackName: 'Daytona International Speedway',
      sessionType: 'R',
      timestampStr: '2026-09-25T22:42:51Z',
      timestampEpochMs: 200000,
    };

    // Stale association previously stored in DB
    db.upsertTelemetryMetadata(staleDuckFile, undefined, 'Daytona.Vcr');
    db.upsertTelemetryLapCache(currentDuckFile.filename, 1, mockDuckLap);

    vi.spyOn(catalog, 'getFiles').mockReturnValue([staleDuckFile, currentDuckFile]);

    // Replay file mtime matches currentDuckFile (200000)
    db.upsertReplayMetadataCache('Daytona.Vcr', '/replays/Daytona.Vcr', 200000, 4096, mockMetadata);

    const metaWithStaleDuck = {
      ...mockMetadata,
      sessionType: 'R',
      trackVenue: 'Daytona International Speedway',
      duckdbFilename: staleDuckFile.filename, // Stale filename on metadata
    } as ReplayMetadata;

    const result = await service.enrichWithTelemetry({
      replayName: 'Daytona.Vcr',
      filePath: '/replays/Daytona.Vcr',
      isPlayer: true,
      allowDuckDb: true,
      metadata: metaWithStaleDuck,
      fullTrajectory: mockVcrTraj,
      currentTrajectory: mockVcrTraj,
      lapNumber: 1,
    });

    expect(result.fused).toBe(true);
    expect(result.trajectory.source).toBe('duckdb');
    // Crucial: current live replay match must win over the stale cached association
    expect(result.trajectory.duckdbFilename).toBe(currentDuckFile.filename);
    expect(result.trajectory.duckdbFilename).not.toBe(staleDuckFile.filename);

    // Ensure database cache was updated to the fresh match
    const updatedMeta = db.getTelemetryMetadata().find(m => m.matchedReplayFilename === 'Daytona.Vcr');
    expect(updatedMeta?.filename).toBe(currentDuckFile.filename);
  });
});
