import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { VehicleWheelRecord, VehicleWheelTextureMetadata } from '../../shared/types/scenes/vehicleWheel.js';

export interface RegisteredWheelTexture {
  metadata: VehicleWheelTextureMetadata;
  file: string;
}

export interface VehicleWheelsStore {
  readonly size: number;
  get(vehicleRecordId: string): VehicleWheelRecord | null;
  texture(sha256: string): RegisteredWheelTexture | null;
}

function fileAt(root: string, asset: string): string {
  if (!/^vehicle-wheels\/[a-f0-9]{64}\.webp$/i.test(asset)) throw Error('Invalid vehicle wheel asset path');
  const file = fs.realpathSync(path.join(root, asset)), relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Escaping vehicle wheel asset');
  return file;
}

export function readVehicleWheelTexture(root: string, row: RegisteredWheelTexture): Buffer {
  const { metadata } = row;
  if (fileAt(root, metadata.asset) !== row.file) throw Error('Vehicle wheel texture changed');
  const stat = fs.statSync(row.file);
  if (!stat.isFile() || stat.size !== metadata.byteLength || stat.size > 20_000_000) throw Error('Vehicle wheel texture budget exceeded');
  const bytes = fs.readFileSync(row.file);
  if (createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw Error('Vehicle wheel texture hash mismatch');
  if (bytes.length < 16
    || bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
    || bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
    || !['VP8 ', 'VP8L', 'VP8X'].includes(bytes.subarray(12, 16).toString('ascii'))) {
    throw Error('Invalid WebP wheel texture file');
  }
  return bytes;
}

function parseWheelTexture(
  root: string,
  raw: unknown,
  name: 'rim' | 'tyre',
  texturesBySha: Map<string, RegisteredWheelTexture>
): RegisteredWheelTexture {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error(`Invalid ${name} texture object`);
  const obj = raw as Record<string, unknown>;
  const allowed = new Set(['asset', 'sha256', 'byteLength', 'width', 'height']);
  if (Object.keys(obj).some(k => !allowed.has(k))) throw Error(`Unknown fields in ${name} texture`);

  if (typeof obj.asset !== 'string' || !/^vehicle-wheels\/[a-f0-9]{64}\.webp$/i.test(obj.asset)) {
    throw Error(`Invalid ${name} asset path`);
  }
  const asset = obj.asset;
  if (typeof obj.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(obj.sha256)) throw Error(`Invalid ${name} sha256`);
  const sha256 = obj.sha256;
  if (typeof obj.width !== 'number' || typeof obj.height !== 'number'
    || !Number.isSafeInteger(obj.width) || !Number.isSafeInteger(obj.height)
    || obj.width < 1 || obj.width > 4096 || obj.height < 1 || obj.height > 4096
    || typeof obj.byteLength !== 'number' || !Number.isSafeInteger(obj.byteLength)
    || obj.byteLength < 16 || obj.byteLength > 20_000_000) {
    throw Error(`Invalid ${name} dimensions or byteLength`);
  }
  const width = obj.width, height = obj.height, byteLength = obj.byteLength;

  let registered = texturesBySha.get(sha256);
  if (!registered) {
    const file = fileAt(root, asset);
    registered = {
      metadata: { asset, sha256, byteLength, width, height },
      file,
    };
    readVehicleWheelTexture(root, registered);
    texturesBySha.set(sha256, registered);
  }
  return registered;
}

export function loadVehicleWheelPackage(
  root: string,
  value: unknown,
  vehicleMeshes: Map<string, unknown> | Set<string>
): VehicleWheelsStore {
  if (!Array.isArray(value)) throw Error('Invalid vehicle wheels catalog: expected array');
  const wheelsByRecordId = new Map<string, VehicleWheelRecord>();
  const texturesBySha = new Map<string, RegisteredWheelTexture>();
  const validMeshIds = vehicleMeshes instanceof Set ? vehicleMeshes : new Set(vehicleMeshes.keys());
  let totalBytes = 0;

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('Invalid wheel catalog entry');
    const row = item as Record<string, unknown>;
    const allowed = new Set(['vehicleRecordId', 'rim', 'tyre']);
    if (Object.keys(row).some(k => !allowed.has(k))) throw Error('Unknown field in wheel catalog entry');

    if (typeof row.vehicleRecordId !== 'string' || !validMeshIds.has(row.vehicleRecordId)) {
      throw Error(`Wheel entry references unknown vehicleRecordId: ${String(row.vehicleRecordId)}`);
    }
    const vehicleRecordId = row.vehicleRecordId;
    if (wheelsByRecordId.has(vehicleRecordId)) throw Error(`Duplicate wheel record for: ${vehicleRecordId}`);

    const rim = parseWheelTexture(root, row.rim, 'rim', texturesBySha);
    const tyre = parseWheelTexture(root, row.tyre, 'tyre', texturesBySha);

    wheelsByRecordId.set(vehicleRecordId, {
      vehicleRecordId,
      rim: { ...rim.metadata },
      tyre: { ...tyre.metadata },
    });
  }

  for (const registered of texturesBySha.values()) {
    totalBytes += registered.metadata.byteLength;
  }
  if (totalBytes > 256_000_000) throw Error('Vehicle wheels catalog budget exceeded');

  return {
    get size() { return wheelsByRecordId.size; },
    get(vehicleRecordId: string): VehicleWheelRecord | null {
      if (!vehicleRecordId || typeof vehicleRecordId !== 'string') return null;
      return wheelsByRecordId.get(vehicleRecordId) ?? null;
    },
    texture(sha256: string): RegisteredWheelTexture | null {
      if (!sha256 || typeof sha256 !== 'string') return null;
      return texturesBySha.get(sha256.toLowerCase()) ?? null;
    },
  };
}
