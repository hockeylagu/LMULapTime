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

describe('schema 3 manifest', () => {
  it('loads scenery and cars next to tracks and vehicles', () => {
    const built = build(), plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.status).toMatchObject({ scenery: true, cars: true, counts: { tracks: 1, vehicles: 1, scenery: 1, cars: 1 } });
    const layout = plugin.sceneryLayout('monza_gp')!;
    expect(layout.packageRevision).toBe(plugin.status.revision);
    expect(layout.sectors.map(sector => sector.id)).toEqual(['s0', 's1']);
    expect(plugin.sceneryLayout('spa_wec')).toBeNull();
    expect(plugin.sceneryFile(built.scenery.horizon.asset)).toEqual(glb('horizon'));
    expect(plugin.sceneryFile(built.sceneryTexture.asset)).not.toBeNull();
    expect(plugin.sceneryFile('scenery/unlisted.glb')).toBeNull();
    expect(plugin.car('test_car.veh')?.vehicleFolder).toBe('Test_Car');
    expect(plugin.car('TEST_CAR')?.packageRevision).toBe(plugin.status.revision);
    expect(plugin.car('OTHER')).toBeNull();
    expect(JSON.parse(plugin.carFile('cars/Test_Car.json')!.toString())).toHaveProperty('wheelRig.passed', true);
    expect(plugin.carFile(built.car.asset)).toEqual(glb('car'));
  });

  it('accepts schema 3 without scenery and cars', () => {
    const built = build();
    delete built.manifest.scenery; delete built.manifest.cars; built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.sceneryLayout('monza_gp')).toBeNull(); expect(plugin.car('TEST_CAR')).toBeNull();
  });

  it.each([1, 2, 4, '3', undefined])('rejects manifest schema %s: only schema 3 is supported', schemaVersion => {
    const built = build();
    built.manifest.schemaVersion = schemaVersion; built.commit();
    expect(state(built)).toBe('invalid');
  });

  it.each(['scenes', 'vehicleMeshes', 'vehicleLiveries', 'vehicleWheels', 'trackTextures', 'unknown'])('rejects the key %s', key => {
    const built = build();
    built.manifest[key] = { catalog: 'tracks/index.json' }; built.commit();
    expect(state(built)).toBe('invalid');
  });

  it('knows brakeBoardArtwork but never reads it', () => {
    const built = build();
    built.manifest.brakeBoardArtwork = { catalog: 'brake-board-artwork/missing.json' }; built.commit();
    const plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.status).not.toHaveProperty('brakeBoardArtwork');
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
    ['an old index version', (built: Package) => { built.scenery.schemaVersion = 1; }],
    ['a stale geometry revision', (built: Package) => { built.scenery.sourceGeometryRevision = 'old'; }],
    ['a chunk asset that is not content-named', (built: Package) => { built.scenery.sectors[0].asset = 'scenery/s0.glb'; }],
    ['a chunk of the wrong size', (built: Package) => { built.scenery.sectors[0].byteLength += 1; }],
    ['a missing chunk file', (built: Package) => { fs.rmSync(path.join(built.dir, built.scenery.sectors[1].asset)); }],
    ['sectors out of lap order', (built: Package) => { built.scenery.sectors.reverse(); }],
    ['broken prev/next links', (built: Package) => { built.scenery.sectors[0].next = 's0'; }],
    ['a sector beyond the route', (built: Package) => { built.scenery.sectors[1].lapEndM = built.scenery.routeLengthM + 10; }],
    ['duplicate chunk ids', (built: Package) => { built.scenery.sectors[1].id = 's0'; }],
    ['a texture missing from the layout list', (built: Package) => { built.scenery.sectors[0].textures = ['scenery/textures/' + '0'.repeat(64) + '.ktx2']; }],
    ['a texture file of the wrong size', (built: Package) => { built.scenery.textures[0].byteLength += 1; }],
    ['non-finite bounds', (built: Package) => { built.scenery.horizon.bounds.min[0] = Infinity; }],
    ['a layout without track geometry', (built: Package) => { built.scenery.layoutKey = 'spa_wec'; }],
  ])('rejects %s', (_name, change) => { expect(mutate(change)).toBe('invalid'); });

  it('rejects an empty catalog', () => {
    const built = build();
    built.commit(); built.write('scenery/index.json', []);
    expect(state(built)).toBe('invalid');
  });

  it('refuses bytes that differ from their hash or their extension when served', () => {
    const built = build(), plugin = new DataPlugin(built.dir);
    expect(plugin.status.state).toBe('ready');
    const file = path.join(built.dir, built.scenery.sectors[0].asset), bytes = fs.readFileSync(file);
    bytes[bytes.length - 1] ^= 0xff; fs.writeFileSync(file, bytes);
    expect(() => plugin.sceneryFile(built.scenery.sectors[0].asset)).toThrow('Package resource changed');
    expect(plugin.sceneryFile(built.scenery.sectors[1].asset)).not.toBeNull();
  });

  it('rejects a chunk whose content is not a GLB when served', () => {
    const built = build();
    const bytes = Buffer.from('not a glb at all'), row = built.scenery.sectors[0], stored = built.store('scenery', 'glb', bytes);
    Object.assign(row, stored); built.commit();
    expect(() => new DataPlugin(built.dir).sceneryFile(stored.asset)).toThrow('not the expected file type');
  });
});

describe('car validation', () => {
  const mutate = (change: (built: Package) => void) => { const built = build(); change(built); built.commit(); return state(built); };

  it.each([
    ['a vehicle id missing from the vehicle catalog', (built: Package) => { built.car.vehicleIds = ['OTHER_CAR']; built.descriptor.aliases = ['OTHER_CAR']; (built.descriptor.appearances as Array<{ alias: string }>)[0].alias = 'OTHER_CAR'; }],
    ['aliases that differ from the row', (built: Package) => { built.descriptor.aliases = ['TEST_CAR', 'EXTRA']; }],
    ['appearances that do not cover the aliases', (built: Package) => { built.descriptor.appearances = []; }],
    ['a wheel rig that did not pass', (built: Package) => { built.descriptor.wheelRig = { passed: false, rigs: 4, maxRestVertexErrorM: 0 }; }],
    ['a wheel rig with rest-vertex error', (built: Package) => { built.descriptor.wheelRig = { passed: true, rigs: 4, maxRestVertexErrorM: 0.01 }; }],
    ['a missing wheel pivot', (built: Package) => { delete (built.descriptor.wheelPivots as Record<string, unknown>).rr; }],
    ['an undeclared texture', (built: Package) => { (built.descriptor.appearances as Array<{ materialTextures?: unknown }>)[0].materialTextures = { body: 'textures/' + '1'.repeat(64) + '.ktx2' }; }],
    ['a descriptor of another car', (built: Package) => { built.descriptor.vehicleFolder = 'Other'; }],
    ['an unknown descriptor field', (built: Package) => { built.descriptor.extra = true; }],
    ['a non-boolean paint flag', (built: Package) => { (built.descriptor.materials as Array<{ paint: unknown }>)[0].paint = 'yes'; }],
    ['an asset that is not content-named', (built: Package) => { built.car.asset = 'cars/Test_Car.glb'; }],
    ['a car texture of the wrong size', (built: Package) => { built.car.textures[0].byteLength += 1; }],
  ])('rejects %s', (_name, change) => { expect(mutate(change)).toBe('invalid'); });

  it('rejects two cars serving one vehicle id', () => {
    const built = build();
    const other = { ...built.car, vehicleFolder: 'Other_Car', descriptor: 'cars/Other_Car.json' };
    built.write('cars/index.json', [built.car, other]);
    expect(state(built)).toBe('invalid');
  });

  it('serves a car without a vehicle catalog bound to it', () => {
    const built = build();
    delete built.manifest.vehicles; built.commit();
    expect(new DataPlugin(built.dir).car('TEST_CAR')).not.toBeNull();
  });
});

describe('scenery and car routes', () => {
  it('serves layouts, content-named files and car resources with immutable caching and nosniff', async () => {
    const built = build(), app = express();
    app.use('/api/data-plugin', createDataPluginRouter(new DataPlugin(built.dir)));
    const layout = await request(app).get('/api/data-plugin/scenery/monza_gp');
    expect(layout.status).toBe(200); expect(layout.body).toHaveProperty('horizon.id', 'horizon'); expect(layout.body).toHaveProperty('packageRevision');
    expect((await request(app).get('/api/data-plugin/scenery/spa_wec')).status).toBe(404);

    const chunk = await request(app).get('/api/data-plugin/scenery/files/' + path.basename(built.scenery.sectors[0].asset)).buffer().parse((res, done) => { const parts: Buffer[] = []; res.on('data', (part: Buffer) => parts.push(part)); res.on('end', () => done(null, Buffer.concat(parts))); });
    expect(chunk.status).toBe(200); expect(chunk.headers['content-type']).toContain('model/gltf-binary');
    expect(chunk.headers['x-content-type-options']).toBe('nosniff'); expect(chunk.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(chunk.body).toEqual(glb('sector 0'));
    const texture = await request(app).get('/api/data-plugin/scenery/files/textures/' + path.basename(built.sceneryTexture.asset));
    expect(texture.status).toBe(200); expect(texture.headers['content-type']).toContain('image/ktx2');
    expect((await request(app).get('/api/data-plugin/scenery/files/' + '0'.repeat(64) + '.glb')).status).toBe(404);
    expect((await request(app).get('/api/data-plugin/scenery/files/..%2Fmanifest.json')).status).toBe(404);

    const car = await request(app).get('/api/data-plugin/cars/test_car.veh');
    expect(car.status).toBe(200); expect(car.body).toMatchObject({ vehicleFolder: 'Test_Car', sha256: built.car.sha256 });
    expect((await request(app).get('/api/data-plugin/cars/unknown')).status).toBe(404);
    expect((await request(app).get('/api/data-plugin/cars/files/Test_Car.json')).body).toHaveProperty('vehicleFolder', 'Test_Car');
    expect((await request(app).get('/api/data-plugin/cars/files/' + path.basename(built.car.asset))).headers['content-type']).toContain('model/gltf-binary');
    expect((await request(app).get('/api/data-plugin/cars/files/textures/' + path.basename(built.carTexture.asset))).status).toBe(200);
    expect((await request(app).get('/api/data-plugin/cars/files/textures/' + '0'.repeat(64) + '.ktx2')).status).toBe(404);
  });

  it('reports a package file changed on disk as a conflict instead of serving it', async () => {
    const built = build(), app = express();
    app.use('/api/data-plugin', createDataPluginRouter(new DataPlugin(built.dir)));
    fs.writeFileSync(path.join(built.dir, built.scenery.sectors[0].asset), glb('tampered'.padEnd(Buffer.from('sector 0').length, '!')));
    expect((await request(app).get('/api/data-plugin/scenery/files/' + path.basename(built.scenery.sectors[0].asset))).status).toBe(409);
    expect((await request(app).get('/api/data-plugin/scenery/files/' + path.basename(built.scenery.sectors[1].asset))).status).toBe(200);
  });
});
