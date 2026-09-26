import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import { TelemetryCatalog } from '../../../server/telemetry/telemetryCatalog.js';
import { ReplayCacheService } from '../../../server/replay/replayCacheService.js';
import { ReplayTelemetryService } from '../../../server/replay/replayTelemetryService.js';
import { ReplayTrajectoryService } from '../../../server/replay/replayTrajectoryService.js';
import type {
  DetailedSession,
  DriverData,
  ReplayMetadata,
  ReplayTrajectoryData,
} from '../../../server/core/types.js';

describe('ReplayTrajectoryService', () => {
  let db: SessionDatabase;
  let catalog: TelemetryCatalog;
  let replayCache: ReplayCacheService;
  let telemetryService: ReplayTelemetryService;
  let trajectoryService: ReplayTrajectoryService;
  let sessions: DetailedSession[];

  const mockFullTrajectory = {
    replayName: 'Daytona.Vcr',
    bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
    source: 'vcr',
    currentLap: 1,
    driverSlot: 0,
    driverName: 'Samuel Lague',
    points: [
      { x: 0, y: 0, z: 0, timeSec: 0, speedKmh: 100 },
      { x: 10, y: 0, z: 20, timeSec: 1, speedKmh: 150 },
      { x: 20, y: 0, z: 40, timeSec: 2, speedKmh: 200 },
      { x: 30, y: 0, z: 60, timeSec: 3, speedKmh: 220 },
    ],
    pointsCount: 4,
    rawPointsCount: 4,
    rawSampleRateHz: 50,
    laps: [{ lapNumber: 1, lapTimeSec: 96.0, s1Sec: 30, s2Sec: 36, s3Sec: 30 }],
  } as unknown as ReplayTrajectoryData;

  const mockMetadata = {
    filename: 'Daytona.Vcr',
    filePath: '/replays/Daytona.Vcr',
    trackVenue: 'Daytona International Speedway',
    trackCourse: 'Daytona International Speedway Road Course',
    drivers: [
      { slot: 0, name: 'Samuel Lague', isPlayer: true },
      { slot: 1, name: 'Other Driver', isPlayer: false },
    ],
  } as unknown as ReplayMetadata;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    catalog = new TelemetryCatalog(db);
    replayCache = new ReplayCacheService(db);
    telemetryService = new ReplayTelemetryService(db, catalog);
    sessions = [];

    trajectoryService = new ReplayTrajectoryService(
      '/mock/replays',
      replayCache,
      { configuredPlayerName: 'Samuel Lague' },
      () => sessions,
      telemetryService
    );
  });

  it('retrieves full trajectory and downsamples to requested maxPoints', async () => {
    vi.spyOn(replayCache, 'getFullTrajectory').mockReturnValue(mockFullTrajectory);
    vi.spyOn(replayCache, 'getMetadata').mockReturnValue(mockMetadata);

    const traj = await trajectoryService.getTrajectory({
      replayName: 'Daytona.Vcr',
      driverSlot: 0,
      maxPoints: 2,
      allowDuckDb: false,
    });

    expect(traj.source).toBe('vcr');
    expect(traj.points).toHaveLength(2);
    expect(traj.rawPointsCount).toBe(4);
    expect(traj.driverSlot).toBe(0);
    expect(traj.driverName).toBe('Samuel Lague');
  });

  it('resolves driver slot from driverName parameter', async () => {
    vi.spyOn(replayCache, 'resolveDriverSlot').mockReturnValue(1);
    const getFullTrajSpy = vi.spyOn(replayCache, 'getFullTrajectory').mockReturnValue({
      ...mockFullTrajectory,
      driverSlot: 1,
      driverName: 'Other Driver',
    });
    vi.spyOn(replayCache, 'getMetadata').mockReturnValue(mockMetadata);

    const traj = await trajectoryService.getTrajectory({
      replayName: 'Daytona.Vcr',
      driverName: 'Other Driver',
      maxPoints: 4,
      allowDuckDb: false,
    });

    expect(replayCache.resolveDriverSlot).toHaveBeenCalledWith(
      expect.stringContaining('Daytona.Vcr'),
      'Daytona.Vcr',
      'Other Driver',
      'Samuel Lague'
    );
    expect(getFullTrajSpy).toHaveBeenCalledWith(
      expect.any(String),
      'Daytona.Vcr',
      expect.objectContaining({ driverSlot: 1, driverName: 'Other Driver' })
    );
    expect(traj.driverSlot).toBe(1);
  });

  it('applies official lap validation when matched session exists', async () => {
    vi.spyOn(replayCache, 'getFullTrajectory').mockReturnValue(mockFullTrajectory);
    vi.spyOn(replayCache, 'getMetadata').mockReturnValue(mockMetadata);

    const session = {
      id: 'daytona-session-1',
      matchingReplayFile: { name: 'Daytona.Vcr' },
      trackVenue: 'Daytona International Speedway',
      trackCourse: 'Daytona International Speedway Road Course',
      sessionType: 'Race',
      playerDriver: {
        name: 'Samuel Lague',
        bestLapTime: 95.8,
        laps: [{ lapNum: 1, lapTime: 95.8, s1: 29.9, s2: 35.9, s3: 30.0, isValid: true }],
      } as unknown as DriverData,
      drivers: [],
    } as unknown as DetailedSession;

    sessions.push(session);

    const traj = await trajectoryService.getTrajectory({
      replayName: 'Daytona.Vcr',
      driverSlot: 0,
      maxPoints: 4,
      allowDuckDb: false,
    });

    expect(traj.validation).toBeDefined();
    expect(traj.validation?.matchedSessionId).toBe('daytona-session-1');
    expect(traj.validation?.officialBestLapTime).toBe(95.8);
    expect(traj.laps?.[0].validatedTimeSec).toBe(95.8);
    expect(traj.laps?.[0].timeDiffSec).toBe(0.2);
  });

  it('standardizes layoutKey from circuitSpec when geometry lookup completes', async () => {
    vi.spyOn(replayCache, 'getFullTrajectory').mockReturnValue(mockFullTrajectory);
    vi.spyOn(replayCache, 'getMetadata').mockReturnValue(mockMetadata);

    const traj = await trajectoryService.getTrajectory({
      replayName: 'Daytona.Vcr',
      driverSlot: 0,
      maxPoints: 4,
      allowDuckDb: false,
    });

    expect(traj.layoutKey).toBe('daytona_road_course');
  });
});
