import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, expect, it } from 'vitest';
import { DataPlugin } from '../../../server/plugins/dataPlugin.js';
import { createDataPluginRouter } from '../../../server/routes/dataPluginRoutes.js';
import { syntheticTrack } from '../../helpers/syntheticTrack.js';
import { syntheticGlb } from '../../helpers/scenes/syntheticGlb.js';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) fs.rmSync(dir, {recursive: true, force: true, maxRetries: 5, retryDelay: 50}); });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'board-artwork-')); directories.push(root);
  const write = (file: string, value: unknown) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, JSON.stringify(value)); };
  const geometry = syntheticTrack(), glb = syntheticGlb(), sha = createHash('sha256').update(glb).digest('hex');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VLsAAAAASUVORK5CYII=', 'base64');
  const hash = createHash('sha256').update(png).digest('hex');
  const row = {layoutKey: 'monza_gp', sourceGeometryRevision: geometry.geometryRevision!, markerIds: ['board-test'], label: '100', revision: `artwork-${hash}`, sha256: hash, asset: `brake-board-artwork/${hash}.png`, byteLength: png.length, widthPx: 1, heightPx: 1, widthM: 0.9, heightM: 1.6};
  const manifest = {schemaVersion: 2, id: 'synthetic', version: '1', tracks: {catalog: 'tracks/index.json'}, scenes: {catalog: 'scenes/index.json', brakeBoardArtwork: 'brake-board-artwork/index.json'}};
  write('manifest.json', manifest); write('tracks/monza_gp.json', geometry);
  write('tracks/index.json', [{layoutKey: 'monza_gp', circuitId: 'monza', layoutId: 'gp', lengthM: geometry.lengthM, pointsCount: geometry.centerline.length}]);
  write('tracks-display/monza_gp.json', {layoutKey: 'monza_gp', sourceRevision: geometry.geometryRevision, surfaces: {road: [], kerb: [], runoff: [], pit: [], otherRoad: []}, brakeMarkers: [{id: 'board-test', label: '100', center: [0, 0], stationM: 0, side: 'left'}]});
  write('scenes/index.json', [{schemaVersion: 1, layoutKey: 'monza_gp', coordinates: 'lmu-local-xyz-metres', sourceGeometryRevision: geometry.geometryRevision, revision: `scene-${sha}`, asset: 'scenes/test.glb', sha256: sha, byteLength: glb.length, bounds: {min: [0, 4, 0], max: [5, 7, 5]}, triangles: 1, coverage: 'surfaces'}]);
  fs.writeFileSync(path.join(root, 'scenes/test.glb'), glb); write('brake-board-artwork/index.json', [row]); fs.writeFileSync(path.join(root, row.asset), png);
  return {root, write, row, png, manifest};
}

it('loads exact layout/marker artwork and serves only registered PNG bytes without local paths', async () => {
  const f = fixture(), plugin = new DataPlugin(f.root); expect(plugin.status.state).toBe('ready');
  expect(plugin.brakeBoardArtwork('monza_gp')).toHaveLength(1);
  expect(plugin.brakeBoardArtwork('monza_gp')[0]).not.toHaveProperty('asset');
  expect(plugin.brakeBoardArtwork('spa_gp')).toEqual([]);
  plugin.brakeBoardArtwork('monza_gp')[0].markerIds[0] = 'mutated';
  expect(plugin.brakeBoardArtwork('monza_gp')[0].markerIds).toEqual(['board-test']);
  const app = express(); app.use('/api/data-plugin', createDataPluginRouter(plugin));
  const meta = await request(app).get('/api/data-plugin/brake-board-artwork/monza_gp').expect(200);
  expect(JSON.stringify(meta.body)).not.toContain(f.root);
  const image = await request(app).get(`/api/data-plugin/brake-board-artwork/monza_gp/${f.row.revision}/asset`).expect(200).expect('Content-Type', /image\/png/).expect('X-Content-Type-Options', 'nosniff');
  expect(image.body).toEqual(f.png);
  await request(app).get('/api/data-plugin/brake-board-artwork/monza_gp/stale/asset').expect(404);
  await request(app).get(`/api/data-plugin/brake-board-artwork/spa_gp/${f.row.revision}/asset`).expect(404);
});

it('rejects stale geometry, wrong printed labels, duplicate marker bindings and invalid image dimensions', () => {
  const f = fixture();
  for (const row of [{...f.row, sourceGeometryRevision: 'stale'}, {...f.row, label: '200'}, {...f.row, markerIds: ['unknown']}, {...f.row, markerIds: ['board-test', 'board-test']}, {...f.row, widthPx: 8192}, {...f.row, widthM: 0}, {...f.row, asset: '../outside.png'}, {...f.row, widthPx: 2}]) {
    f.write('brake-board-artwork/index.json', [row]); expect(new DataPlugin(f.root).status.state).toBe('invalid');
  }
});

it('rechecks image hashes on requests and supports old packages without artwork', async () => {
  const f = fixture(), plugin = new DataPlugin(f.root), app = express(); app.use('/api/data-plugin', createDataPluginRouter(plugin));
  const changed = Buffer.from(f.png); changed[40] ^= 1; fs.writeFileSync(path.join(f.root, f.row.asset), changed);
  await request(app).get(`/api/data-plugin/brake-board-artwork/monza_gp/${f.row.revision}/asset`).expect(409);
  f.write('manifest.json', {...f.manifest, scenes: {catalog: 'scenes/index.json'}});
  const legacy = new DataPlugin(f.root); expect(legacy.status.state).toBe('ready'); expect(legacy.brakeBoardArtwork('monza_gp')).toEqual([]);
});

it('rejects junctions that place a board image outside its package', () => {
  const f = fixture(), outside = fixture();
  fs.unlinkSync(path.join(f.root, f.row.asset)); fs.unlinkSync(path.join(f.root, 'brake-board-artwork/index.json')); fs.rmdirSync(path.join(f.root, 'brake-board-artwork'));
  fs.symlinkSync(path.join(outside.root, 'brake-board-artwork'), path.join(f.root, 'brake-board-artwork'), 'junction');
  expect(new DataPlugin(f.root).status.state).toBe('invalid');
});

it('rejects animated chunks and PNGs without pixel data even when their declared hashes match', () => {
  const f = fixture(), animation = Buffer.alloc(20);
  animation.writeUInt32BE(8, 0); animation.write('acTL', 4); animation.writeUInt32BE(2, 8);
  const noPixels = Buffer.concat([f.png.subarray(0, 33), f.png.subarray(-12)]);
  const animated = Buffer.concat([f.png.subarray(0, -12), animation, f.png.subarray(-12)]);
  for (const bytes of [animated, noPixels]) {
    const sha256 = createHash('sha256').update(bytes).digest('hex'), asset = `brake-board-artwork/${sha256}.png`;
    fs.writeFileSync(path.join(f.root, asset), bytes);
    f.write('brake-board-artwork/index.json', [{...f.row, sha256, revision: `artwork-${sha256}`, asset, byteLength: bytes.length}]);
    expect(new DataPlugin(f.root).status.state).toBe('invalid');
  }
});
