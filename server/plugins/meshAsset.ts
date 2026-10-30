import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { MeshAsset } from '../../shared/types/scenes/meshAsset.js';
import { validateSceneGlb } from './sceneGlb.js';
import { decodeGroundGrid } from './groundGrid.js';

export interface RegisteredMesh<T extends MeshAsset = MeshAsset> { metadata: T; file: string }

/** Containment is checked again on requests: replacing a junction cannot change the resource. */
function resource(root: string, relative: string): string {
  if (!relative || path.isAbsolute(relative) || /[\\:]/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) throw Error('Invalid mesh resource path');
  const file = fs.realpathSync(path.join(root, relative)), escaped = path.relative(root, file);
  if (escaped.startsWith('..') || path.isAbsolute(escaped)) throw Error('Escaping mesh resource');
  return file;
}

function storedBytes(metadata: MeshAsset): number { return metadata.storage?.byteLength ?? metadata.byteLength; }
function decode(bytes: Buffer, metadata: MeshAsset): Buffer {
  if (!metadata.storage) return bytes;
  const result = decodeGroundGrid(bytes, metadata.byteLength);
  if (createHash('sha256').update(result).digest('hex') !== metadata.sha256) throw Error('Decoded mesh hash mismatch');
  return result;
}

export function registerMeshAsset<T extends MeshAsset>(root: string, metadata: T, wheelPivots = false): RegisteredMesh<T> {
  const storage = metadata.storage;
  if (storage !== undefined && (!storage || typeof storage !== 'object' || Array.isArray(storage) || wheelPivots || Object.keys(storage).some(key => !['encoding', 'sha256', 'byteLength'].includes(key)) || storage.encoding !== 'ground-grid-v1' || !/^[a-f0-9]{64}$/.test(storage.sha256) || !Number.isSafeInteger(storage.byteLength) || storage.byteLength < 20 || storage.byteLength > 128_000_000)) throw Error('Invalid mesh storage');
  if (typeof metadata.asset !== 'string' || !metadata.asset.endsWith(storage ? '.lmg' : '.glb') || !/^[a-f0-9]{64}$/.test(metadata.sha256) || !Number.isSafeInteger(metadata.byteLength) || metadata.byteLength < 28 || metadata.byteLength > 128_000_000) throw Error('Invalid mesh asset');
  const file = resource(root, metadata.asset), stat = fs.statSync(file);
  if (!stat.isFile() || stat.size !== storedBytes(metadata) || stat.size > 128_000_000) throw Error('Mesh budget exceeded');
  const stored = fs.readFileSync(file);
  if (createHash('sha256').update(stored).digest('hex') !== (metadata.storage?.sha256 ?? metadata.sha256)) throw Error('Mesh hash mismatch');
  const bytes = decode(stored, metadata);
  const checked = validateSceneGlb(bytes, wheelPivots);
  if (checked.triangles !== metadata.triangles || !metadata.bounds || !Array.isArray(metadata.bounds.min) || !Array.isArray(metadata.bounds.max) || metadata.bounds.min.length !== 3 || metadata.bounds.max.length !== 3 || checked.min.some((n, i) => n !== metadata.bounds.min[i]) || checked.max.some((n, i) => n !== metadata.bounds.max[i])) throw Error('Mesh bounds mismatch');
  return {metadata: structuredClone(metadata), file};
}

export function readMeshAsset(root: string, mesh: RegisteredMesh): Buffer {
  if (resource(root, mesh.metadata.asset) !== mesh.file || fs.statSync(mesh.file).size !== storedBytes(mesh.metadata)) throw Error('Mesh resource changed');
  const bytes = fs.readFileSync(mesh.file);
  if (createHash('sha256').update(bytes).digest('hex') !== (mesh.metadata.storage?.sha256 ?? mesh.metadata.sha256)) throw Error('Mesh resource changed');
  return decode(bytes, mesh.metadata);
}
