import { zstdCompressSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { syntheticTrack } from '../syntheticTrack.js';
import { catalogSky, packageClouds, packageShadows, TEST_HAZE_WEIGHTS, testCamera, testShading, testSky } from './sceneryProfiles.js';
import { bodyDescriptorPath, bodyGlbPath, bodyTexturePath, descriptorTexturePath, PACKAGE_SCHEMA, renderingBinPath, sceneryChunkPath, sceneryTexturePath, TRACK_LAYOUT_KEYS } from '../../../shared/packageContract/index.js';
import type { TrackBoundaryGeometry } from '../../../shared/types/trackGeometry.js';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** A complete car paint (descriptor version 4) over `albedo`: every value the app reads. */
export function testCarPaint(albedo: string) {
  const region = { baseCoatRoughness: 0.4, baseCoatRefractiveIndex: 1.6, baseCoatSpecStrength: 1, clearCoatRoughness: 0, clearCoatRefractiveIndex: 1.5,
    clearCoatSpecStrength: 1, lacquerColour: [1, 1, 1], metallicPaintStrength: 0, carbonFibreStrength: 0 };
  return { version: 4 as const, kind: 'carPaint', normalShadowInfluence: 0.5, maps: { albedo: { texture: albedo, uv: 'uv0' as const, scale: [1, 1] as [number, number] } }, parameters: {
    regions: { black: { ...region }, red: { ...region }, green: { ...region }, blue: { ...region }, white: { ...region } },
    uvScale: { carbonFibre: [1, 1], metallicFlakes: [1, 1], orangePeel: [1, 1] }, clearCoatStrength: 1, lacquerThickness: 0.1,
    carbonFibreAlbedoColour: [0.11, 0.11, 0.11], metallicFlakeColour: [1, 1, 1] } };
}
/** A byte-exact GLB header (magic, version 2, total length) plus a marker: all the app checks of a GLB itself. */
export const glb = (marker: string) => {
  const body = Buffer.from(marker), out = Buffer.alloc(12 + body.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8); body.copy(out, 12);
  return out;
};
export const ktx2 = (marker: string) => Buffer.concat([Buffer.from('ab4b5458203230bb0d0a1a0a', 'hex'), Buffer.from(marker)]);

/** A vehicle record of the package: `vehicleIds` are the ids of the record, all served by the package's one car body. */
export interface VehicleSpec { id: string; vehicleIds: string[]; extra?: Record<string, unknown> }

/** A compact chunk row of `scenery/index.json`: no `asset` (derived from `sha256`), `textures` are indices into its layout row's texture list. */
export interface ChunkRow {
  id: string; kind: string; bounds: { min: number[]; max: number[] }; sha256: string; byteLength: number;
  triangles: number; vertices: number; drawCalls: number; shadowDrawCalls: number; shadowTriangles: number; geometryBytes: number; meshes: number; materials: number; textures: number[];
  lapStartM?: number; lapEndM?: number;
}

/**
 * A schema 9 package on disk: one track with map surfaces and a brake marker, one vehicle record with its textured car body, logos, the rendering profiles
 * with their cloud map files and scenery with a horizon and two main sectors. Every row, descriptor and the manifest is a plain object a test may change
 * before `commit()` writes them.
 */
export function syntheticPackage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-plugin-'));
  const write = (file: string, value: Buffer | object) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), Buffer.isBuffer(value) ? value : JSON.stringify(value));
  };
  /** Stores bytes under the content name `pathOf` derives from their hash; returns the package path as `asset` with the row fields. */
  const store = (pathOf: (hash: string) => string, bytes: Buffer) => {
    const hash = sha(bytes), asset = pathOf(hash);
    write(asset, bytes);
    return { asset, sha256: hash, byteLength: bytes.length };
  };
  /** A catalog row without the path: schema 9 rows state none. */
  const rowOf = <T extends { asset: string }>({ asset: _asset, ...row }: T): Omit<T, 'asset'> => row;
  const geometry = syntheticTrack(), L = geometry.lengthM;
  // Map surfaces and brake markers are outside geometryRevision, so adding them keeps the synthetic revisions valid. The file's keys are in the package's order.
  const full: Record<string, unknown> = { ...geometry, surfaces: { road: [], kerb: [], runoff: [], pit: [], otherRoad: [] },
    brakeMarkers: [{ id: 'brake-150', center: [10, 20], label: '150', stationM: 100, side: 'left' }] };
  const track = Object.fromEntries(TRACK_LAYOUT_KEYS.filter(key => full[key] !== undefined).map(key => [key, full[key]])) as unknown as TrackBoundaryGeometry;
  write('tracks/monza_gp.json', track);
  write('tracks/index.json', [{ layoutKey: 'monza_gp', circuitId: 'monza', layoutId: 'gp', trackVenue: 'Synthetic venue', trackCourse: 'Synthetic layout', hasElevation: true, hasPitLane: false }]);

  const sceneryTexture = store(sceneryTexturePath, zstdCompressSync(ktx2('scenery texture')));
  const chunk = (id: string, marker: string, extra: Partial<ChunkRow>): ChunkRow => ({
    id, kind: 'main', ...extra, bounds: { min: [-10, 0, -10], max: [10, 5, 10] }, ...rowOf(store(sceneryChunkPath, glb(marker))),
    triangles: 10, vertices: 30, drawCalls: 2, shadowDrawCalls: 1, shadowTriangles: 4, geometryBytes: 100, meshes: 2, materials: 1, textures: [0],
  });
  /** The catalog's shared parameters and its texture table: one entry per distinct texture file. */
  const sceneryShared = {
    chunking: { sectorLengthM: 1000, minSectorLengthM: 100, maxSectorTriangles: 400000, horizonDistanceM: 2000, skylineHeightM: 30, skylineMinDistanceM: 500, terrainScaleExtentM: 50, pitBandM: 100 },
    streaming: { residentBehindM: 300, residentAheadM: 1500, freeCameraRadiusM: 1500 },
    textures: [{ ...rowOf(sceneryTexture), width: 16, height: 16, levels: 5, format: 'BC7', srgb: true, gpuBytes: 340 }] as Array<Record<string, unknown>>,
  };
  /** The layout row as the compact catalog states it. */
  const scenery = {
    layoutKey: 'monza_gp', sourceGeometryRevision: geometry.geometryRevision, routeLengthM: L, pitLaneLengthM: 0, shadowRangeM: 750, environmentProbe: { position: [10, 2, -20] },
    daylight: { date: '2023-09-10', sessions: [{ id: 'race', localTime: '11:00', sunElevationDeg: 51.88 }, { id: 'qualify', localTime: '15:00', sunElevationDeg: 46.1 }, { id: 'practice1', localTime: '11:00', sunElevationDeg: 51.88 }, { id: 'practice2', localTime: '15:30', sunElevationDeg: 40.89 }], airPollution: 0.5, hazeBaseScale: 0.55, ...TEST_HAZE_WEIGHTS, latitudeDeg: 35.37, longitudeDeg: 138.93, utcOffsetHours: 9 },
    horizon: chunk('horizon', 'horizon', { kind: 'horizon' }),
    sectors: [
      chunk('s0', 'sector 0', { kind: 'main', lapStartM: 0, lapEndM: L / 2 }),
      chunk('s1', 'sector 1', { kind: 'main', lapStartM: L / 2, lapEndM: L }),
    ],
    textures: [{ texture: 0 }] as Array<Record<string, unknown>>,
    // One material over the three chunks: 2 draw calls, 30 vertices and 10 triangles each.
    materials: [{ key: '0123456789abcdef', vertices: 90, indices: 90, primitives: 6, draws: 6 }] as Array<Record<string, unknown>>,
  };

  /** The rendering profiles as `rendering/index.json` states them: the sky per layout, the cloud maps as files. */
  const cloudMaps = packageClouds(testSky().clouds);
  for (const [hash, bytes] of cloudMaps.files) write(renderingBinPath(hash), bytes);
  const rendering = { camera: testCamera(), sky: { ...catalogSky(testSky(), ['monza_gp']), clouds: cloudMaps.clouds }, shading: { ...testShading(), shadows: packageShadows() } };

  const carTexture = store(bodyTexturePath, zstdCompressSync(ktx2('car texture')));
  const texturePath = descriptorTexturePath(carTexture.sha256);
  const descriptor: Record<string, unknown> = {
    optionNodes: ['option_NumplateA', 'option_NumplateB'],
    lamps: [{
      role: 'headlight', nodes: ['option_NumplateA'], material: 'body', frames: [texturePath], animation: { method: 'loop', rate: 1, sequence: [0] },
      emission: { scale: 500, vertexColour: false, viewBoost: { gain: 2, power: 64 }, ambientScaled: false, vertexAlpha: false }, blend: 'alpha',
      states: { off: 0, on: null, brake: null }, defaultLit: false, hiddenInOwnCockpit: true,
    }, {
      // No texture shipped for its frame: accepted, never drawn.
      role: 'brake', nodes: ['option_NumplateA'], material: 'body', frames: [null], animation: { method: null, rate: null, sequence: null },
      emission: { scale: 500, vertexColour: false, viewBoost: null, ambientScaled: false, vertexAlpha: false }, blend: 'alpha',
      states: { off: 0, on: null, brake: null }, defaultLit: false, hiddenInOwnCockpit: true,
    }],
    glowMaterialIds: [],
    appearances: [{ alias: 'TEST_CAR', number: '7', albedo: texturePath, paint: testCarPaint(texturePath), optionNodes: ['option_NumplateA'] }],
    materials: [{ id: 'm1', name: 'body', paint: true }],
    cameras: { frame: 'native car frame', cockpitViewRule: 'in: the driver camera only', list: [
      { name: 'cockpit', position: [0.3, 0.95, 0.3], orientation: [-0.02, 0, 0], fov: [89, 49], clipPlanes: [0.13, 700], cockpitView: 'in' },
      { name: 'hood', position: [0.3, 0.92, -0.96], orientation: [-0.02, 0, 0], fov: [89, 49], clipPlanes: [0.5, 800], cockpitView: 'out' },
      { name: 'roof', position: [0.3, 1.5, 0.2], orientation: [-0.1, 0, 0], fov: [60, 45], clipPlanes: [0.02, 550], cockpitView: 'out' },
    ] },
  };
  /** The car body row of the top-level `bodies` list; `vehicleIds` is every id the vehicle records give it. */
  const car = {
    folder: 'Test_Car', vehicleIds: ['TEST_CAR'], descriptorSha256: '',
    ...rowOf(store(bodyGlbPath, glb('car'))), triangles: 100, vertices: 300, interior: null as null | Record<string, unknown>, textures: [rowOf(carTexture)] as Array<Record<string, unknown>>,
  };
  const vehicles: VehicleSpec[] = [{ id: 'synthetic', vehicleIds: ['TEST_CAR'] }];
  const record = (spec: VehicleSpec) => ({
    id: spec.id, model: 'Test Car', carClass: 'Hyper', vehicleIds: spec.vehicleIds, dimensions: { lengthM: 5, widthM: 2 },
    outlineXZ: [[-1, -2.5], [1, -2.5], [1, 2.5], [-1, 2.5]], replayOriginOffsetXZ: [0, 0], ...spec.extra,
  });
  /** Replaces the vehicle records and makes the body serve, and the descriptor describe, the union of their ids. */
  const setVehicles = (specs: VehicleSpec[]) => {
    vehicles.splice(0, vehicles.length, ...specs);
    const ids = specs.flatMap(spec => spec.vehicleIds).sort();
    car.vehicleIds = ids;
    descriptor.appearances = ids.map(alias => ({ alias, number: '7', albedo: texturePath, paint: testCarPaint(texturePath), optionNodes: [] }));
  };
  const logos: { logos: Record<string, string> } = { logos: { Ferrari: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>' } };
  const manifest: Record<string, unknown> = { schemaVersion: PACKAGE_SCHEMA, id: 'synthetic', version: '1' };
  /** Writes the manifest, catalogs, descriptor and logos as they are now. */
  const commit = () => {
    const descriptorBytes = Buffer.from(JSON.stringify(descriptor));
    car.descriptorSha256 = sha(descriptorBytes);
    write(bodyDescriptorPath(car.folder), descriptorBytes);
    write('scenery/index.json', { ...sceneryShared, layouts: [scenery] });
    write('rendering/index.json', rendering);
    write('vehicles/index.json', { vehicles: vehicles.map(record), bodies: [car] });
    write('vehicles/logos.json', logos);
    write('manifest.json', manifest);
  };
  commit();
  return { dir, write, store, rowOf, commit, geometry: track, manifest, scenery, sceneryShared, rendering, cloudMaps, car, descriptor, texturePath, sceneryTexture, carTexture, vehicles, record, setVehicles, logos };
}
