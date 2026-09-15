import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SessionDatabase } from '../../server/core/db.js';
import { ReplayCacheService } from '../../server/replay/replayCacheService.js';
import { createSliceVcrBuffer } from '../utils/mockVcr.js';

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
    fs.rmSync(tempDir, { recursive: true, force: true });
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

  it('serves cached trajectory data when the source replay is deleted', () => {
    const replayName = 'Trajectory_Cache_P1.Vcr';
    const filePath = path.join(tempDir, replayName);
    fs.writeFileSync(filePath, createSliceVcrBuffer({
      drivers: [{ name: 'Cache Driver', vehicleId: '21_26_AFCO95641716', team: 'Test Team', carNumber: '21' }],
      slices: [
        { sTime: 0, driverSlot: 1, x: 10, y: 0, z: 20 },
        { sTime: 1, driverSlot: 1, x: 11, y: 0, z: 21 },
      ],
    }));

    const trajectory = service.getFullTrajectory(filePath, replayName, { driverName: 'Cache Driver' });
    expect(trajectory.points.length).toBeGreaterThan(0);

    fs.rmSync(filePath);

    expect(service.getFullTrajectory(filePath, replayName, { driverSlot: 1 })).toEqual(trajectory);
  });

  it('throws when neither the replay nor cached data exists', () => {
    const filePath = path.join(tempDir, 'missing.vcr');

    expect(() => service.getMetadata(filePath, 'missing.vcr')).toThrow('Replay file and cached metadata not found');
    expect(() => service.getFullTrajectory(filePath, 'missing.vcr', {})).toThrow('Replay file and cached trajectory not found');
  });
});
