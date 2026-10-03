import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SessionDatabase } from '../../../server/core/db.js';
import { ReplayCacheService } from '../../../server/replay/replayCacheService.js';
import { ReplayDriverNotFoundError, ReplayDriverNotRecordedError } from '../../../server/replay/replayServiceTypes.js';
import { createSliceVcrBuffer } from '../../utils/mockVcr.js';

describe('ReplayCacheService', () => {
  let db: SessionDatabase;
  let service: ReplayCacheService;
  let tempDir: string;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    service = new ReplayCacheService(db);
    tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test', 'fixtures', 'replay-cache-'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('serves cached metadata when the source replay is deleted', () => {
    const replayName = 'Cache_Test_P1.Vcr';
    const filePath = path.join(tempDir, replayName);
    fs.writeFileSync(filePath, createSliceVcrBuffer({
      drivers: [{ name: 'Cache Driver', vehicleId: '21_26_AFCO95641716', team: 'Test Team', carNumber: '21' }],
    }));

    const metadata = service.getMetadata(filePath, replayName, 'Cache Driver');
    expect(metadata.drivers[0]?.name).toBe('Cache Driver');

    fs.rmSync(filePath);

    expect(service.getMetadata(filePath, replayName)).toEqual(metadata);
  });

  it('resolves driver slots by exact and partial names', () => {
    const replayName = 'Driver_Match_P1.Vcr';
    const filePath = path.join(tempDir, replayName);
    fs.writeFileSync(filePath, createSliceVcrBuffer({
      drivers: [{ name: 'Cache Driver', vehicleId: '21_26_AFCO95641716', team: 'Test Team', carNumber: '21' }],
    }));

    expect(service.resolveDriverSlot(filePath, replayName, 'Cache Driver')).toBe(1);
    expect(service.resolveDriverSlot(filePath, replayName, 'Driver')).toBe(1);
    expect(service.resolveDriverSlot(filePath, replayName, 'Unknown Driver')).toBeUndefined();
    expect(service.resolveDriverSlot(filePath, replayName)).toBeUndefined();
  });

  it('serves cached trajectory data when the source replay is deleted', async () => {
    const replayName = 'Trajectory_Cache_P1.Vcr';
    const filePath = path.join(tempDir, replayName);
    fs.writeFileSync(filePath, createSliceVcrBuffer({
      drivers: [{ name: 'Cache Driver', vehicleId: '21_26_AFCO95641716', team: 'Test Team', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 10, y: 0, z: 20 },
        { sTime: 1, driverSlot: 1, x: 11, y: 0, z: 21 },
      ],
    }));

    const trajectory = await service.getFullTrajectory(filePath, replayName, { driverName: 'Cache Driver' });
    expect(trajectory.points.length).toBeGreaterThan(0);

    fs.rmSync(filePath);

    expect(await service.getFullTrajectory(filePath, replayName, { driverSlot: 1 })).toEqual(trajectory);
  });

  it('reports a driver with no stored laps once the replay is deleted, instead of serving the player\'s lap', async () => {
    const replayName = 'Missing_Driver_P1.Vcr';
    const filePath = path.join(tempDir, replayName);
    fs.writeFileSync(filePath, createSliceVcrBuffer({
      drivers: [{ name: 'Cache Driver', vehicleId: '21_26_AFCO95641716', team: 'Test Team', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 10, y: 0, z: 20 },
        { sTime: 1, driverSlot: 1, x: 11, y: 0, z: 21 },
      ],
    }));
    service.getMetadata(filePath, replayName, 'Cache Driver');
    await service.getFullTrajectory(filePath, replayName, { driverName: 'Cache Driver' });
    fs.rmSync(filePath);

    await expect(service.getFullTrajectory(filePath, replayName, { driverSlot: 7 })).rejects.toThrow(ReplayDriverNotRecordedError);
    // The trajectory route answers 404 for ReplayDriverNotFoundError and its subclasses.
    expect(new ReplayDriverNotRecordedError(7, replayName)).toBeInstanceOf(ReplayDriverNotFoundError);
  });

  it('keeps the cached recording when the file on disk is replaced by another recording', async () => {
    const replayName = 'Reused_Name_P1.Vcr';
    const filePath = path.join(tempDir, replayName);
    const write = (x: number, savedAtMs: number) => {
      fs.writeFileSync(filePath, createSliceVcrBuffer({
        drivers: [{ name: 'Cache Driver', vehicleId: '21_26_AFCO95641716', team: 'Test Team', carNumber: '21' }],
        slices: [
          { sTime: 0, driverSlot: 1, x, y: 0, z: 20 },
          { sTime: 1, driverSlot: 1, x: x + 1, y: 0, z: 21 },
        ],
      }));
      fs.utimesSync(filePath, savedAtMs / 1000, savedAtMs / 1000);
    };
    const firstSave = Date.parse('2026-06-28T20:00:00.000Z');
    write(10, firstSave);
    const first = await service.getFullTrajectory(filePath, replayName, { driverSlot: 1 });

    // Hours later the name is reused for another recording.
    write(500, firstSave + 3 * 3600_000);
    const second = await service.getFullTrajectory(filePath, replayName, { driverSlot: 1 });

    const archivedName = 'Reused_Name_P1 @2026-06-28T20-00-00Z.Vcr';
    expect(second.points[0].x).not.toBe(first.points[0].x);
    expect(db.getStoredReplayTrajectory(archivedName, 1, -1)?.points[0].x).toBe(first.points[0].x);
    expect(db.getAllStoredReplayFiles().map(r => r.filename).sort()).toEqual([archivedName, replayName].sort());
  });

  it('throws when neither the replay nor cached data exists', async () => {
    const filePath = path.join(tempDir, 'missing.vcr');

    expect(() => service.getMetadata(filePath, 'missing.vcr')).toThrow('Replay file and cached metadata not found');
    await expect(service.getFullTrajectory(filePath, 'missing.vcr', {})).rejects.toThrow('Replay file and cached trajectory not found');
  });

  it('attaches the recording either side of a lap from the stored neighbouring laps, even once the replay is deleted', async () => {
    const replayName = 'Deleted_Edges_R1.Vcr';
    const lap = (n: number) => ({
      replayName,
      pointsCount: 11,
      currentLap: n,
      driverSlot: 3,
      bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
      // 10 s laps sampled every second at 5 m/s, back to back.
      points: Array.from({ length: 11 }, (_, i) => ({ x: (n * 10 + i) * 5, y: 0, z: 0, timeSec: n * 10 + i })),
    });
    for (const n of [3, 4, 5]) db.upsertReplayTrajectoryCache(replayName, 3, n, 1000, 5000, lap(n));

    const trajectory = await service.getFullTrajectory(path.join(tempDir, replayName), replayName, { driverSlot: 3, lapNumber: 4 });

    expect(trajectory.currentLap).toBe(4);
    expect(trajectory.leadInPoints?.map(p => p.timeSec)).toEqual([38, 39]);
    expect(trajectory.leadOutPoints?.map(p => p.timeSec)).toEqual([51, 52]);
  });

  describe('a lap not cached yet', () => {
    const replayName = 'Miss_P1.Vcr';
    const writeReplay = () => {
      const filePath = path.join(tempDir, replayName);
      fs.writeFileSync(filePath, createSliceVcrBuffer({
        drivers: [
          { name: 'Cache Driver', vehicleId: '21_26_AFCO95641716', team: 'Test Team', carNumber: '21' },
          { name: 'Rival Driver', vehicleId: '21_26_AFCO95641716', team: 'Other Team', carNumber: '22' },
        ],
        slices: [
          { sTime: 0, driverSlot: 1, x: 10, y: 0, z: 20 },
          { sTime: 1, driverSlot: 1, x: 11, y: 0, z: 21 },
          { sTime: 0, driverSlot: 2, x: 50, y: 0, z: 20 },
          { sTime: 1, driverSlot: 2, x: 51, y: 0, z: 21 },
        ],
      }));
      const stat = fs.statSync(filePath);
      return { filePath, mtime: Math.floor(stat.mtimeMs), size: stat.size };
    };

    it('is decoded in the worker thread and stored as the whole set of the driver', async () => {
      const { filePath, mtime, size } = writeReplay();

      const trajectory = await service.getFullTrajectory(filePath, replayName, { driverSlot: 2 });

      expect(trajectory.points[0].x).toBe(50);
      expect(db.getReplayTrajectoryCache(replayName, 2, 1, mtime, size)).not.toBeNull();
      expect(db.getReplayDriverIngest(replayName, 2)).toMatchObject({ status: 'stored', fileMtime: mtime });
    });

    it('sets the default driver when no driver is asked for', async () => {
      const { filePath, mtime, size } = writeReplay();

      await service.getFullTrajectory(filePath, replayName, { playerName: 'Cache Driver' });

      expect(db.getReplayTrajectoryCache(replayName, -1, -1, mtime, size)?.driverSlot).toBe(1);
    });

    it('is decoded once for requests made while it decodes', async () => {
      const { filePath } = writeReplay();
      const replace = vi.spyOn(db, 'replaceReplayDriverLaps');

      const [a, b] = await Promise.all([
        service.getFullTrajectory(filePath, replayName, { driverSlot: 2 }),
        service.getFullTrajectory(filePath, replayName, { driverSlot: 2 }),
      ]);

      expect(replace).toHaveBeenCalledTimes(1);
      expect(a.points).toEqual(b.points);
    });

    it('is not decoded again after it failed for this file and parser version', async () => {
      const { filePath, mtime, size } = writeReplay();
      db.recordReplayDriverIngest(replayName, 2, mtime, size, 'failed', 'bad stream');
      const replace = vi.spyOn(db, 'replaceReplayDriverLaps');

      await expect(service.getFullTrajectory(filePath, replayName, { driverSlot: 2 })).rejects.toThrow('bad stream');
      expect(replace).not.toHaveBeenCalled();
    });

    it('records a failed decode', async () => {
      const { filePath } = writeReplay();
      vi.spyOn(db, 'replaceReplayDriverLaps').mockImplementation(() => { throw new Error('disk full'); });

      await expect(service.getFullTrajectory(filePath, replayName, { driverSlot: 2 })).rejects.toThrow('disk full');
      expect(db.getReplayDriverIngest(replayName, 2)).toMatchObject({ status: 'failed', error: 'disk full' });
    });
  });
});
