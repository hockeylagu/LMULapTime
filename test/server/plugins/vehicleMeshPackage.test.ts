import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, expect, it } from 'vitest';
import { DataPlugin } from '../../../server/plugins/dataPlugin.js';
import { createDataPluginRouter } from '../../../server/routes/dataPluginRoutes.js';
import { syntheticGlb } from '../../helpers/scenes/syntheticGlb.js';
import type { VehicleMesh } from '../../../shared/types/scenes/vehicleMesh.js';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) fs.rmSync(dir, {recursive: true, force: true}); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vehicle-mesh-')); directories.push(root);
  const write = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), JSON.stringify(value)); };
  const bytes = syntheticGlb(undefined, [-1, 0, -2, 1, 1, 2, -1, 1, 2]);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const mesh: VehicleMesh = {schemaVersion: 1, vehicleRecordId: 'car-a', coordinates: 'vehicle-local-xyz-metres-forward-minus-z', representation: 'render', originCalibration: 'unverified', parts: ['body', 'tyres', 'rims'],
    revision: `mesh-${sha256}`, asset: 'vehicle-meshes/car-a.glb', sha256, byteLength: bytes.length, bounds: {min: [-1, 0, -2], max: [1, 1, 2]}, triangles: 1};
  write('manifest.json', {schemaVersion: 2, id: 'test', version: '1', vehicles: {catalog: 'vehicles/index.json'}, vehicleMeshes: {catalog: 'vehicle-meshes/index.json'}});
  write('vehicles/index.json', {schemaVersion: 1, coordinates: 'local-xz-metres-forward-minus-z', vehicles: [{id: 'car-a', model: 'Test', carClass: 'GT3', vehicleIds: ['TEST_A']}]});
  write('vehicle-meshes/index.json', [mesh]); fs.writeFileSync(path.join(root, mesh.asset), bytes);
  return {root, write, mesh, bytes};
}

it('binds a visible car mesh and tyres to its own exact vehicle record', () => {
  const f = fixture(), plugin = new DataPlugin(f.root);
  expect(plugin.status.vehicleMeshes).toBe(true); expect(plugin.status.state).toBe('ready');
  expect(plugin.vehicleMesh('car-a')?.parts).toEqual(['body', 'tyres', 'rims']);
  expect(plugin.vehicleMesh('car-b')).toBeNull(); expect(plugin.vehicleMesh('Test')).toBeNull();
  expect(plugin.vehicleMesh('car-a')).not.toHaveProperty('asset');
  plugin.vehicleMesh('car-a')!.bounds.min[0] = 999;
  expect(plugin.vehicleMesh('car-a')!.bounds.min[0]).toBe(-1);
  expect(plugin.vehicleMeshAsset('car-a', f.mesh.revision)).toEqual(f.bytes);
});
it.each([{vehicleRecordId: 'unresolved'}, {representation: 'collision'}, {originCalibration: 'guessed'}, {parts: ['tyres']}, {parts: ['body', 'invalid']}, {revision: 'old'}, {asset: '../escape.glb'}, {bounds: {min: [-5, 0, -2], max: [5, 1, 2]}}])('rejects invalid or mismatched model metadata %j', change => {
  const f = fixture(); f.write('vehicle-meshes/index.json', [{...f.mesh, ...change}]);
  expect(new DataPlugin(f.root).status.state).toBe('invalid');
});
it('serves validated metadata and binary assets without leaking file paths', async () => {
  const f = fixture(), app = express(); app.use('/api/data-plugin', createDataPluginRouter(new DataPlugin(f.root)));
  const metadata = await request(app).get('/api/data-plugin/vehicle-meshes/car-a').expect(200);
  expect(metadata.text).not.toContain(f.root); expect(metadata.text).not.toContain('.glb');
  const asset = await request(app).get(`/api/data-plugin/vehicle-meshes/car-a/${f.mesh.revision}/asset`).expect(200);
  expect(asset.headers['content-type']).toContain('model/gltf-binary'); expect(Number(asset.headers['content-length'])).toBe(f.bytes.length);
  await request(app).get('/api/data-plugin/vehicle-meshes/car-b').expect(404);
  await request(app).get('/api/data-plugin/vehicle-meshes/car-a/stale/asset').expect(404);
  fs.writeFileSync(path.join(f.root, f.mesh.asset), Buffer.alloc(f.bytes.length));
  await request(app).get(`/api/data-plugin/vehicle-meshes/car-a/${f.mesh.revision}/asset`).expect(409);
});
