vi.mock('../../../server/plugins/dataPlugin.js', async (importOriginal) => {
  const actual=await importOriginal<typeof import('../../../server/plugins/dataPlugin.js')>();
  const {syntheticTrack}=await import('../../helpers/syntheticTrack.js');
  return {...actual,dataPlugin:{status:actual.dataPlugin.status,
    trackGeometry:(key:string)=>['monza_gp','daytona_road_course'].includes(key)?syntheticTrack(key):null,
    track:(key:string)=>['monza_gp','daytona_road_course'].includes(key)?{geometry:syntheticTrack(key),display:null}:null,
    vehicle:()=>null,vehicles:()=>[]}};
});
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import { ReplayRecordingService } from '../../../server/replay/replayRecordingService.js';
import { ReplayTelemetryService } from '../../../server/replay/replayTelemetryService.js';
import { ReplayTrajectoryService } from '../../../server/replay/replayTrajectoryService.js';
import { ReplayDriverNotFoundError } from '../../../server/replay/replayServiceTypes.js';
import { getTrackDefinition } from '../../../server/tracks/serverTrackSync.js';
import type {
  DetailedSession,
  DriverData,
  ReplayMetadata,
  ReplayTrajectoryData,
} from '../../../server/core/types.js';

describe('ReplayTrajectoryService', () => {
  let db: SessionDatabase;
  let replayRecordings: ReplayRecordingService;
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
    replayRecordings = new ReplayRecordingService(db);
    telemetryService = new ReplayTelemetryService(db);
    sessions = [];

    trajectoryService = new ReplayTrajectoryService(
      '/mock/replays',
      replayRecordings,
      { configuredPlayerName: 'Samuel Lague' },
      telemetryService
    );
  });

  it('retrieves full trajectory and downsamples to requested maxPoints', async () => {
    vi.spyOn(replayRecordings, 'getFullTrajectory').mockResolvedValue(mockFullTrajectory);
    vi.spyOn(replayRecordings, 'getMetadata').mockReturnValue(mockMetadata);

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

  it('serves one point per pointSpacingM metres of the lap instead of maxPoints when asked', async () => {
    vi.spyOn(replayRecordings, 'getFullTrajectory').mockResolvedValue(mockFullTrajectory);
    vi.spyOn(replayRecordings, 'getMetadata').mockReturnValue(mockMetadata);

    // Spaced over the Daytona road course's length (5748 m): 2000 m spacing is 3 points, whatever
    // maxPoints says (0 = full resolution).
    const traj = await trajectoryService.getTrajectory({ replayName: 'Daytona.Vcr', driverSlot: 0, maxPoints: 0, pointSpacingM: 2000, allowDuckDb: false });

    const canonical = getTrackDefinition('daytona_road_course');
    expect(canonical).not.toBeNull();
    // The response rounds measured polyline length to centimetres; catalog length uses millimetres.
    expect(traj.trackLengthM).toBeCloseTo(canonical?.spatialIndex.totalLengthM ?? 0, 2);
    expect(traj.points).toHaveLength(4);
    expect(traj.maxPoints).toBeUndefined();
  });

  it('projects and cuts the lap at the line at full resolution, then downsamples', async () => {
    // Monza centreline vertices 0.1 s apart; the timing loop sliced the lap 3 vertices late.
    const centerline = getTrackDefinition('monza_gp')?.centerline ?? [];
    const at = (i: number) => {
      const [x, z] = centerline[(i + centerline.length) % centerline.length];
      return { x, y: 0, z, timeSec: 100 + i * 0.1, speedKmh: 250 };
    };
    const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => at(from + k));
    vi.spyOn(replayRecordings, 'getFullTrajectory').mockResolvedValue({
      ...mockFullTrajectory,
      replayName: 'Monza.Vcr',
      points: range(3, 60),
      leadInPoints: range(-6, 2),
      leadOutPoints: range(61, 64),
    });
    vi.spyOn(replayRecordings, 'getMetadata').mockReturnValue({
      ...mockMetadata,
      filename: 'Monza.Vcr',
      trackVenue: 'Autodromo Nazionale Monza',
      trackCourse: 'Monza GP',
    });

    const traj = await trajectoryService.getTrajectory({ replayName: 'Monza.Vcr', driverSlot: 0, maxPoints: 10, allowDuckDb: false });

    expect(traj.layoutKey).toBe('monza_gp');
    expect(traj.points).toHaveLength(10);
    expect(traj.points[0].stationM).toBe(0);
    expect(traj.points[0].timeSec).toBeCloseTo(100, 2);
    expect(traj.leadInPoints).toBeUndefined();
    expect(traj.leadOutPoints).toBeUndefined();
  });

  it('resolves driver slot from driverName parameter', async () => {
    vi.spyOn(replayRecordings, 'resolveDriverSlot').mockReturnValue(1);
    const getFullTrajSpy = vi.spyOn(replayRecordings, 'getFullTrajectory').mockResolvedValue({
      ...mockFullTrajectory,
      driverSlot: 1,
      driverName: 'Other Driver',
    });
    vi.spyOn(replayRecordings, 'getMetadata').mockReturnValue(mockMetadata);

    const traj = await trajectoryService.getTrajectory({
      replayName: 'Daytona.Vcr',
      driverName: 'Other Driver',
      maxPoints: 4,
      allowDuckDb: false,
    });

    expect(replayRecordings.resolveDriverSlot).toHaveBeenCalledWith(
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
    vi.spyOn(replayRecordings, 'getFullTrajectory').mockResolvedValue(mockFullTrajectory);
    vi.spyOn(replayRecordings, 'getMetadata').mockReturnValue(mockMetadata);

    const player = { name: 'Samuel Lague', driverName: 'Samuel Lague', bestLapTime: 95.8,
      laps: [{ lapNum: 1, lapTime: 95.8, s1: 29.9, s2: 35.9, s3: 30.0, isValid: true }] } as unknown as DriverData;
    const session = {
      id: 'daytona-session-1',
      matchingReplayFile: { name: 'Daytona.Vcr' },
      trackVenue: 'Daytona International Speedway',
      trackCourse: 'Daytona International Speedway Road Course',
      sessionType: 'Race',
      playerDriver: player,
      drivers: [player],
    } as unknown as DetailedSession;

    sessions.push(session);

    const traj = await trajectoryService.getTrajectory({
      replayName: 'Daytona.Vcr',
      session,
      driverOrdinal: 0,
      lapOrdinal: 0,
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
    vi.spyOn(replayRecordings, 'getFullTrajectory').mockResolvedValue(mockFullTrajectory);
    vi.spyOn(replayRecordings, 'getMetadata').mockReturnValue(mockMetadata);

    const traj = await trajectoryService.getTrajectory({
      replayName: 'Daytona.Vcr',
      driverSlot: 0,
      maxPoints: 4,
      allowDuckDb: false,
    });

    expect(traj.layoutKey).toBe('daytona_road_course');
  });

  it('rejects a named driver who is not in the replay instead of falling back to the player', async () => {
    const fullTrajectorySpy = vi.spyOn(replayRecordings, 'getFullTrajectory').mockResolvedValue(mockFullTrajectory);
    vi.spyOn(replayRecordings, 'getMetadata').mockReturnValue(mockMetadata);

    await expect(trajectoryService.getTrajectory({
      replayName: 'Daytona.Vcr',
      driverName: 'Andrzej Nycz',
      lapNumber: 4,
      maxPoints: 100,
      allowDuckDb: false,
    })).rejects.toBeInstanceOf(ReplayDriverNotFoundError);
    expect(fullTrajectorySpy).not.toHaveBeenCalled();
  });

  it('resolves a named non-player driver present in the replay to their slot', async () => {
    const fullTrajectorySpy = vi.spyOn(replayRecordings, 'getFullTrajectory').mockResolvedValue(mockFullTrajectory);
    vi.spyOn(replayRecordings, 'getMetadata').mockReturnValue(mockMetadata);

    await trajectoryService.getTrajectory({
      replayName: 'Daytona.Vcr',
      driverName: 'Other Driver',
      maxPoints: 100,
      allowDuckDb: false,
    });
    expect(fullTrajectorySpy).toHaveBeenCalledWith(expect.any(String), 'Daytona.Vcr', expect.objectContaining({ driverSlot: 1 }));
  });

  it('keeps official timing and player telemetry tied to the exact selected driver', async () => {
    const player = { name: 'Ann Smith', laps: [{ lapNum: 1, lapTime: 96, isValid: true }] } as unknown as DriverData;
    const other = { name: 'Ann Smithson', laps: [{ lapNum: 1, lapTime: 100, isValid: true }] } as unknown as DriverData;
    const metadata = { ...mockMetadata, drivers: [{ slot: 0, name: other.name, isPlayer: false }, { slot: 1, name: player.name, isPlayer: true }] };
    vi.spyOn(replayRecordings, 'getMetadata').mockReturnValue(metadata);
    vi.spyOn(replayRecordings, 'getFullTrajectory').mockResolvedValue({ ...mockFullTrajectory, driverSlot: 1, driverName: player.name });
    const telemetry = vi.spyOn(telemetryService, 'enrichWithTelemetry').mockImplementation(async input => ({ trajectory: input.currentTrajectory, fused: false }));
    const session = { id: 'exact', matchingReplayFile: { name: 'Daytona.Vcr' }, trackVenue: 'Daytona', trackCourse: 'Road Course',
      drivers: [other, player], playerDriver: player } as unknown as DetailedSession;
    sessions.push(session);
    const service = new ReplayTrajectoryService('/mock/replays', replayRecordings, { configuredPlayerName: player.name }, telemetryService);
    const result = await service.getTrajectory({ replayName: 'Daytona.Vcr', session, driverOrdinal: 1, lapOrdinal: 0, allowDuckDb: true, maxPoints: 0 });
    expect(result.validation?.driverName).toBe(player.name);
    expect(telemetry.mock.calls[0][0].isPlayer).toBe(true);
    await service.getTrajectory({ replayName: 'Daytona.Vcr', session, driverOrdinal: 0, lapOrdinal: 0, allowDuckDb: true, maxPoints: 0 });
    expect(telemetry.mock.calls[1][0].isPlayer).toBe(false);
  });
});
