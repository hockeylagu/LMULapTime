import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { loadTrackTexturePackage, readTrackTexture } from '../../../server/plugins/trackTexturePackage.js';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories) fs.rmSync(dir, { recursive: true, force: true });
  directories.length = 0;
});

function createMockWebp(width = 256, height = 256): Buffer {
  const buf = Buffer.alloc(32);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(buf.length - 8, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  buf.writeUInt32LE(10, 16);
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'texture-test-'));
  directories.push(root);
  fs.mkdirSync(path.join(root, 'track-textures'), { recursive: true });

  const bytes1 = createMockWebp(512, 512);
  const sha1 = createHash('sha256').update(bytes1).digest('hex');
  const asset1 = `track-textures/${sha1}.webp`;
  fs.writeFileSync(path.join(root, asset1), bytes1);

  const bytes2 = createMockWebp(256, 256);
  const sha2 = createHash('sha256').update(bytes2).digest('hex');
  const asset2 = `track-textures/${sha2}.webp`;
  fs.writeFileSync(path.join(root, asset2), bytes2);

  const rows = [
    {
      layoutKey: 'monza_gp',
      textureKey: 'Track_RoadA_Albr',
      material: 'asphalt',
      asset: asset1,
      sha256: sha1,
      byteLength: bytes1.length,
      width: 512,
      height: 512,
      revision: `texture-${sha1}`,
    },
    {
      layoutKey: 'shared',
      textureKey: 'Track_Asphalt_nm',
      material: 'normal',
      asset: asset2,
      sha256: sha2,
      byteLength: bytes2.length,
      width: 256,
      height: 256,
      revision: `texture-${sha2}`,
    },
  ];

  const trackKeys = new Set(['monza_gp', 'sebring_full']);
  return { root, rows, bytes1, sha1, bytes2, sha2, trackKeys };
}

it('loads valid track texture catalog and provides lookup by layout and key', () => {
  const f = fixture();
  const store = loadTrackTexturePackage(f.root, f.rows, f.trackKeys);
  expect(store.size).toBe(2);

  // Monza layout should get both its specific texture and the shared normal map
  const monzaList = store.byLayout('monza_gp');
  expect(monzaList.length).toBe(2);
  expect(monzaList.map(r => r.metadata.textureKey)).toContain('Track_RoadA_Albr');
  expect(monzaList.map(r => r.metadata.textureKey)).toContain('Track_Asphalt_nm');

  const resolved = store.get('monza_gp', 'Track_RoadA_Albr', `texture-${f.sha1}`);
  expect(resolved).not.toBeNull();
  expect(resolved?.metadata.material).toBe('asphalt');

  const sharedResolved = store.get('monza_gp', 'Track_Asphalt_nm', `texture-${f.sha2}`);
  expect(sharedResolved).not.toBeNull();

  const bytes = readTrackTexture(f.root, resolved!);
  expect(bytes).toEqual(f.bytes1);
});

it('rejects unknown layoutKey in texture catalog', () => {
  const f = fixture();
  f.rows[0].layoutKey = 'unknown_circuit';
  expect(() => loadTrackTexturePackage(f.root, f.rows, f.trackKeys)).toThrow(/unknown layoutKey/);
});

it('prefers layout textures over shared fallbacks with the same case-insensitive key', () => {
  const f = fixture();
  const sharedRoad = { ...f.rows[1], textureKey: f.rows[0].textureKey.toLowerCase(), material: 'asphalt' };
  const store = loadTrackTexturePackage(f.root, [sharedRoad, ...f.rows], f.trackKeys);

  expect(store.byLayout('monza_gp').map(row => row.metadata)).toEqual(f.rows);
  expect(store.byLayout('sebring_full').map(row => row.metadata)).toEqual([sharedRoad, f.rows[1]]);
  expect(store.byLayout('shared').map(row => row.metadata)).toEqual([sharedRoad, f.rows[1]]);
});

it('rejects texture revision mismatch', () => {
  const f = fixture();
  f.rows[0].revision = 'texture-wronghash';
  expect(() => loadTrackTexturePackage(f.root, f.rows, f.trackKeys)).toThrow(/revision must be texture-/);
});

it('rejects path traversal in asset path', () => {
  const f = fixture();
  f.rows[0].asset = `track-textures/../${f.sha1}.webp`;
  expect(() => loadTrackTexturePackage(f.root, f.rows, f.trackKeys)).toThrow(/asset format/);
});

it('rejects corrupted or non-WebP image file', () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.root, f.rows[0].asset), Buffer.from('NOT A WEBP FILE AT ALL!!'));
  f.rows[0].byteLength = 24;
  f.rows[0].sha256 = createHash('sha256').update('NOT A WEBP FILE AT ALL!!').digest('hex');
  f.rows[0].revision = `texture-${f.rows[0].sha256}`;
  // rename on disk to match
  const newAsset = `track-textures/${f.rows[0].sha256}.webp`;
  fs.renameSync(path.join(f.root, `track-textures/${f.sha1}.webp`), path.join(f.root, newAsset));
  f.rows[0].asset = newAsset;

  expect(() => loadTrackTexturePackage(f.root, f.rows, f.trackKeys)).toThrow(/Invalid WebP track texture file/);
});
