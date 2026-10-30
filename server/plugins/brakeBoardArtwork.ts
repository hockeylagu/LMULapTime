import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { BrakeBoardArtwork } from '../../shared/types/scenes/brakeBoardArtwork.js';
import type { TrackBoundaryGeometry, TrackMapDisplay } from '../../shared/types/trackGeometry.js';

export interface RegisteredBoardArtwork { metadata: BrakeBoardArtwork; file: string }

function fileAt(root: string, asset: string): string {
  if (!/^brake-board-artwork\/[a-f0-9]{64}\.png$/.test(asset)) throw Error('Invalid brake-board image path');
  const file = fs.realpathSync(path.join(root, asset)), relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Escaping brake-board image');
  return file;
}

export function readBoardArtwork(root: string, row: RegisteredBoardArtwork): Buffer {
  const {metadata} = row;
  if (fileAt(root, metadata.asset) !== row.file) throw Error('Brake-board image changed');
  const stat = fs.statSync(row.file);
  if (!stat.isFile() || stat.size !== metadata.byteLength || stat.size > 1_000_000) throw Error('Brake-board image budget exceeded');
  const bytes = fs.readFileSync(row.file);
  if (createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw Error('Brake-board image hash mismatch');
  if (bytes.length < 45 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR'
    || bytes.readUInt32BE(16) !== metadata.widthPx || bytes.readUInt32BE(20) !== metadata.heightPx
    || !bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))) throw Error('Invalid brake-board PNG');
  if (bytes[24] !== 8 || ![0, 2, 4, 6].includes(bytes[25]) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) throw Error('Unsupported brake-board PNG encoding');
  let offset = 8, hasPixels = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw Error('Truncated brake-board PNG');
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (length > bytes.length - offset - 12 || !['IHDR', 'IDAT', 'IEND'].includes(type)
      || (type === 'IHDR' && offset !== 8) || (type === 'IEND' && (length !== 0 || offset + 12 !== bytes.length))) throw Error('Unsupported brake-board PNG chunk');
    if (type === 'IDAT') hasPixels = true;
    offset += length + 12;
  }
  if (!hasPixels) throw Error('Brake-board PNG has no pixels');
  return bytes;
}

export function loadBoardArtwork(root: string, value: unknown, trackAt: (key: string) => {geometry: TrackBoundaryGeometry; display: TrackMapDisplay | null} | null): Map<string, RegisteredBoardArtwork[]> {
  if (!Array.isArray(value) || value.length > 2048) throw Error('Invalid brake-board artwork catalog');
  const result = new Map<string, RegisteredBoardArtwork[]>(), markers = new Set<string>(), files = new Map<string, RegisteredBoardArtwork>();
  let totalBytes = 0;
  for (const entry of value as unknown[]) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw Error('Invalid brake-board artwork');
    const row = entry as BrakeBoardArtwork;
    const allowed = new Set(['layoutKey', 'sourceGeometryRevision', 'markerIds', 'label', 'revision', 'sha256', 'asset', 'byteLength', 'widthPx', 'heightPx', 'widthM', 'heightM']);
    if (Object.keys(row).some(key => !allowed.has(key)) || typeof row.layoutKey !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256) || row.revision !== `artwork-${row.sha256}` || row.asset !== `brake-board-artwork/${row.sha256}.png`
      || typeof row.label !== 'string' || !row.label || row.label.length > 32 || !Array.isArray(row.markerIds) || !row.markerIds.length || row.markerIds.length > 512
      || ![row.widthPx, row.heightPx].every(n => Number.isSafeInteger(n) && n > 0 && n <= 1024)
      || ![row.widthM, row.heightM].every(n => Number.isFinite(n) && n >= 0.05 && n <= 5)
      || !Number.isSafeInteger(row.byteLength) || row.byteLength < 45 || row.byteLength > 1_000_000) throw Error('Invalid brake-board artwork metadata');
    const track = trackAt(row.layoutKey);
    if (!track || row.sourceGeometryRevision !== track.geometry.geometryRevision) throw Error('Brake-board geometry mismatch');
    for (const id of row.markerIds) {
      const key = `${row.layoutKey}:${id}`;
      if (typeof id !== 'string' || markers.has(key) || !track.display?.brakeMarkers?.some(marker => marker.id === id && marker.label === row.label)) throw Error('Brake-board marker mismatch');
      markers.add(key);
    }
    const registered = {metadata: structuredClone(row), file: fileAt(root, row.asset)};
    const previous = files.get(row.asset);
    if (previous) {
      if (JSON.stringify([previous.metadata.sha256, previous.metadata.byteLength, previous.metadata.widthPx, previous.metadata.heightPx]) !== JSON.stringify([row.sha256, row.byteLength, row.widthPx, row.heightPx])) throw Error('Conflicting brake-board image');
    } else {
      readBoardArtwork(root, registered); files.set(row.asset, registered); totalBytes += row.byteLength;
      if (totalBytes > 16_000_000) throw Error('Brake-board artwork catalog budget exceeded');
    }
    result.set(row.layoutKey, [...(result.get(row.layoutKey) ?? []), registered]);
  }
  return result;
}
