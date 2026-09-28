import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { initDbSchema, compressJson, REPLAY_CACHE_VERSION } from '../../../server/core/dbSchema.js';
import {
  compressTrajectory,
  recalibrateLegacyAmbientTemp,
  upgradeStoredReplayMetadata,
  upgradeStoredTrajectory,
} from '../../../server/core/replayTrajectoryCodec.js';
import { getStoredReplayTrajectory } from '../../../server/core/dbReplayTrajectoryStore.js';
import { getStoredReplayMetadata } from '../../../server/core/dbReplayMetadataStore.js';
import { ReplayMetadata, ReplayTrajectoryData } from '../../../server/core/types.js';

const legacyTrajectory = (): ReplayTrajectoryData => ({
  replayName: 'Lost.Vcr',
  driverSlot: 1,
  currentLap: 3,
  pointsCount: 2,
  bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1 },
  ambientTemp: 26.2,
  trackTemp: 27.3,
  weatherEvents: [{ timeSec: 1, rainIntensity: 51, rainPercent: 100, ambientTemp: 26.2, trackTemp: 27.3 }],
  points: [
    { x: 0, y: 0, z: 0, fuel: 60, ambientTemp: 26.2, trackTemp: 27.3 },
    { x: 1, y: 0, z: 1, fuel: 59.6, ambientTemp: 26.2, trackTemp: 27.3 },
  ],
  energyTelemetryAvailable: true,
});

describe('legacy replay rows are corrected on read, never rewritten', () => {
  it('recovers the raw byte from the old ambient scale and applies raw / 8 + 5.9', () => {
    // Byte 153: old scale gave 26.2 °C, DuckDB says 25.025 °C.
    expect(recalibrateLegacyAmbientTemp(26.2)).toBe(25);
    // Byte 129: the old scale was calibrated here, both agree.
    expect(recalibrateLegacyAmbientTemp(22.0)).toBe(22);
  });

  it('moves mislabelled fuel to Virtual Energy, drops track temperature and rescales rain', () => {
    const upgraded = upgradeStoredTrajectory(legacyTrajectory(), 'v5');
    expect(upgraded.trackTemp).toBeUndefined();
    expect(upgraded.ambientTemp).toBe(25);
    expect(upgraded.weatherEvents?.[0]).toEqual({ timeSec: 1, rainIntensity: 51, rainPercent: 20, ambientTemp: 25 });
    expect(upgraded.points.map(p => p.virtualEnergy)).toEqual([60, 59.6]);
    expect(upgraded.points.every(p => p.fuel === undefined && p.trackTemp === undefined)).toBe(true);
  });

  it('drops an all-zero legacy fuel column instead of turning it into 0 % Virtual Energy (GTE)', () => {
    const gte = legacyTrajectory();
    gte.points.forEach(point => { point.fuel = 0; });
    const upgraded = upgradeStoredTrajectory(gte, 'v5');
    expect(upgraded.points.every(p => p.fuel === undefined && p.virtualEnergy === undefined)).toBe(true);
    expect(upgraded.energyTelemetryAvailable).toBe(false);
  });

  it('leaves rows written by the current parser untouched', () => {
    const current = legacyTrajectory();
    expect(upgradeStoredTrajectory(current, REPLAY_CACHE_VERSION)).toEqual(legacyTrajectory());
    const meta = { ambientTemp: 25, replayName: 'x' } as unknown as ReplayMetadata;
    expect(upgradeStoredReplayMetadata(meta, REPLAY_CACHE_VERSION).ambientTemp).toBe(25);
  });

  it('leaves v6 rows alone: they already use the calibrated ambient scale and Virtual Energy', () => {
    expect(upgradeStoredTrajectory(legacyTrajectory(), 'v6')).toEqual(legacyTrajectory());
    const meta = { ambientTemp: 25, replayName: 'x' } as unknown as ReplayMetadata;
    expect(upgradeStoredReplayMetadata(meta, 'v6').ambientTemp).toBe(25);
  });

  it('serves upgraded values for a deleted replay while its stored blobs stay as written', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const trajectoryBlob = compressTrajectory(legacyTrajectory());
    const metadataBlob = compressJson({ replayName: 'Lost.Vcr', ambientTemp: 26.2, trackTemp: 27.3 });
    db.prepare(`INSERT INTO replay_metadata (filename, file_path, file_mtime, file_size, parser_version, metadata_br, updated_at)
      VALUES ('Lost.Vcr', 'C:/gone/Lost.Vcr', 1, 1, 'v5', ?, 1)`).run(metadataBlob);
    db.prepare(`INSERT INTO replay_trajectories (filename, source_path, driver_slot, lap_key, file_mtime, file_size, parser_version, points_count, trajectory_br, updated_at)
      VALUES ('Lost.Vcr', 'C:/gone/Lost.Vcr', 1, 3, 1, 1, 'v5', 2, ?, 1)`).run(trajectoryBlob);

    const trajectory = getStoredReplayTrajectory(db, 'Lost.Vcr', 1, 3);
    expect(trajectory?.points[0].virtualEnergy).toBe(60);
    expect(trajectory?.points[0].fuel).toBeUndefined();
    const metadata = getStoredReplayMetadata(db, 'Lost.Vcr');
    expect(metadata?.ambientTemp).toBe(25);
    expect(metadata?.trackTemp).toBeUndefined();

    const row = db.prepare("SELECT parser_version, trajectory_br FROM replay_trajectories WHERE filename = 'Lost.Vcr'").get() as { parser_version: string; trajectory_br: Buffer };
    expect(row.parser_version).toBe('v5');
    expect(row.trajectory_br.equals(trajectoryBlob)).toBe(true);
    db.close();
  });
});
