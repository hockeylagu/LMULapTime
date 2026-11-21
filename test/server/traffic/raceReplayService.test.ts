import { describe, it, expect, vi } from 'vitest';
import { RaceReplayService, type RaceReplayStore } from '../../../server/traffic/raceReplayService.js';
import { resampleLapsInWorker } from '../../../server/traffic/racePosesWorkerClient.js';
import { resampleLapPoses } from '../../../server/traffic/racePoses.js';
import { compressTrajectory } from '../../../server/core/replay/replayTrajectoryCodec.js';
import { decodeRacePoseWindow, RACE_POSE_CHANNEL_COUNT } from '../../../shared/domain/raceReplay/poseWindow.js';
import type { ReplayLapFactRow } from '../../../server/core/replay/dbReplayLapStore.js';
import type { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../shared/types/index.js';

function blob(startSec: number, durationSec: number, x0: number): Buffer {
  const points: ReplayTrajectoryPoint[] = [];
  for (let i = 0; i <= durationSec * 50; i++) points.push({ x: x0 + i, y: 0, z: 0, timeSec: startSec + i / 50, rotY: 0, speedKmh: 100 });
  const lap: ReplayTrajectoryData = { replayName: 'R1.Vcr', pointsCount: points.length, vcrRawSampleRateHz: 50, currentLap: 1,
    bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 }, points };
  return compressTrajectory(lap);
}

const fact = (driverSlot: number, lapNumber: number, startSec: number, endSec: number): ReplayLapFactRow => ({
  driverSlot, lapNumber, startSec, endSec, lapTimeSec: endSec - startSec, s1Sec: null, s2Sec: null, s3Sec: null,
  lapDistM: null, isOutLap: lapNumber === 1, isValid: true, isBest: false, startFrame: null, endFrame: null,
});

function store(): RaceReplayStore & { blobs: ReturnType<typeof vi.fn> } {
  const laps = [fact(1, 1, 0, 50), fact(1, 2, 50, 100), fact(2, 1, 0, 70), fact(3, 1, null as unknown as number, 10)];
  const blobs = vi.fn((_: string, wanted: ReadonlyArray<{ slot: number; lapNumber: number }>) => wanted.map(lap => {
    const row = laps.find(entry => entry.driverSlot === lap.slot && entry.lapNumber === lap.lapNumber)!;
    return { slot: lap.slot, lapNumber: lap.lapNumber, blob: blob(row.startSec!, row.endSec! - row.startSec!, lap.slot * 1000) };
  }));
  return {
    blobs,
    getReplaySignature: () => 'sig',
    getReplayLaps: () => laps,
    getReplayLapBlobs: blobs,
    getReplayRunningOrder: () => [{ timeSec: 0, order: [2, 1] }],
    getReplayDriverEvents: () => [],
  };
}

const inProcess = (laps: Array<{ key: string; blob: Uint8Array }>, hz: number) =>
  Promise.resolve(laps.map(lap => ({ key: lap.key, ...resampleLapPoses(lap.blob, hz) })));

describe('RaceReplayService', () => {
  it('describes the session on one clock: cars, timed laps and running order', () => {
    const overview = new RaceReplayService(store(), inProcess).getOverview({
      replayName: 'R1.Vcr', sessionType: 'Race', trackVenue: 'LeMans_2023', trackCourse: 'Circuit de la Sarthe', sceneDesc: 'LEMANSWEC', cars: [{ slot: 1, name: 'A' }],
      daylight: { raceStartMinute: 840, cloudCover: [[0, 0.2]], cloudField: null, cloudVariants: null },
    });

    expect(overview).toMatchObject({ startSec: 0, endSec: 100, windowSec: 60, sessionType: 'Race', cars: [{ slot: 1, name: 'A' }] });
    expect(overview.layoutKey).toBe('sarthe_full');
    // Car 2 is not asked for (as the pace car is left out): neither its laps nor its place come with the race.
    expect(overview.laps.map(lap => lap.slot)).toEqual([1, 1]);
    expect(overview.runningOrder).toEqual([{ timeSec: 0, order: [1] }]);
    // The race start and weather come along, for the in-game clock at any replay time.
    expect(overview.daylight).toEqual({ raceStartMinute: 840, cloudCover: [[0, 0.2]], cloudField: null, cloudVariants: null });
  });

  it('builds a window from the laps it overlaps and reuses them for the next window', async () => {
    const data = store();
    const service = new RaceReplayService(data, inProcess);

    const first = decodeRacePoseWindow(toArrayBuffer(await service.getPoseWindow('R1.Vcr', 0)));
    expect(first.slots).toEqual([1, 2]);
    expect(first.data[10 * RACE_POSE_CHANNEL_COUNT]).toBeCloseTo(1000 + 50);
    expect(data.blobs.mock.calls[0][1]).toHaveLength(3);

    const second = decodeRacePoseWindow(toArrayBuffer(await service.getPoseWindow('R1.Vcr', 1)));
    expect(second.fromSec).toBe(60);
    // Lap 2 of car 1 and lap 1 of car 2 are reused: nothing is read again.
    expect(data.blobs).toHaveBeenCalledTimes(1);
    expect(second.data[(second.count + 5) * RACE_POSE_CHANNEL_COUNT]).toBeCloseTo(2000 + 60.5 * 50);
  });

  it('shares one build between requests for the same window, and refuses a replay without laps', async () => {
    const data = store();
    const service = new RaceReplayService(data, inProcess);
    await Promise.all([service.getPoseWindow('R1.Vcr', 0), service.getPoseWindow('R1.Vcr', 0)]);
    expect(data.blobs).toHaveBeenCalledTimes(1);

    const empty = new RaceReplayService({ ...data, getReplaySignature: () => null }, inProcess);
    await expect(empty.getPoseWindow('R1.Vcr', 0)).rejects.toThrow('no stored laps');
  });

  it('forgets the oldest laps past its byte budget', async () => {
    const data = store();
    const service = new RaceReplayService(data, inProcess, 1);
    await service.getPoseWindow('R1.Vcr', 0);
    await service.getPoseWindow('R1.Vcr', 0);
    expect(data.blobs).toHaveBeenCalledTimes(2);
  });

  it('resamples on a worker thread like in process', async () => {
    const laps = [{ key: 'a', blob: blob(0, 2, 0) }];
    const [pose] = await resampleLapsInWorker(laps, 10);
    expect(pose.key).toBe('a');
    expect(Array.from(pose.data)).toEqual(Array.from(resampleLapPoses(laps[0].blob, 10).data));
  });
});

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
