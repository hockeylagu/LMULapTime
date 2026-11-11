import { zstdCompressSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { syntheticTrack } from '../syntheticTrack.js';
import { catalogSky, TEST_HAZE_WEIGHTS, testCamera, testShading, testSky } from './sceneryProfiles.js';
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

export interface ChunkRow {
  id: string; kind: string; bounds: { min: number[]; max: number[] }; asset: string; sha256: string; byteLength: number;
  triangles: number; vertices: number; drawCalls: number; shadowDrawCalls: number; shadowTriangles: number; geometryBytes: number; meshes: number; materials: number; textures: string[];
  lapStartM?: number; lapEndM?: number; prev?: string | null; next?: string | null;
}

/**
 * A schema-4 package on disk: one track with map surfaces and a brake marker, one vehicle record with its textured car body, and scenery
 * with a horizon and two main sectors. Every row, descriptor and the manifest is a plain object a test may change before `commit()` writes them.
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
  // Map surfaces and brake markers are outside geometryRevision, so adding them keeps the synthetic revisions valid.
  const track: TrackBoundaryGeometry = { ...geometry, surfaces: { road: [], kerb: [], runoff: [], pit: [], otherRoad: [] },
    brakeMarkers: [{ id: 'brake-150', center: [10, 20], label: '150', stationM: 100, side: 'left' }] };
  write('tracks/monza_gp.json', track);
  write('tracks/index.json', [{ layoutKey: 'monza_gp', circuitId: 'monza', layoutId: 'gp', trackVenue: 'Synthetic venue', trackCourse: 'Synthetic layout', hasElevation: true, hasPitLane: false }]);

  const sceneryTexture = store('scenery/textures', 'ktx2.zst', zstdCompressSync(ktx2('scenery texture')));
  const chunk = (id: string, marker: string, extra: Partial<ChunkRow>): ChunkRow => ({
    id, kind: 'main', ...extra, bounds: { min: [-10, 0, -10], max: [10, 5, 10] }, ...store('scenery', 'glb', glb(marker)),
    triangles: 10, vertices: 30, drawCalls: 2, shadowDrawCalls: 1, shadowTriangles: 4, geometryBytes: 100, meshes: 2, materials: 1, textures: [sceneryTexture.asset],
  });
  const sceneryShared = {
    chunking: { sectorLengthM: 1000, minSectorLengthM: 100, maxSectorTriangles: 400000, horizonDistanceM: 2000, skylineHeightM: 30, skylineMinDistanceM: 500, terrainScaleExtentM: 50, pitBandM: 100 },
    streaming: { residentBehindM: 300, residentAheadM: 1500, freeCameraRadiusM: 1500 },
    camera: testCamera(),
    shading: testShading(),
    sky: catalogSky(testSky(), ['monza_gp']),
  };
  const scenery = {
    layoutKey: 'monza_gp', sourceGeometryRevision: geometry.geometryRevision, routeLengthM: L, pitLaneLengthM: 0, shadowRangeM: 750, environmentProbe: { position: [10, 2, -20] },
    daylight: { date: '2023-09-10', sessions: [{ id: 'race', localTime: '11:00', sunElevationDeg: 51.88 }, { id: 'qualify', localTime: '15:00', sunElevationDeg: 46.1 }, { id: 'practice1', localTime: '11:00', sunElevationDeg: 51.88 }, { id: 'practice2', localTime: '15:30', sunElevationDeg: 40.89 }], airPollution: 0.5, hazeBaseScale: 0.55, ...TEST_HAZE_WEIGHTS, latitudeDeg: 35.37, longitudeDeg: 138.93, utcOffsetHours: 9 },
    horizon: chunk('horizon', 'horizon', { kind: 'horizon' }),
    sectors: [
      chunk('s0', 'sector 0', { kind: 'main', lapStartM: 0, lapEndM: L / 2, prev: 's1', next: 's1' }),
      chunk('s1', 'sector 1', { kind: 'main', lapStartM: L / 2, lapEndM: L, prev: 's0', next: 's0' }),
    ],
    textures: [{ ...sceneryTexture, width: 16, height: 16, levels: 5, format: 'BC7', srgb: true, gpuBytes: 340 }],
    totals: { triangles: 30, vertices: 90, drawCalls: 6, glbBytes: 100, geometryBytes: 300, textureBytes: 20, textureGpuBytes: 340 },
  };

  const carTexture = store('vehicles/textures', 'ktx2.zst', zstdCompressSync(ktx2('car texture')));
  const texturePath = carTexture.asset.replace(/^vehicles\//, '');
  const descriptor: Record<string, unknown> = {
    vehicleFolder: 'Test_Car', aliases: ['TEST_CAR'],
    wheelPivots: { fl: [0.8, 0.33, -1.4], fr: [-0.8, 0.33, -1.4], rl: [0.8, 0.33, 1.4], rr: [-0.8, 0.33, 1.4] },
    optionNodes: ['option_NumplateA', 'option_NumplateB'],
    wheelRig: { passed: true, rigs: 4, maxRestVertexErrorM: 0 },
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
    appearances: [{ alias: 'TEST_CAR', albedo: texturePath, paint: testCarPaint(texturePath), optionNodes: ['option_NumplateA'] }],
    materials: [{ id: 'm1', name: 'body', paint: true }],
    cameras: { list: [
      { name: 'cockpit', position: [0.3, 0.95, 0.3], orientation: [-0.02, 0, 0], fov: [89, 49], clipPlanes: [0.13, 700], cockpitView: 'in' },
      { name: 'hood', position: [0.3, 0.92, -0.96], orientation: [-0.02, 0, 0], fov: [89, 49], clipPlanes: [0.5, 800], cockpitView: 'out' },
      { name: 'roof', position: [0.3, 1.5, 0.2], orientation: [-0.1, 0, 0], fov: [60, 45], clipPlanes: [0.02, 550], cockpitView: 'out' },
    ] },
  };
  /** The car body as every record lists it; `vehicleIds` is replaced by each record's own part. */
  const car = {
    folder: 'Test_Car', vehicleIds: ['TEST_CAR'], descriptor: 'vehicles/bodies/Test_Car.json', descriptorSha256: '',
    ...store('vehicles', 'glb', glb('car')), triangles: 100, vertices: 300, interior: null, textures: [carTexture],
  };
  const vehicles: VehicleSpec[] = [{ id: 'synthetic', vehicleIds: ['TEST_CAR'] }];
  const record = (spec: VehicleSpec, body: object = { ...car, vehicleIds: spec.vehicleIds }) => ({
    id: spec.id, model: 'Test Car', carClass: 'Hyper', vehicleIds: spec.vehicleIds, dimensions: { lengthM: 5, widthM: 2 },
    outlineXZ: [[-1, -2.5], [1, -2.5], [1, 2.5], [-1, 2.5]], replayOriginOffsetXZ: [0, 0], ...spec.extra, bodies: [body],
  });
  /** Replaces the vehicle records and makes the descriptor describe the union of their ids, as the body they share does. */
  const setVehicles = (specs: VehicleSpec[]) => {
    vehicles.splice(0, vehicles.length, ...specs);
    const ids = specs.flatMap(spec => spec.vehicleIds);
    descriptor.aliases = ids;
    descriptor.appearances = ids.map(alias => ({ alias, albedo: texturePath, paint: testCarPaint(texturePath), optionNodes: [] }));
  };
  const manifest: Record<string, unknown> = {
    schemaVersion: 8, id: 'synthetic', version: '1',
    tracks: { catalog: 'tracks/index.json' }, vehicles: { catalog: 'vehicles/index.json' },
    scenery: { catalog: 'scenery/index.json' },
  };
  /** Writes the manifest, catalogs and descriptor as they are now. */
  const commit = () => {
    const descriptorBytes = Buffer.from(JSON.stringify(descriptor));
    car.descriptorSha256 = sha(descriptorBytes);
    write(car.descriptor, descriptorBytes);
    write('scenery/index.json', { ...sceneryShared, layouts: [scenery] });
    write('vehicles/index.json', { vehicles: vehicles.map(spec => record(spec)) });
    write('manifest.json', manifest);
  };
  commit();
  return { dir, write, store, commit, geometry: track, manifest, scenery, sceneryShared, car, descriptor, texturePath, sceneryTexture, carTexture, vehicles, record, setVehicles };
}
