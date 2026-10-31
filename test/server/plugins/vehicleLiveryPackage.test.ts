import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { loadVehicleLiveryPackage, readVehicleLivery } from '../../../server/plugins/vehicleLiveryPackage.js';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories) fs.rmSync(dir, { recursive: true, force: true });
  directories.length = 0;
});

function createMockWebp(): Buffer {
  // Minimal valid WebP with RIFF header, WEBP fourcc, and VP8 chunk
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(buf.length - 8, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  buf.writeUInt32LE(10, 16);
  return buf;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'livery-test-'));
  directories.push(root);
  fs.mkdirSync(path.join(root, 'vehicle-liveries'), { recursive: true });

  const bytes = createMockWebp();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const asset = `vehicle-liveries/${sha256}.webp`;
  fs.writeFileSync(path.join(root, asset), bytes);

  const rows = [
    {
      liveryKey: 'car_livery_1',
      vehicleRecordId: 'REC_CAR_1',
      vehicleIds: ['ALIAS_CAR_1', '23_26_THOR1234'],
      asset,
      sha256,
      byteLength: bytes.length,
      width: 2048,
      height: 2048,
      revision: `livery-${sha256}`,
    },
  ];

  const vehicleMeshes = new Set(['REC_CAR_1']);

  return { root, rows, bytes, sha256, vehicleMeshes };
}

it('loads valid livery array catalog and resolves only by vehicle alias', () => {
  const f = fixture();
  const store = loadVehicleLiveryPackage(f.root, f.rows, f.vehicleMeshes);
  expect(store.size).toBe(1);

  const byAlias = store.resolve('ALIAS_CAR_1');
  expect(byAlias?.metadata.liveryKey).toBe('car_livery_1');
  expect(byAlias?.metadata.vehicleRecordId).toBe('REC_CAR_1');
  expect(byAlias?.metadata.revision).toBe(`livery-${f.sha256}`);
  expect(store.resolve('car_livery_1')).toBeNull();

  // Case-insensitive & extension stripping
  expect(store.resolve('alias_car_1.veh')?.metadata.liveryKey).toBe('car_livery_1');
  expect(store.resolve('23_26_thor1234')?.metadata.liveryKey).toBe('car_livery_1');

  expect(store.get('CAR_LIVERY_1', `livery-${f.sha256}`)).toBe(byAlias);
  expect(store.get('car_livery_1', 'livery-other')).toBeNull();
  expect(readVehicleLivery(f.root, byAlias!)).toEqual(f.bytes);
});

it('shares one image across mesh variants but rejects a vehicle bound to two liveries', () => {
  const f = fixture(), meshes = new Set(['REC_CAR_1', 'REC_CAR_2']);
  const shared = [...f.rows, {...f.rows[0], vehicleRecordId: 'REC_CAR_2', vehicleIds: ['ALIAS_CAR_2']}];
  const store = loadVehicleLiveryPackage(f.root, shared, meshes);
  expect(store.resolve('ALIAS_CAR_2')?.metadata.vehicleRecordId).toBe('REC_CAR_2');
  const duplicate = [...f.rows, {...f.rows[0], vehicleRecordId: 'REC_CAR_2', vehicleIds: ['alias_car_1']}];
  expect(() => loadVehicleLiveryPackage(f.root, duplicate, meshes)).toThrow(/more than one livery/);
});

it('rejects catalog when vehicleRecordId does not exist in vehicleMeshes', () => {
  const f = fixture();
  const emptyMeshes = new Set<string>();
  expect(() => loadVehicleLiveryPackage(f.root, f.rows, emptyMeshes)).toThrow(/unknown vehicleRecordId/);
});

it('rejects catalog with invalid WebP binary header', () => {
  const f = fixture();
  const corrupt = Buffer.alloc(30);
  const corruptSha = createHash('sha256').update(corrupt).digest('hex');
  const corruptAsset = `vehicle-liveries/${corruptSha}.webp`;
  fs.writeFileSync(path.join(f.root, corruptAsset), corrupt);
  const invalidRows = [{ ...f.rows[0], asset: corruptAsset, sha256: corruptSha, revision: `livery-${corruptSha}` }];
  expect(() => loadVehicleLiveryPackage(f.root, invalidRows, f.vehicleMeshes)).toThrow(/Invalid WebP/);
});

it('rejects catalog with sha256 mismatch', () => {
  const f = fixture();
  const fakeSha = '0'.repeat(64);
  const invalidRows = [{ ...f.rows[0], sha256: fakeSha, revision: `livery-${fakeSha}` }];
  expect(() => loadVehicleLiveryPackage(f.root, invalidRows, f.vehicleMeshes)).toThrow(/hash mismatch/);
});

it('rejects escaping asset paths', () => {
  const f = fixture();
  const invalidRows = [{ ...f.rows[0], asset: 'vehicle-liveries/../escape.webp' }];
  expect(() => loadVehicleLiveryPackage(f.root, invalidRows, f.vehicleMeshes)).toThrow();
});

it('rejects non-array catalog', () => {
  const f = fixture();
  expect(() => loadVehicleLiveryPackage(f.root, { schemaVersion: 1 }, f.vehicleMeshes)).toThrow(/expected array/);
});
