import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { TrackTextureMetadata } from '../../shared/types/scenes/trackTexture.js';

export interface RegisteredTrackTexture {
  metadata: TrackTextureMetadata;
  file: string;
}

export interface TrackTexturesStore {
  readonly size: number;
  byLayout(layoutKey: string): RegisteredTrackTexture[];
  get(layoutKey: string, textureKey: string, revision: string): RegisteredTrackTexture | null;
}

function fileAt(root: string, asset: string): string {
  if (!/^track-textures\/[a-f0-9]{64}\.webp$/.test(asset)) throw Error('Invalid track texture asset path');
  const file = fs.realpathSync(path.join(root, asset)), relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Escaping track texture asset');
  return file;
}

export function readTrackTexture(root: string, row: RegisteredTrackTexture): Buffer {
  const { metadata } = row;
  if (fileAt(root, metadata.asset) !== row.file) throw Error('Track texture image changed');
  const stat = fs.statSync(row.file);
  if (!stat.isFile() || stat.size !== metadata.byteLength || stat.size > 20_000_000) throw Error('Track texture budget exceeded');
  const bytes = fs.readFileSync(row.file);
  if (createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw Error('Track texture hash mismatch');
  if (bytes.length < 16
    || bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
    || bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
    || !['VP8 ', 'VP8L', 'VP8X'].includes(bytes.subarray(12, 16).toString('ascii'))) {
    throw Error('Invalid WebP track texture file');
  }
  return bytes;
}

export function loadTrackTexturePackage(
  root: string,
  value: unknown,
  trackKeys: Set<string> | Map<string, unknown>
): TrackTexturesStore {
  if (!Array.isArray(value) || value.length > 2048) throw Error('Invalid track textures catalog: expected array');
  const validTracks = trackKeys instanceof Set ? trackKeys : new Set(trackKeys.keys());
  const byLayoutMap = new Map<string, RegisteredTrackTexture[]>();
  const byKeyMap = new Map<string, RegisteredTrackTexture>();
  const files = new Map<string, RegisteredTrackTexture>();
  let totalBytes = 0;

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('Invalid track texture entry');
    const row = item as Record<string, unknown>;
    const allowed = new Set(['layoutKey', 'textureKey', 'material', 'asset', 'width', 'height', 'byteLength', 'sha256', 'revision']);
    if (Object.keys(row).some(k => !allowed.has(k))) throw Error('Unknown track texture field');

    if (typeof row.layoutKey !== 'string' || (!validTracks.has(row.layoutKey) && row.layoutKey !== 'shared')) {
      throw Error(`Track texture references unknown layoutKey: ${String(row.layoutKey)}`);
    }
    if (typeof row.textureKey !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(row.textureKey)) {
      throw Error('Invalid textureKey format');
    }
    if (typeof row.asset !== 'string' || !/^track-textures\/[a-f0-9]{64}\.webp$/.test(row.asset)) {
      throw Error('Invalid track texture asset format');
    }
    if (typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)) {
      throw Error('Invalid track texture sha256 format');
    }
    if (row.revision !== `texture-${row.sha256}`) {
      throw Error('Track texture revision must be texture-<sha256>');
    }
    if (![row.width, row.height].every(n => Number.isSafeInteger(n) && typeof n === 'number' && n > 0 && n <= 8192)) {
      throw Error('Invalid track texture dimensions');
    }
    if (typeof row.byteLength !== 'number' || !Number.isSafeInteger(row.byteLength) || row.byteLength < 16 || row.byteLength > 20_000_000) {
      throw Error('Invalid track texture byteLength');
    }

    const metadata: TrackTextureMetadata = {
      layoutKey: row.layoutKey,
      textureKey: row.textureKey,
      material: typeof row.material === 'string' ? row.material : undefined,
      asset: row.asset,
      sha256: row.sha256,
      byteLength: row.byteLength,
      width: Number(row.width),
      height: Number(row.height),
      revision: row.revision,
    };

    const registered: RegisteredTrackTexture = { metadata, file: fileAt(root, metadata.asset) };

    const previous = files.get(metadata.asset);
    if (previous) {
      if (previous.metadata.byteLength !== metadata.byteLength || previous.metadata.sha256 !== metadata.sha256) {
        throw Error('Conflicting track texture asset properties');
      }
    } else {
      readTrackTexture(root, registered);
      files.set(metadata.asset, registered);
      totalBytes += metadata.byteLength;
      if (totalBytes > 250_000_000) throw Error('Track texture package budget exceeded');
    }

    const compositeKey = `${metadata.layoutKey}:${metadata.textureKey}:${metadata.revision}`;
    byKeyMap.set(compositeKey, registered);

    const layoutList = byLayoutMap.get(metadata.layoutKey) ?? [];
    layoutList.push(registered);
    byLayoutMap.set(metadata.layoutKey, layoutList);
  }

  return {
    size: byKeyMap.size,
    byLayout(layoutKey: string): RegisteredTrackTexture[] {
      const specific = byLayoutMap.get(layoutKey) ?? [];
      const shared = layoutKey !== 'shared' ? (byLayoutMap.get('shared') ?? []) : [];
      const specificKeys = new Set(specific.map(row => row.metadata.textureKey.toUpperCase()));
      return [...specific, ...shared.filter(row => !specificKeys.has(row.metadata.textureKey.toUpperCase()))];
    },
    get(layoutKey: string, textureKey: string, revision: string): RegisteredTrackTexture | null {
      return byKeyMap.get(`${layoutKey}:${textureKey}:${revision}`)
        ?? byKeyMap.get(`shared:${textureKey}:${revision}`)
        ?? null;
    },
  };
}
