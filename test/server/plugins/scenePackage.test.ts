import { syntheticGlb } from '../../helpers/scenes/syntheticGlb.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { DataPlugin } from '../../../server/plugins/dataPlugin.js';
import { validateSceneGlb } from '../../../server/plugins/sceneGlb.js';
import { createDataPluginRouter } from '../../../server/routes/dataPluginRoutes.js';
import { syntheticTrack } from '../../helpers/syntheticTrack.js';
import type { TrackScene } from '../../../shared/types/scenes/trackScene.js';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) fs.rmSync(dir, {recursive: true, force: true}); });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-plugin-')); directories.push(root);
  const write = (name: string, value: unknown) => { fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true}); fs.writeFileSync(path.join(root, name), JSON.stringify(value)); };
  const geometry = syntheticTrack(), bytes = syntheticGlb(), sha256 = createHash('sha256').update(bytes).digest('hex');
  const scene: TrackScene = {schemaVersion: 1, layoutKey: 'monza_gp', coordinates: 'lmu-local-xyz-metres', sourceGeometryRevision: geometry.geometryRevision!,
    revision: `scene-${sha256}`, asset: 'scenes/monza_gp.glb', sha256, byteLength: bytes.length, bounds: {min: [0, 4, 0], max: [5, 7, 5]}, triangles: 1, coverage: 'surfaces'};
  const manifest = {schemaVersion: 2, id: 'synthetic', version: '1', tracks: {catalog: 'tracks/index.json'}, scenes: {catalog: 'scenes/index.json'}};
  write('manifest.json', manifest); write('tracks/monza_gp.json', geometry);
  write('tracks/index.json', [{layoutKey: 'monza_gp', circuitId: 'monza', layoutId: 'gp', lengthM: geometry.lengthM, pointsCount: geometry.centerline.length}]);
  write('scenes/index.json', [scene]); fs.writeFileSync(path.join(root, scene.asset), bytes);
  return {root, write, manifest, scene, bytes};
}

describe('3D plugin surfaces', () => {
  it('validates native XYZ, exact layout/revision and defensive public metadata', () => {
    const f = fixture(), plugin = new DataPlugin(f.root);
    expect(plugin.status.state).toBe('ready'); expect(plugin.status.scenes).toBe(true);
    expect(plugin.scene('monza_gp')).not.toHaveProperty('asset');
    expect(plugin.scene('monza_gp')?.bounds.min).toEqual([0, 4, 0]);
    plugin.scene('monza_gp')!.bounds.min[0] = 999;
    expect(plugin.scene('monza_gp')!.bounds.min[0]).toBe(0);
    expect(plugin.scene('monza_curva_grande')).toBeNull();
    expect(plugin.sceneAsset('monza_gp', f.scene.revision)).toEqual(f.bytes);
    expect(plugin.sceneAsset('monza_gp', 'stale')).toBeNull();
  });
  it('serves standard Meshopt GLBs directly and detects mutation', async () => {
    const f = fixture();
    const sample = JSON.parse(fs.readFileSync(new URL('../../fixtures/scenes/meshopt-glb.json', import.meta.url), 'utf8')) as {meshopt: string};
    const bytes = Buffer.from(sample.meshopt, 'base64'), sha256 = createHash('sha256').update(bytes).digest('hex');
    const scene = {...f.scene, sha256, revision: 'scene-'+sha256, byteLength: bytes.length};
    fs.writeFileSync(path.join(f.root, scene.asset), bytes); f.write('scenes/index.json', [scene]);
    const plugin = new DataPlugin(f.root);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.sceneAsset(scene.layoutKey, scene.revision)).toEqual(bytes);
    const app = express(); app.use('/api/data-plugin', createDataPluginRouter(plugin));
    const response = await request(app).get(`/api/data-plugin/scenes/${scene.layoutKey}/${scene.revision}/asset`).expect(200);
    expect(response.headers['content-type']).toContain('model/gltf-binary');
    expect(Number(response.headers['content-length'])).toBe(bytes.length);
    const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1;
    fs.writeFileSync(path.join(f.root, scene.asset), changed);
    expect(() => plugin.sceneAsset(scene.layoutKey, scene.revision)).toThrow('changed');
  });
  it('accepts scenes that also carry barriers', () => {
    const f = fixture(); f.write('scenes/index.json', [{...f.scene, coverage: 'surfaces+barriers'}]);
    expect(new DataPlugin(f.root).scene('monza_gp')?.coverage).toBe('surfaces+barriers');
  });
  it('lets layouts share one scene file and rejects a conflicting row for it', () => {
    const f = fixture(), other = syntheticTrack('daytona_road_course');
    f.write('tracks/daytona_road_course.json', other);
    f.write('tracks/index.json', [{layoutKey: 'monza_gp', circuitId: 'monza', layoutId: 'gp', lengthM: other.lengthM, pointsCount: other.centerline.length},
      {layoutKey: 'daytona_road_course', circuitId: 'daytona', layoutId: 'road', lengthM: other.lengthM, pointsCount: other.centerline.length}]);
    const shared = {...f.scene, layoutKey: 'daytona_road_course', sourceGeometryRevision: other.geometryRevision!};
    f.write('scenes/index.json', [f.scene, shared]);
    const plugin = new DataPlugin(f.root);
    expect(plugin.status.state).toBe('ready');
    expect(plugin.sceneAsset('daytona_road_course', f.scene.revision)).toEqual(f.bytes);
    f.write('scenes/index.json', [f.scene, {...shared, triangles: 2}]);
    expect(new DataPlugin(f.root).status.state).toBe('invalid');
  });
  it('requires version 2 for scene capabilities and retains version 1 analytical packages', () => {
    const f = fixture(); f.write('manifest.json', {...f.manifest, schemaVersion: 1});
    expect(new DataPlugin(f.root).status.state).toBe('invalid');
    f.write('manifest.json', {schemaVersion: 1, id: 'synthetic', version: '1', tracks: f.manifest.tracks});
    expect(new DataPlugin(f.root).status.state).toBe('ready');
  });
  it.each([
    {layoutKey: 'monza_curva_grande'}, {sourceGeometryRevision: 'wrong'}, {sha256: 'bad'},
    {triangles: 2}, {byteLength: 1}, {bounds: {min: [0, 0, 0], max: [5, 7, 5]}},
    {asset: '../escape.glb'}, {asset: 'C:/escape.glb'}, {asset: 'scenes\\escape.glb'}, {coverage: 'invented'},
  ])('rejects invalid metadata %j without serving partial packages', patch => {
    const f = fixture(); f.write('scenes/index.json', [{...f.scene, ...patch}]);
    expect(new DataPlugin(f.root).status.state).toBe('invalid');
  });
  it('rejects changed binary bytes after validation even if their length is unchanged', () => {
    const f = fixture(), plugin = new DataPlugin(f.root);
    const changed = Buffer.from(f.bytes); changed[changed.length - 1] ^= 1; fs.writeFileSync(path.join(f.root, f.scene.asset), changed);
    expect(() => plugin.sceneAsset('monza_gp', f.scene.revision)).toThrow('changed');
    expect(new DataPlugin(f.root).status.state).toBe('invalid');
  });
  it('rejects junction escapes', () => {
    const f = fixture(), outside = fixture();
    fs.symlinkSync(path.join(outside.root, 'scenes'), path.join(f.root, 'escape'), 'junction');
    f.write('scenes/index.json', [{...f.scene, asset: 'escape/monza_gp.glb'}]);
    expect(new DataPlugin(f.root).status.state).toBe('invalid');
  });
  it('serves only the registered layout and revision, without local paths', async () => {
    const f = fixture(), app = express(); app.use('/api/data-plugin', createDataPluginRouter(new DataPlugin(f.root)));
    const metadata = await request(app).get('/api/data-plugin/scenes/monza_gp').expect(200);
    expect(metadata.text).not.toContain(f.root); expect(metadata.text).not.toContain('monza_gp.glb');
    const asset = await request(app).get(`/api/data-plugin/scenes/monza_gp/${f.scene.revision}/asset`).expect(200);
    expect(asset.headers['content-type']).toContain('model/gltf-binary');
    expect(Number(asset.headers['content-length'])).toBe(f.bytes.length);
    await request(app).get('/api/data-plugin/scenes/monza_curva_grande').expect(404);
    await request(app).get('/api/data-plugin/scenes/monza_gp/stale/asset').expect(404);
    fs.writeFileSync(path.join(f.root, f.scene.asset), Buffer.alloc(f.bytes.length));
    await request(app).get(`/api/data-plugin/scenes/monza_gp/${f.scene.revision}/asset`).expect(409);
  });
});

describe('static GLB subset', () => {
  it('budgets a position accessor shared by several meshes once, as exported surface kinds share one', () => {
    const shared = syntheticGlb(json => {
      json.meshes = Array.from({length: 4}, () => ({primitives: [{attributes: {POSITION: 0}, indices: 1, material: 0}]}));
      json.nodes = [0, 1, 2, 3].map(mesh => ({mesh})); json.scenes = [{nodes: [0, 1, 2, 3]}];
    });
    expect(validateSceneGlb(shared)).toEqual({triangles: 4, min: [0, 4, 0], max: [5, 7, 5]});
  });
  it('rejects external resources, transforms, invalid ranges and allocation bombs', () => {
    expect(validateSceneGlb(syntheticGlb())).toEqual({triangles: 1, min: [0, 4, 0], max: [5, 7, 5]});
    const changes: Array<(json: Record<string, unknown>) => void> = [
      json => { json.buffers = [{uri: 'https://example.com/private', byteLength: 48}]; },
      json => { json.extensionsUsed = ['unknown']; },
      json => { json.nodes = [{mesh: 0, translation: [1, 0, 0]}]; },
      json => { json.accessors = [{bufferView: 0, count: 10_000_000, type: 'VEC3', componentType: 5126}]; },
      json => { json.bufferViews = [{buffer: 0, byteOffset: 4000, byteLength: 48}]; },
      json => { json.scenes = [{nodes: [99]}]; },
    ];
    for (const change of changes) expect(() => validateSceneGlb(syntheticGlb(change))).toThrow();
    const badIndex = syntheticGlb(); badIndex.writeUInt32LE(999, badIndex.length - 4); expect(() => validateSceneGlb(badIndex)).toThrow('index');
    const invalidPosition = syntheticGlb(); invalidPosition.writeFloatLE(NaN, invalidPosition.length - 48); expect(() => validateSceneGlb(invalidPosition)).toThrow('coordinate');
  });
});
