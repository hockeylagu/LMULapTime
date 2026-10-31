import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { loadVehicleWheelPackage, readVehicleWheelTexture } from '../../../server/plugins/vehicleWheelPackage.js';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories) fs.rmSync(dir, { recursive: true, force: true });
  directories.length = 0;
});

function createMockWebp(): Buffer {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(buf.length - 8, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  buf.writeUInt32LE(10, 16);
  return buf;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wheel-test-'));
  directories.push(root);
  fs.mkdirSync(path.join(root, 'vehicle-wheels'), { recursive: true });

  const rimBytes = createMockWebp();
  rimBytes.writeUInt8(1, 20); // differentiate
  const rimSha256 = createHash('sha256').update(rimBytes).digest('hex');
  const rimAsset = `vehicle-wheels/${rimSha256}.webp`;
  fs.writeFileSync(path.join(root, rimAsset), rimBytes);

  const tyreBytes = createMockWebp();
  tyreBytes.writeUInt8(2, 20); // differentiate
  const tyreSha256 = createHash('sha256').update(tyreBytes).digest('hex');
  const tyreAsset = `vehicle-wheels/${tyreSha256}.webp`;
  fs.writeFileSync(path.join(root, tyreAsset), tyreBytes);

  const rows = [
    {
      vehicleRecordId: 'REC_CAR_1',
      rim: {
        asset: rimAsset,
        sha256: rimSha256,
        byteLength: rimBytes.length,
        width: 1024,
        height: 1024,
      },
      tyre: {
        asset: tyreAsset,
        sha256: tyreSha256,
        byteLength: tyreBytes.length,
        width: 1024,
        height: 1024,
      },
    },
  ];

  const vehicleMeshes = new Set(['REC_CAR_1']);

  return { root, rows, rimBytes, tyreBytes, rimSha256, tyreSha256, vehicleMeshes };
}

it('loads valid wheels catalog and resolves by vehicleRecordId and texture sha256', () => {
  const f = fixture();
  const store = loadVehicleWheelPackage(f.root, f.rows, f.vehicleMeshes);
  expect(store.size).toBe(1);

  const record = store.get('REC_CAR_1');
  expect(record).not.toBeNull();
  expect(record?.rim.sha256).toBe(f.rimSha256);
  expect(record?.tyre.sha256).toBe(f.tyreSha256);

  const rimTexture = store.texture(f.rimSha256);
  expect(rimTexture).not.toBeNull();
  const rimData = readVehicleWheelTexture(f.root, rimTexture!);
  expect(rimData).toEqual(f.rimBytes);

  const tyreTexture = store.texture(f.tyreSha256);
  expect(tyreTexture).not.toBeNull();
  const tyreData = readVehicleWheelTexture(f.root, tyreTexture!);
  expect(tyreData).toEqual(f.tyreBytes);
});

it('rejects unknown vehicleRecordId not in meshes set', () => {
  const f = fixture();
  expect(() => loadVehicleWheelPackage(f.root, f.rows, new Set(['OTHER_CAR']))).toThrow(
    'references unknown vehicleRecordId'
  );
});

it('rejects duplicate vehicleRecordId entries', () => {
  const f = fixture();
  const rows = [...f.rows, ...f.rows];
  expect(() => loadVehicleWheelPackage(f.root, rows, f.vehicleMeshes)).toThrow('Duplicate wheel record');
});

it('rejects tampered or corrupt wheel texture', () => {
  const f = fixture();
  const corruptFile = path.join(f.root, f.rows[0].rim.asset);
  fs.writeFileSync(corruptFile, Buffer.from('corrupt non-webp content'));
  expect(() => loadVehicleWheelPackage(f.root, f.rows, f.vehicleMeshes)).toThrow();
});

it('rejects path escaping assets', () => {
  const f = fixture();
  const rows = [
    {
      vehicleRecordId: 'REC_CAR_1',
      rim: {
        ...f.rows[0].rim,
        asset: 'vehicle-wheels/../secret.webp',
      },
      tyre: f.rows[0].tyre,
    },
  ];
  expect(() => loadVehicleWheelPackage(f.root, rows, f.vehicleMeshes)).toThrow('Invalid rim asset path');
});
