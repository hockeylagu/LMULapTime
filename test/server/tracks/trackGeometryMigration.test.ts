vi.mock('../../../server/plugins/dataPlugin.js', async (importOriginal) => {
  const actual=await importOriginal<typeof import('../../../server/plugins/dataPlugin.js')>();
  const {syntheticTrack}=await import('../../helpers/syntheticTrack.js');
  return {...actual,dataPlugin:{status:actual.dataPlugin.status,
    track:(key:string)=>['monza_gp','daytona_road_course'].includes(key)?{geometry:syntheticTrack(key),display:null}:null,
    vehicle:()=>null,vehicles:()=>[]}};
});
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackBoundaryGeometry } from '../../../shared/types/trackGeometry.js';
import type { ReplayTrajectoryData } from '../../../shared/types/replay.js';
import { TrackGeometryStore } from '../../../server/tracks/trackGeometryStore.js';
import { applyCanonicalProjection, enrichTrajectoryWithTrackGeometry } from '../../../server/tracks/serverTrackSync.js';
import { SessionDatabase } from '../../../server/core/db.js';
import { ReplayCacheService } from '../../../server/replay/replayCacheService.js';
import { ReplayTelemetryService } from '../../../server/replay/replayTelemetryService.js';
import { ReplayTrajectoryService } from '../../../server/replay/replayTrajectoryService.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function fixture(): TrackBoundaryGeometry {
  return {
    layoutKey: 'monza_gp', circuitId: 'monza', layoutId: 'gp',
    trackVenue: 'Autodromo Nazionale Monza', trackCourse: 'Monza GP',
    schemaVersion: 2, geometryRevision: 'geometry-one', projectionRevision: 'projection-one',
    lengthM: 400, bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100, spanX: 100, spanZ: 100 },
    centerline: [[0, 0], [0, 100], [100, 100], [100, 0]],
    leftBoundary: [[-5, 0], [-5, 100]], rightBoundary: [[8, 0], [8, 100]],
    surfaceProfile: {
      stationM: [0, 100, 200, 300], leftWidthM: [5, 5, 5, 5], rightWidthM: [8, 8, 8, 8],
      elevationM: [20, 20, 20, 20], gradePct: [2, 2, 2, 2], bankDeg: [3, 3, 3, 3],
      leftElevationM: [20.3, 20.3, 20.3, 20.3], rightElevationM: [19.7, 19.7, 19.7, 19.7],
      leftKerbWidthM: [1, 1, 1, 1], rightKerbWidthM: [0, 0, 0, 0],
      leftKerbHeightM: [0.05, 0.05, 0.05, 0.05], rightKerbHeightM: [null, null, null, null],
      leftKerbType: ['flat', 'flat', 'sawtooth', 'sawtooth'], rightKerbType: [null, null, null, null],
    },
  };
}

function storeFor(geometry = fixture()) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-geometry-'));
  directories.push(directory);
  const filename = path.join(directory, 'monza_gp.json');
  fs.writeFileSync(filename, JSON.stringify(geometry));
  return { filename, store: new TrackGeometryStore(directory) };
}

function archivedLap(): ReplayTrajectoryData {
  return {
    replayName: 'Deleted_Source.Vcr', pointsCount: 3, currentLap: 1,
    bounds: { minX: 0, maxX: 2, minZ: 0, maxZ: 90, spanX: 2, spanZ: 90 },
    stationSource: 'track', geometryRevision: 'old-geometry', projectionRevision: 'old-projection',
    lineCutProjectionRevision: 'old-projection', lineCut: { start: 'line', end: 'line' },
    sectors: { s1Frame: 1, s2Frame: 2 },
    laps: [{ lapNumber: 1, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 }],
    points: [0, 50, 90].map((z, i) => ({
      x: 2, y: 22, z, timeSec: 100 + i * 45, stationM: i * 100, speedKmh: 200,
      tireTemps: [71, 72, 73, 74], tirePressures: [151, 152, 153, 154],
      brakeTemps: [301, 302, 303, 304], rideHeight: [0.1, 0.2, 0.3, 0.4],
    })),
  };
}

describe('geometry revision migration', () => {
  it('serves an archived cached replay through the normal service without its original file', async () => {
    const { filename } = storeFor();
    const directory = path.dirname(filename);
    const lap = archivedLap();
    lap.driverSlot = 0;
    const sourcePath = path.join(directory, lap.replayName);
    const db = new SessionDatabase(':memory:');
    try {
      db.upsertReplayMetadataCache(lap.replayName, sourcePath, 1, 100, {
        filename: lap.replayName, filePath: sourcePath, fileSizeBytes: 100, mtimeMs: 1,
        trackVenue: 'Autodromo Nazionale Monza', trackCourse: 'Monza GP',
        timeSliceCount: 3, totalEvents: 0, durationSec: 90,
        drivers: [{ slot: 0, name: 'Archived Driver' }],
      });
      db.upsertReplayTrajectoryCache(lap.replayName, 0, 1, 1, 100, lap, sourcePath);
      const retained = db.getStoredReplayTrajectory(lap.replayName, 0, 1);
      const service = new ReplayTrajectoryService(directory, new ReplayCacheService(db),
        { configuredPlayerName: 'Archived Driver' }, () => [], new ReplayTelemetryService(db));
      const served = await service.getTrajectory({ replayName: lap.replayName, driverSlot: 0,
        lapNumber: 1, maxPoints: 0, allowDuckDb: false });
      expect(fs.existsSync(sourcePath)).toBe(false);
      expect(served.points.map(point => [point.x, point.y, point.z, point.timeSec, point.tireTemps, point.brakeTemps]))
        .toEqual(lap.points.map(point => [point.x, point.y, point.z, point.timeSec, point.tireTemps, point.brakeTemps]));
      expect(served.lineCut).toEqual(lap.lineCut);
      expect(served.stationSource).toBe('track');
      expect(served.geometryRevision).toEqual(expect.any(String));
      expect(served.projectionRevision).toEqual(expect.any(String));
      expect(served.geometryRevision).not.toBe(lap.geometryRevision);
      expect(served.projectionRevision).not.toBe(lap.projectionRevision);
      expect(served.laps).toEqual(lap.laps);
      expect(db.getStoredReplayTrajectory(lap.replayName, 0, 1)).toEqual(retained);
    } finally {
      db.close();
    }
  });

  it('reprojects retained samples without recutting a deleted-source lap or changing facts/channels', () => {
    const { store } = storeFor();
    const definition = store.get('monza_gp');
    expect(definition).not.toBeNull();
    const lap = archivedLap();
    const retained = structuredClone(lap);
    applyCanonicalProjection(lap, definition!);
    expect(lap.geometryRevision).toBe('geometry-one');
    expect(lap.projectionRevision).toBe('projection-one');
    expect(lap.lineCutProjectionRevision).toBe('old-projection');
    expect(lap.lineCut).toEqual(retained.lineCut);
    expect(lap.laps).toEqual(retained.laps);
    expect(lap.sectors).toEqual(retained.sectors);
    expect(lap.points.map(({ x, y, z, timeSec, tireTemps, tirePressures, brakeTemps, rideHeight }) =>
      ({ x, y, z, timeSec, tireTemps, tirePressures, brakeTemps, rideHeight })))
      .toEqual(retained.points.map(({ x, y, z, timeSec, tireTemps, tirePressures, brakeTemps, rideHeight }) =>
        ({ x, y, z, timeSec, tireTemps, tirePressures, brakeTemps, rideHeight })));
    expect(lap.points[1]).toMatchObject({ stationM: 50, lateralOffsetM: -2,
      leftRoadDistanceM: 7, rightRoadDistanceM: 6, roadElevationM: 20, roadGradePct: 2,
      roadBankDeg: 3, leftKerbHeightM: 0.05, rightKerbHeightM: null, leftKerbType: 'flat', rightKerbType: null });
    expect(lap.points[2].stationM).toBe(lap.trackLengthM);
  });

  it('does not invent a timing endpoint when an archived lap has no seam context', () => {
    const { store } = storeFor();
    const lap = archivedLap();
    delete lap.lineCut;
    delete lap.stationSource;
    delete lap.projectionRevision;
    const positions = lap.points.map(point => [point.x, point.y, point.z, point.timeSec]);
    applyCanonicalProjection(lap, store.get('monza_gp')!);
    expect(lap.lineCut).toEqual({ start: 'none', end: 'none' });
    expect(lap.points.map(point => [point.x, point.y, point.z, point.timeSec])).toEqual(positions);
  });

  it('retains station continuity when an uncut archived slice extends beyond the line', () => {
    const { store } = storeFor();
    const lap = archivedLap();
    lap.lineCut = { start: 'none', end: 'none' };
    lap.points = [[0, 0], [0, 100], [100, 100], [100, 0], [10, 0], [0, 0], [0, 2]]
      .map(([x, z], i) => ({ x, y: 0, z, timeSec: 100 + i }));
    const positions = structuredClone(lap.points);
    applyCanonicalProjection(lap, store.get('monza_gp')!);
    expect(lap.lineCut).toEqual({ start: 'none', end: 'none' });
    expect(lap.points.map(point => [point.x, point.z, point.timeSec]))
      .toEqual(positions.map(point => [point.x, point.z, point.timeSec]));
    expect(lap.points.map(point => point.stationM)).toEqual([0, 100, 200, 300, 390, 400, 400]);
  });

  it('revalidates replacements, preserves profiles, and recovers after missing or invalid files', () => {
    const { store, filename } = storeFor();
    const old = store.get('monza_gp');
    expect(store.get('monza_gp')).toBe(old);
    const next = fixture();
    next.geometryRevision = 'geometry-two';
    next.surfaceProfile!.elevationM = [30, 30, 30, 30];
    fs.writeFileSync(`${filename}.next`, JSON.stringify(next));
    fs.renameSync(`${filename}.next`, filename);
    expect(store.get('monza_gp')?.geometryRevision).toBe('geometry-two');
    expect(store.get('monza_gp')?.projectionRevision).toBe('projection-one');
    expect(store.get('monza_gp')?.surfaceProfile?.elevationM).toEqual([30, 30, 30, 30]);
    fs.unlinkSync(filename);
    expect(store.get('monza_gp')).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fs.writeFileSync(filename, JSON.stringify({ ...next, layoutKey: 'monza_curva_grande' }));
    expect(store.get('monza_gp')).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    fs.writeFileSync(filename, JSON.stringify(next));
    expect(store.get('monza_gp')?.geometryRevision).toBe('geometry-two');
  });

  it('reports null for unavailable physical measurements and keeps cache objects isolated', () => {
    const geometry = fixture();
    for (const key of ['leftWidthM', 'rightWidthM', 'elevationM', 'gradePct', 'bankDeg', 'leftKerbHeightM'] as const) {
      geometry.surfaceProfile![key] = [null, null, null, null];
    }
    const { store } = storeFor(geometry);
    const lap = archivedLap();
    applyCanonicalProjection(lap, store.get('monza_gp')!);
    expect(lap.points[1]).toMatchObject({ leftRoadDistanceM: null, rightRoadDistanceM: null,
      roadElevationM: null, roadGradePct: null, roadBankDeg: null, leftKerbHeightM: null });
    const input = archivedLap();
    const snapshot = structuredClone(input);
    const response = enrichTrajectoryWithTrackGeometry(input, 'Autodromo Nazionale Monza', 'Monza GP');
    expect(input).toEqual(snapshot);
    response.points[0].tireTemps![0] = 99;
    expect(input.points[0].tireTemps![0]).toBe(71);
  });

  it('removes stale physical measurements when a legacy geometry has no profile', () => {
    const geometry = fixture();
    delete geometry.surfaceProfile;
    const { store } = storeFor(geometry);
    const lap = archivedLap();
    Object.assign(lap.points[1], { leftRoadDistanceM: 9, rightRoadDistanceM: 9,
      roadElevationM: 30, roadGradePct: 10, roadBankDeg: 10, leftKerbHeightM: 0.2,
      rightKerbHeightM: 0.2, leftKerbWidthM: 1, rightKerbWidthM: 1, leftKerbType: 'flat', rightKerbType: 'other' });
    applyCanonicalProjection(lap, store.get('monza_gp')!);
    for (const key of ['leftRoadDistanceM', 'rightRoadDistanceM', 'roadElevationM', 'roadGradePct',
      'roadBankDeg', 'leftKerbHeightM', 'rightKerbHeightM', 'leftKerbWidthM', 'rightKerbWidthM',
      'leftKerbType', 'rightKerbType'] as const) {
      expect(lap.points[1][key]).toBeUndefined();
    }
  });
});
