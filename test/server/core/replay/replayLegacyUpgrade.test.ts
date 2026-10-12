import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { initDbSchema, compressJson, REPLAY_CACHE_VERSION } from '../../../../server/core/dbSchema.js';
import {
  compressTrajectory,
  recalibrateLegacyAmbientTemp,
  upgradeStoredReplayMetadata,
  upgradeStoredTrajectory,
} from '../../../../server/core/replay/replayTrajectoryCodec.js';
import { getStoredReplayTrajectory } from '../../../../server/core/replay/dbReplayTrajectoryStore.js';
import { getStoredReplayMetadata } from '../../../../server/core/replay/dbReplayMetadataStore.js';
import { ReplayLapSummary, ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';

const legacyTrajectory = (): ReplayTrajectoryData => ({
  replayName: 'Lost.Vcr',
  driverSlot: 1,
  currentLap: 3,
  pointsCount: 2,
  bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1 },
  ambientTemp: 26.2,
  trackTemp: 27.3,
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

  it('moves mislabelled fuel to Virtual Energy, and drops track temperature', () => {
    const upgraded = upgradeStoredTrajectory(legacyTrajectory(), 'v5');
    expect(upgraded.trackTemp).toBeUndefined();
    expect(upgraded.ambientTemp).toBe(25);
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

  it('normalizes cached out-lap spelling at the read boundary for current and v6 rows', () => {
    const trajectory = legacyTrajectory();
    const legacyLap: ReplayLapSummary = { lapNumber: 1, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 };
    Object.assign(legacyLap, { isOutlap: true });
    const canonicalFalse: ReplayLapSummary = { lapNumber: 2, lapTimeSec: 91, s1Sec: 30, s2Sec: 30, s3Sec: 31, isOutLap: false };
    Object.assign(canonicalFalse, { isOutlap: true });
    const nested = legacyTrajectory();
    const nestedLap: ReplayLapSummary = { lapNumber: 3, lapTimeSec: 92, s1Sec: 30, s2Sec: 31, s3Sec: 31 };
    Object.assign(nestedLap, { isOutlap: false });
    nested.laps = [nestedLap];
    trajectory.laps = [legacyLap, canonicalFalse];
    trajectory.allLapsData = [nested];

    const upgraded = upgradeStoredTrajectory(trajectory, REPLAY_CACHE_VERSION);
    expect(upgraded.laps?.map(lap => lap.isOutLap)).toEqual([true, false]);
    expect(upgraded.laps?.every(lap => !Object.prototype.hasOwnProperty.call(lap, 'isOutlap'))).toBe(true);
    expect(upgraded.allLapsData?.[0].laps?.[0].isOutLap).toBe(false);
    expect(upgraded.allLapsData?.[0].laps?.[0]).not.toHaveProperty('isOutlap');

    const metadataLap: ReplayLapSummary = { lapNumber: 4, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 };
    Object.assign(metadataLap, { isOutlap: true });
    const metadata: ReplayMetadata = {
      filename: 'Lost.Vcr', filePath: 'C:/gone/Lost.Vcr', fileSizeBytes: 1, mtimeMs: 1,
      timeSliceCount: 0, totalEvents: 0, durationSec: 0, drivers: [], laps: [metadataLap],
    };
    const upgradedMetadata = upgradeStoredReplayMetadata(metadata, 'v6');
    expect(upgradedMetadata.laps?.[0].isOutLap).toBe(true);
    expect(upgradedMetadata.laps?.[0]).not.toHaveProperty('isOutlap');
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

  it('normalizes v7 cached lap spellings for deleted replays without rewriting either blob', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const trueLap: ReplayLapSummary = { lapNumber: 1, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 };
    Object.assign(trueLap, { isOutlap: true });
    const falseLap: ReplayLapSummary = {
      lapNumber: 2, lapTimeSec: 91, s1Sec: 30, s2Sec: 30, s3Sec: 31, isOutLap: false,
    };
    Object.assign(falseLap, { isOutlap: true });
    const nestedLap: ReplayLapSummary = { lapNumber: 3, lapTimeSec: 92, s1Sec: 30, s2Sec: 31, s3Sec: 31 };
    Object.assign(nestedLap, { isOutlap: true });
    const trajectory = legacyTrajectory();
    trajectory.laps = [trueLap, falseLap];
    const nested = legacyTrajectory();
    nested.laps = [nestedLap];
    trajectory.allLapsData = [nested];
    const metadataLap: ReplayLapSummary = { lapNumber: 1, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 };
    Object.assign(metadataLap, { isOutlap: true });
    const metadataFalseLap: ReplayLapSummary = {
      lapNumber: 2, lapTimeSec: 91, s1Sec: 30, s2Sec: 30, s3Sec: 31, isOutLap: false,
    };
    Object.assign(metadataFalseLap, { isOutlap: true });
    const metadata: ReplayMetadata = {
      filename: 'Lost.Vcr', filePath: 'C:/gone/Lost.Vcr', fileSizeBytes: 1, mtimeMs: 1,
      timeSliceCount: 0, totalEvents: 0, durationSec: 0, drivers: [], laps: [metadataLap, metadataFalseLap],
    };
    const trajectoryBlob = compressTrajectory(trajectory);
    const metadataBlob = compressJson(metadata);
    db.prepare(`INSERT INTO replay_metadata (filename, file_path, file_mtime, file_size, parser_version, metadata_br, updated_at)
      VALUES ('Lost.Vcr', 'C:/gone/Lost.Vcr', 1, 1, 'v7', ?, 1)`).run(metadataBlob);
    db.prepare(`INSERT INTO replay_trajectories (filename, source_path, driver_slot, lap_key, file_mtime, file_size, parser_version, points_count, trajectory_br, updated_at)
      VALUES ('Lost.Vcr', 'C:/gone/Lost.Vcr', 1, 3, 1, 1, 'v7', 2, ?, 1)`).run(trajectoryBlob);

    const readTrajectory = getStoredReplayTrajectory(db, 'Lost.Vcr', 1, 3);
    expect(readTrajectory?.laps?.map(lap => lap.isOutLap)).toEqual([true, false]);
    expect(readTrajectory?.allLapsData?.[0].laps?.[0].isOutLap).toBe(true);
    expect(readTrajectory?.laps?.every(lap => !Object.prototype.hasOwnProperty.call(lap, 'isOutlap'))).toBe(true);
    const readMetadata = getStoredReplayMetadata(db, 'Lost.Vcr');
    expect(readMetadata?.laps?.map(lap => lap.isOutLap)).toEqual([true, false]);
    expect(readMetadata?.laps?.every(lap => !Object.prototype.hasOwnProperty.call(lap, 'isOutlap'))).toBe(true);

    const storedTrajectory = db.prepare("SELECT parser_version, trajectory_br FROM replay_trajectories WHERE filename = 'Lost.Vcr'")
      .get() as { parser_version: string; trajectory_br: Buffer };
    const storedMetadata = db.prepare("SELECT parser_version, metadata_br FROM replay_metadata WHERE filename = 'Lost.Vcr'")
      .get() as { parser_version: string; metadata_br: Buffer };
    expect(storedTrajectory.parser_version).toBe('v7');
    expect(storedTrajectory.trajectory_br.equals(trajectoryBlob)).toBe(true);
    expect(storedMetadata.parser_version).toBe('v7');
    expect(storedMetadata.metadata_br.equals(metadataBlob)).toBe(true);
    db.close();
  });
});
