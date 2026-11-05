import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DataPlugin } from '../../../server/plugins/dataPlugin.js';
import { createDataPluginRouter } from '../../../server/routes/dataPluginRoutes.js';
import { glb, syntheticPackage } from '../../helpers/scenes/syntheticPackage.js';

type Package = ReturnType<typeof syntheticPackage>;
const packages: Package[] = [];
const build = () => { const built = syntheticPackage(); packages.push(built); return built; };
afterEach(() => { for (const built of packages.splice(0)) fs.rmSync(built.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });
const state = (built: Package) => new DataPlugin(built.dir).status.state;

describe('schema 4 manifest', () => {
  it('loads scenery next to tracks, and the car bodies of the vehicle records', () => {
    const built = build(), plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.status).toMatchObject({ scenery: true, cars: true, counts: { tracks: 1, vehicles: 1, scenery: 1, cars: 1 } });
    const layout = plugin.sceneryLayout('monza_gp')!;
    expect(layout.packageRevision).toBe(plugin.status.revision);
    expect(layout.sectors.map(sector => sector.id)).toEqual(['s0', 's1']);
    expect(layout.chunking).toEqual(built.sceneryShared.chunking); expect(layout.streaming).toEqual(built.sceneryShared.streaming);
    expect(layout).not.toHaveProperty('schemaVersion');
    expect(plugin.sceneryLayout('spa_wec')).toBeNull();
    expect(plugin.car('test_car.veh')?.folder).toBe('Test_Car');
    expect(plugin.car('TEST_CAR')?.packageRevision).toBe(plugin.status.revision);
    expect(plugin.car('OTHER')).toBeNull();
  });

  it('accepts schema 4 without scenery; the cars come with the vehicles', () => {
    const built = build();
    delete built.manifest.scenery; built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.sceneryLayout('monza_gp')).toBeNull(); expect(plugin.car('TEST_CAR')).not.toBeNull();
  });

  it('has no cars without vehicles', () => {
    const built = build();
    delete built.manifest.vehicles; built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.status.cars).toBeUndefined(); expect(plugin.car('TEST_CAR')).toBeNull();
  });

  it.each([1, 2, 3, '4', undefined])('rejects manifest schema %s: only schema 4 is supported', schemaVersion => {
    const built = build();
    built.manifest.schemaVersion = schemaVersion; built.commit();
    expect(state(built)).toBe('invalid');
  });

  it.each(['cars', 'brakeBoardArtwork', 'scenes', 'vehicleMeshes', 'vehicleLiveries', 'vehicleWheels', 'trackTextures', 'unknown'])('rejects the key %s', key => {
    const built = build();
    built.manifest[key] = { catalog: 'tracks/index.json' }; built.commit();
    expect(state(built)).toBe('invalid');
  });

  it.each(['../outside.json', 'C:/outside.json', 'scenery\\index.json'])('rejects a scenery catalog path escaping the package: %s', file => {
    const built = build();
    built.manifest.scenery = { catalog: file }; built.commit();
    expect(state(built)).toBe('invalid');
  });
});

describe('scenery validation', () => {
  const mutate = (change: (built: Package) => void) => { const built = build(); change(built); built.commit(); return state(built); };

  it.each([
    ['an unknown row field', (built: Package) => { (built.scenery as Record<string, unknown>).extra = 1; }],
    ['a per-layout schema version', (built: Package) => { (built.scenery as Record<string, unknown>).schemaVersion = 2; }],
    ['per-layout chunking', (built: Package) => { (built.scenery as Record<string, unknown>).chunking = built.sceneryShared.chunking; }],
    ['per-layout streaming', (built: Package) => { (built.scenery as Record<string, unknown>).streaming = built.sceneryShared.streaming; }],
    ['non-positive shared chunking', (built: Package) => { built.sceneryShared.chunking.sectorLengthM = 0; }],
    ['missing shared streaming', (built: Package) => { delete (built.sceneryShared as Partial<typeof built.sceneryShared>).streaming; }],
    ['a stale geometry revision', (built: Package) => { built.scenery.sourceGeometryRevision = 'old'; }],
    ['a chunk asset that is not content-named', (built: Package) => { built.scenery.sectors[0].asset = 'scenery/s0.glb'; }],
    ['a chunk of the wrong size', (built: Package) => { built.scenery.sectors[0].byteLength += 1; }],
    ['a missing chunk file', (built: Package) => { fs.rmSync(path.join(built.dir, built.scenery.sectors[1].asset)); }],
    ['sectors out of lap order', (built: Package) => { built.scenery.sectors.reverse(); }],
    ['broken prev/next links', (built: Package) => { built.scenery.sectors[0].next = 's0'; }],
    ['a sector beyond the route', (built: Package) => { built.scenery.sectors[1].lapEndM = built.scenery.routeLengthM + 10; }],
    ['duplicate chunk ids', (built: Package) => { built.scenery.sectors[1].id = 's0'; }],
    ['a texture missing from the layout list', (built: Package) => { built.scenery.sectors[0].textures = ['scenery/textures/' + '0'.repeat(64) + '.ktx2.zst']; }],
    ['a texture file of the wrong size', (built: Package) => { built.scenery.textures[0].byteLength += 1; }],
    ['non-finite bounds', (built: Package) => { built.scenery.horizon.bounds.min[0] = Infinity; }],
    ['a layout without track geometry', (built: Package) => { built.scenery.layoutKey = 'spa_wec'; }],
  ])('rejects %s', (_name, change) => { expect(mutate(change)).toBe('invalid'); });

  it('rejects an empty catalog', () => {
    const built = build();
    built.commit(); built.write('scenery/index.json', { ...built.sceneryShared, layouts: [] });
    expect(state(built)).toBe('invalid');
  });

  it('rejects a bare array as the catalog', () => {
    const built = build();
    built.commit(); built.write('scenery/index.json', [built.scenery]);
    expect(state(built)).toBe('invalid');
  });

  it('accepts a layout without daylight', () => {
    const built = build();
    delete (built.scenery as Partial<typeof built.scenery>).daylight; built.commit();
    expect(new DataPlugin(built.dir).sceneryLayout('monza_gp')).not.toBeNull();
  });
});

describe('car validation', () => {
  const mutate = (change: (built: Package) => void) => { const built = build(); change(built); built.commit(); return state(built); };
  /** Replaces the catalog written by `commit()` with raw records. */
  const rewrite = (change: (built: Package, vehicle: Record<string, unknown>) => unknown[]) => {
    const built = build(); built.commit();
    built.write('vehicles/index.json', { vehicles: change(built, built.record(built.vehicles[0])) });
    return state(built);
  };

  it.each([
    ['aliases that differ from the body ids', (built: Package) => { built.descriptor.aliases = ['TEST_CAR', 'EXTRA']; }],
    ['appearances that do not cover the ids', (built: Package) => { built.descriptor.appearances = []; }],
    ['a wheel rig that did not pass', (built: Package) => { built.descriptor.wheelRig = { passed: false, rigs: 4, maxRestVertexErrorM: 0 }; }],
    ['a wheel rig with rest-vertex error', (built: Package) => { built.descriptor.wheelRig = { passed: true, rigs: 4, maxRestVertexErrorM: 0.01 }; }],
    ['a missing wheel pivot', (built: Package) => { delete (built.descriptor.wheelPivots as Record<string, unknown>).rr; }],
    ['an undeclared texture', (built: Package) => { (built.descriptor.appearances as Array<{ materialTextures?: unknown }>)[0].materialTextures = { body: 'textures/' + '1'.repeat(64) + '.ktx2.zst' }; }],
    ['a descriptor of another car', (built: Package) => { built.descriptor.vehicleFolder = 'Other'; }],
    ['a descriptor schema version', (built: Package) => { built.descriptor.schemaVersion = 1; }],
    ['an unknown descriptor field', (built: Package) => { built.descriptor.extra = true; }],
    ['cameras without the driver camera', (built: Package) => { built.descriptor.cameras = { list: (built.descriptor.cameras as { list: Array<{ name: string }> }).list.filter(camera => camera.name !== 'COCKPIT') }; }],
    ['a camera with an inverted clip range', (built: Package) => { (built.descriptor.cameras as { list: Array<{ clipPlanes: number[] }> }).list[0].clipPlanes = [5, 1]; }],
    ['a non-boolean paint flag',(built: Package) => { (built.descriptor.materials as Array<{ paint: unknown }>)[0].paint = 'yes'; }],
    ['an asset that is not content-named', (built: Package) => { built.car.asset = 'vehicles/Test_Car.glb'; }],
    ['a descriptor outside vehicles/bodies', (built: Package) => { built.car.descriptor = 'cars/Test_Car.json'; }],
    ['a car texture of the wrong size', (built: Package) => { built.car.textures[0].byteLength += 1; }],
  ])('rejects %s', (_name, change) => { expect(mutate(change)).toBe('invalid'); });

  it.each([
    ['a body serving ids outside its record', (_built: Package, vehicle: Record<string, unknown>) => [{ ...vehicle, bodies: [{ ...(vehicle.bodies as object[])[0], vehicleIds: ['OTHER_CAR'] }] }]],
    ['a body missing some ids of its record', (built: Package, vehicle: Record<string, unknown>) => [{ ...vehicle, vehicleIds: ['TEST_CAR', 'TEST_TWO'], bodies: [{ ...built.car, vehicleIds: ['TEST_CAR'] }] }]],
    ['a record without bodies', (_built: Package, vehicle: Record<string, unknown>) => [{ ...vehicle, bodies: [] }]],
    ['an id in two bodies of one record', (built: Package, vehicle: Record<string, unknown>) => [{ ...vehicle, bodies: [built.car, { ...built.car, folder: 'Other', descriptor: 'vehicles/bodies/Other.json' }] }]],
    ['a body field of the old cars catalog', (_built: Package, vehicle: Record<string, unknown>) => [{ ...vehicle, bodies: [{ ...(vehicle.bodies as object[])[0], schemaVersion: 1 }] }]],
    ['a record without the bodies field', (_built: Package, vehicle: Record<string, unknown>) => { const { bodies: _bodies, ...bare } = vehicle; return [bare]; }],
  ])('rejects %s', (_name, change) => { expect(rewrite(change)).toBe('invalid'); });

  it('loads a body shared by two records once, with the union of their ids', () => {
    const built = build();
    built.setVehicles([{ id: 'base', vehicleIds: ['TEST_CAR'] }, { id: 'evo', vehicleIds: ['TEST_CAR_EVO'] }]); built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.status.counts).toMatchObject({ vehicles: 2, cars: 1 });
    expect(plugin.car('TEST_CAR_EVO')).toMatchObject({ folder: 'Test_Car', vehicleIds: ['TEST_CAR', 'TEST_CAR_EVO'] });
    expect(plugin.car('test_car.veh')?.sha256).toBe(plugin.car('TEST_CAR_EVO')?.sha256);
  });

  it('rejects a shared body whose two listings point at different files', () => {
    const built = build();
    built.setVehicles([{ id: 'base', vehicleIds: ['TEST_CAR'] }, { id: 'evo', vehicleIds: ['TEST_CAR_EVO'] }]); built.commit();
    const [first, second] = built.vehicles.map(spec => built.record(spec));
    built.write('vehicles/index.json', { vehicles: [first, { ...second, bodies: [{ ...second.bodies[0], triangles: 1 }] }] });
    expect(state(built)).toBe('invalid');
  });

  it('loads a further geometry of a car folder, named <folder>.<hash>, from its installed folder descriptor', () => {
    const built = build();
    built.car.folder = 'Test_Car.0a1b2c3d'; built.car.descriptor = 'vehicles/bodies/Test_Car.0a1b2c3d.json'; built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.car('TEST_CAR')?.folder).toBe('Test_Car.0a1b2c3d');
  });
});

describe('scenery and car routes', () => {
  it('serves layouts, car resources and package files as is, uncached', async () => {
    const built = build(), app = express();
    app.use('/api/data-plugin', createDataPluginRouter(new DataPlugin(built.dir)));
    const layout = await request(app).get('/api/data-plugin/scenery/monza_gp');
    expect(layout.status).toBe(200); expect(layout.body).toHaveProperty('horizon.id', 'horizon'); expect(layout.body).toHaveProperty('packageRevision');
    expect((await request(app).get('/api/data-plugin/scenery/spa_wec')).status).toBe(404);

    const chunk = await request(app).get('/api/data-plugin/scenery/files/' + path.basename(built.scenery.sectors[0].asset)).buffer().parse((res, done) => { const parts: Buffer[] = []; res.on('data', (part: Buffer) => parts.push(part)); res.on('end', () => done(null, Buffer.concat(parts))); });
    expect(chunk.status).toBe(200); expect(chunk.headers['content-type']).toContain('model/gltf-binary');
    expect(chunk.headers['cache-control']).toBe('no-store');
    expect(chunk.body).toEqual(glb('sector 0'));
    const texture = await request(app).get('/api/data-plugin/scenery/files/textures/' + path.basename(built.sceneryTexture.asset));
    expect(texture.status).toBe(200); expect(texture.headers['content-type']).toContain('image/ktx2'); expect(texture.headers['content-encoding']).toBe('zstd');
    expect((await request(app).get('/api/data-plugin/scenery/files/' + '0'.repeat(64) + '.glb')).status).toBe(404);
    expect((await request(app).get('/api/data-plugin/scenery/files/..%2Fmanifest.json')).status).toBe(404);

    const car = await request(app).get('/api/data-plugin/cars/test_car.veh');
    expect(car.status).toBe(200); expect(car.body).toMatchObject({ folder: 'Test_Car', vehicleIds: ['TEST_CAR'], sha256: built.car.sha256 });
    expect((await request(app).get('/api/data-plugin/cars/unknown')).status).toBe(404);
    expect((await request(app).get('/api/data-plugin/cars/files/bodies/Test_Car.json')).body).toHaveProperty('vehicleFolder', 'Test_Car');
    expect((await request(app).get('/api/data-plugin/cars/files/Test_Car.json')).status).toBe(404);
    expect((await request(app).get('/api/data-plugin/cars/files/' + path.basename(built.car.asset))).headers['content-type']).toContain('model/gltf-binary');
    expect((await request(app).get('/api/data-plugin/cars/files/textures/' + path.basename(built.carTexture.asset))).status).toBe(200);
    expect((await request(app).get('/api/data-plugin/cars/files/textures/' + '0'.repeat(64) + '.ktx2.zst')).status).toBe(404);
  });
});
