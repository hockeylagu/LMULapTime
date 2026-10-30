import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {afterEach, expect, it} from 'vitest';
import {decodeGroundGrid} from '../../../server/plugins/groundGrid.js';
import {registerMeshAsset, readMeshAsset} from '../../../server/plugins/meshAsset.js';
import {validateSceneGlb} from '../../../server/plugins/sceneGlb.js';
import type {MeshAsset} from '../../../shared/types/scenes/meshAsset.js';

// Synthetic nonuniform, sloped grid with a road vertex shared with the ground; Python writer fixture.
const fixture = JSON.parse(fs.readFileSync(new URL('../../fixtures/scenes/ground-grid.json', import.meta.url), 'utf8')) as {glb: string; grid: string};
const original = Buffer.from(fixture.glb, 'base64'), stored = Buffer.from(fixture.grid, 'base64');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, {recursive: true, force: true}); });

function resource() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ground-grid-')));
  directories.push(root);
  fs.writeFileSync(path.join(root, 'scene.lmg'), stored);
  const checked = validateSceneGlb(original);
  const metadata: MeshAsset = {asset: 'scene.lmg', revision: 'scene-'+digest(original), sha256: digest(original), byteLength: original.length,
    bounds: {min: [checked.min[0], checked.min[1], checked.min[2]], max: [checked.max[0], checked.max[1], checked.max[2]]}, triangles: checked.triangles,
    storage: {encoding: 'ground-grid-v1', sha256: digest(stored), byteLength: stored.length}};
  return {root, metadata};
}

it('restores Python-produced scene bytes exactly and serves the original GLB identity', () => {
  expect(decodeGroundGrid(stored, original.length)).toEqual(original);
  const {root, metadata} = resource(), registered = registerMeshAsset(root, metadata);
  expect(readMeshAsset(root, registered)).toEqual(original);
});

it.each([0, 4, 8, 12, 16])('rejects malformed container header field at %i', offset => {
  const broken = Buffer.from(stored); broken.writeUInt32LE(0xffffffff, offset);
  expect(() => decodeGroundGrid(broken, original.length)).toThrow();
});

it('bounds dimensions and rejects truncation and decoded-length mismatches', () => {
  const broken = Buffer.from(stored), grid = 20 + broken.readUInt32LE(8) + broken.readUInt32LE(12);
  broken.writeUInt32LE(769, grid + 4);
  expect(() => decodeGroundGrid(broken, original.length)).toThrow();
  expect(() => decodeGroundGrid(stored.subarray(0, -1), original.length)).toThrow();
  expect(() => decodeGroundGrid(stored, original.length + 4)).toThrow();
});

it('checks both hashes, prevents vehicle encoding and detects same-size resource mutation', () => {
  const {root, metadata} = resource(), registered = registerMeshAsset(root, metadata);
  expect(() => registerMeshAsset(root, {...metadata, sha256: '0'.repeat(64)})).toThrow('hash');
  expect(() => registerMeshAsset(root, metadata, true)).toThrow('storage');
  const changed = Buffer.from(stored); changed[changed.length - 1] ^= 1;
  fs.writeFileSync(path.join(root, 'scene.lmg'), changed);
  expect(() => readMeshAsset(root, registered)).toThrow('changed');
  expect(() => registerMeshAsset(root, metadata)).toThrow('hash');
});
