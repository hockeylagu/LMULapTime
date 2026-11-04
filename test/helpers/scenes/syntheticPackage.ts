import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { syntheticTrack } from '../syntheticTrack.js';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
/** A byte-exact GLB header (magic, version 2, total length) plus a marker: all the app checks of a GLB itself. */
export const glb = (marker: string) => {
  const body = Buffer.from(marker), out = Buffer.alloc(12 + body.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8); body.copy(out, 12);
  return out;
};
export const ktx2 = (marker: string) => Buffer.concat([Buffer.from('ab4b5458203230bb0d0a1a0a', 'hex'), Buffer.from(marker)]);

const catalog = { schemaVersion: 1, coordinates: 'local-xz-metres-forward-minus-z', vehicles: [{ id: 'synthetic', model: 'Test Car', carClass: 'Hyper', vehicleIds: ['TEST_CAR'], dimensions: { lengthM: 5, widthM: 2 }, outlineXZ: [[-1, -2.5], [1, -2.5], [1, 2.5], [-1, 2.5]], replayOriginOffsetXZ: [0, 0] }] };

export interface ChunkRow {
  id: string; kind: string; bounds: { min: number[]; max: number[] }; asset: string; sha256: string; byteLength: number;
  triangles: number; vertices: number; drawCalls: number; geometryBytes: number; meshes: number; materials: number; textures: string[];
  lapStartM?: number; lapEndM?: number; prev?: string | null; next?: string | null;
}

/**
 * A schema-3 package on disk: one track, one vehicle, scenery with a horizon and two main sectors, and one textured car.
 * Every row, descriptor and the manifest is a plain object a test may change before `commit()` writes them.
 */
export function syntheticPackage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-plugin-'));
  const write = (file: string, value: Buffer | object) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), Buffer.isBuffer(value) ? value : JSON.stringify(value));
  };
  /** Stores bytes under their content name and returns the row fields every catalog entry carries. */
  const store = (folder: string, extension: string, bytes: Buffer) => {
    const hash = sha(bytes), asset = `${folder}/${hash}.${extension}`;
    write(asset, bytes);
    return { asset, sha256: hash, byteLength: bytes.length };
  };
  const geometry = syntheticTrack(), L = geometry.lengthM;
  write('tracks/monza_gp.json', geometry);
  write('tracks/index.json', [{ layoutKey: 'monza_gp', circuitId: 'monza', layoutId: 'gp', lengthM: L, pointsCount: geometry.centerline.length }]);
  write('tracks-display/monza_gp.json', { layoutKey: 'monza_gp', sourceRevision: geometry.geometryRevision, surfaces: { road: [], kerb: [], runoff: [], pit: [], otherRoad: [] } });
  write('vehicles/index.json', catalog);

  const sceneryTexture = store('scenery/textures', 'ktx2', ktx2('scenery texture'));
  const chunk = (id: string, marker: string, extra: Partial<ChunkRow>): ChunkRow => ({
    id, kind: 'main', ...extra, bounds: { min: [-10, 0, -10], max: [10, 5, 10] }, ...store('scenery', 'glb', glb(marker)),
    triangles: 10, vertices: 30, drawCalls: 2, geometryBytes: 100, meshes: 2, materials: 1, textures: [sceneryTexture.asset],
  });
  const scenery = {
    schemaVersion: 2, layoutKey: 'monza_gp', sourceGeometryRevision: geometry.geometryRevision, routeLengthM: L, pitLaneLengthM: 0,
    chunking: { sectorLengthM: 1000, minSectorLengthM: 100, maxSectorTriangles: 400000, horizonDistanceM: 2000, skylineHeightM: 30, skylineMinDistanceM: 500, terrainScaleExtentM: 50, pitBandM: 100 },
    streaming: { residentBehindM: 300, residentAheadM: 1500, freeCameraRadiusM: 1500 },
    daylight: { date: '2023-09-10', sessions: [{ id: 'race', localTime: '11:00', sunElevationDeg: 51.88 }, { id: 'qualify', localTime: '15:00', sunElevationDeg: 46.1 }, { id: 'practice1', localTime: '11:00', sunElevationDeg: 51.88 }, { id: 'practice2', localTime: '15:30', sunElevationDeg: 40.89 }], airPollution: 0.5, hazeBaseScale: 0.55 },
    horizon: chunk('horizon', 'horizon', { kind: 'horizon' }),
    sectors: [
      chunk('s0', 'sector 0', { kind: 'main', lapStartM: 0, lapEndM: L / 2, prev: 's1', next: 's1' }),
      chunk('s1', 'sector 1', { kind: 'main', lapStartM: L / 2, lapEndM: L, prev: 's0', next: 's0' }),
    ],
    textures: [{ ...sceneryTexture, width: 16, height: 16, levels: 5, format: 'BC7', srgb: true, gpuBytes: 340 }],
    totals: { triangles: 30, vertices: 90, drawCalls: 6, glbBytes: 100, geometryBytes: 300, textureBytes: 20, textureGpuBytes: 340 },
  };

  const carTexture = store('cars/textures', 'ktx2', ktx2('car texture'));
  const texturePath = carTexture.asset.replace(/^cars\//, '');
  const descriptor: Record<string, unknown> = {
    schemaVersion: 1, vehicleFolder: 'Test_Car', aliases: ['TEST_CAR'],
    wheelPivots: { fl: [0.8, 0.33, -1.4], fr: [-0.8, 0.33, -1.4], rl: [0.8, 0.33, 1.4], rr: [-0.8, 0.33, 1.4] },
    wheelRig: { passed: true, rigs: 4, maxRestVertexErrorM: 0 },
    appearances: [{ alias: 'TEST_CAR', albedo: texturePath, paint: { kind: 'carPaint', maps: {} } }],
    materials: [{ id: 'm1', name: 'body', paint: true }],
    cameras: [],
  };
  const car = {
    schemaVersion: 1, vehicleFolder: 'Test_Car', vehicleIds: ['TEST_CAR'], descriptor: 'cars/Test_Car.json', descriptorSha256: '',
    ...store('cars', 'glb', glb('car')), triangles: 100, vertices: 300, textures: [carTexture],
  };
  const manifest: Record<string, unknown> = {
    schemaVersion: 3, id: 'synthetic', version: '1',
    tracks: { catalog: 'tracks/index.json' }, vehicles: { catalog: 'vehicles/index.json' },
    scenery: { catalog: 'scenery/index.json' }, cars: { catalog: 'cars/index.json' },
  };
  /** Writes the manifest, catalogs and descriptor as they are now. */
  const commit = () => {
    const descriptorBytes = Buffer.from(JSON.stringify(descriptor));
    car.descriptorSha256 = sha(descriptorBytes);
    write(car.descriptor, descriptorBytes);
    write('scenery/index.json', [scenery]); write('cars/index.json', [car]); write('manifest.json', manifest);
  };
  commit();
  return { dir, write, store, commit, geometry, manifest, scenery, car, descriptor, texturePath, sceneryTexture, carTexture };
}
