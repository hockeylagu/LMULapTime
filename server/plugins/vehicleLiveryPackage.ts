import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { VehicleLiveryMetadata } from '../../shared/types/scenes/vehicleLivery.js';

export interface RegisteredVehicleLivery {
  metadata: VehicleLiveryMetadata;
  file: string;
}

export interface VehicleLiveriesStore {
  readonly size: number;
  resolve(vehicleId: string): RegisteredVehicleLivery | null;
  get(key: string, revision: string): RegisteredVehicleLivery | null;
}

function fileAt(root: string, asset: string): string {
  if (!/^vehicle-liveries\/[a-zA-Z0-9_.-]+\.webp$/i.test(asset)) throw Error('Invalid vehicle livery asset path');
  const file = fs.realpathSync(path.join(root, asset)), relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Escaping vehicle livery asset');
  return file;
}

export function readVehicleLivery(root: string, row: RegisteredVehicleLivery): Buffer {
  const { metadata } = row;
  if (fileAt(root, metadata.asset) !== row.file) throw Error('Vehicle livery image changed');
  const stat = fs.statSync(row.file);
  if (!stat.isFile() || stat.size !== metadata.byteLength || stat.size > 20_000_000) throw Error('Vehicle livery budget exceeded');
  const bytes = fs.readFileSync(row.file);
  if (createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw Error('Vehicle livery hash mismatch');
  if (bytes.length < 16
    || bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
    || bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
    || !['VP8 ', 'VP8L', 'VP8X'].includes(bytes.subarray(12, 16).toString('ascii'))) {
    throw Error('Invalid WebP livery file');
  }
  return bytes;
}

export function loadVehicleLiveryPackage(
  root: string,
  value: unknown,
  vehicleMeshes: Map<string, unknown> | Set<string>
): VehicleLiveriesStore {
  if (!Array.isArray(value)) throw Error('Invalid vehicle liveries catalog: expected array');
  const liveriesMap = new Map<string, RegisteredVehicleLivery>();
  const byVehicleId = new Map<string, RegisteredVehicleLivery>();
  const validMeshIds = vehicleMeshes instanceof Set ? vehicleMeshes : new Set(vehicleMeshes.keys());
  let totalBytes = 0;

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('Invalid livery entry');
    const row = item as Record<string, unknown>;
    const allowed = new Set(['liveryKey', 'vehicleRecordId', 'vehicleIds', 'asset', 'width', 'height', 'byteLength', 'sha256', 'revision']);
    if (typeof row.liveryKey !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(row.liveryKey)) throw Error('Invalid livery key');
    const liveryKey = row.liveryKey;
    if (Object.keys(row).some(k => !allowed.has(k))) throw Error(`Unknown livery field in ${liveryKey}`);

    if (typeof row.vehicleRecordId !== 'string' || !validMeshIds.has(row.vehicleRecordId)) {
      throw Error(`Livery ${liveryKey} references unknown vehicleRecordId: ${String(row.vehicleRecordId)}`);
    }
    const vehicleRecordId = row.vehicleRecordId;
    if (!Array.isArray(row.vehicleIds) || !row.vehicleIds.length || row.vehicleIds.some(id => typeof id !== 'string' || !id)) {
      throw Error(`Invalid vehicleIds for livery: ${liveryKey}`);
    }
    const vehicleIds: string[] = row.vehicleIds.map(id => String(id));
    if (typeof row.asset !== 'string' || !/^vehicle-liveries\/[a-zA-Z0-9_.-]+\.webp$/i.test(row.asset)) {
      throw Error(`Invalid livery asset path: ${String(row.asset)}`);
    }
    const asset = row.asset;
    if (typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)) throw Error(`Invalid livery sha256: ${liveryKey}`);
    const sha256 = row.sha256;
    if (row.revision !== `livery-${sha256}`) throw Error(`Invalid livery revision: ${liveryKey}`);
    const revision = `livery-${sha256}`;
    if (typeof row.width !== 'number' || typeof row.height !== 'number'
      || !Number.isSafeInteger(row.width) || !Number.isSafeInteger(row.height)
      || row.width < 1 || row.width > 4096 || row.height < 1 || row.height > 4096
      || typeof row.byteLength !== 'number' || !Number.isSafeInteger(row.byteLength)
      || row.byteLength < 16 || row.byteLength > 20_000_000) {
      throw Error(`Invalid livery dimensions or byteLength: ${liveryKey}`);
    }
    const width = row.width, height = row.height, byteLength = row.byteLength;

    const registered: RegisteredVehicleLivery = {
      metadata: {
        liveryKey,
        vehicleRecordId,
        vehicleIds,
        revision,
        asset,
        width,
        height,
        byteLength,
        sha256,
      },
      file: fileAt(root, asset),
    };

    readVehicleLivery(root, registered);
    // One image may serve several mesh variants under the same key; its revision identifies the bytes.
    const assetKey = `${liveryKey.toLowerCase()}|${revision}`;
    const existing = liveriesMap.get(assetKey);
    if (existing && existing.file !== registered.file) throw Error(`Conflicting livery asset: ${liveryKey}`);
    liveriesMap.set(assetKey, registered);

    for (const vid of vehicleIds) {
      const normalized = vid.trim().replace(/\.veh$/i, '').toUpperCase();
      if (byVehicleId.has(normalized)) throw Error(`Vehicle ${normalized} has more than one livery`);
      byVehicleId.set(normalized, registered);
    }

    totalBytes += byteLength;
    if (totalBytes > 256_000_000) throw Error('Vehicle liveries catalog budget exceeded');
  }

  return {
    get size() { return liveriesMap.size; },
    get(key: string, revision: string): RegisteredVehicleLivery | null {
      return liveriesMap.get(`${key.toLowerCase()}|${revision}`) ?? null;
    },
    resolve(vehicleId: string): RegisteredVehicleLivery | null {
      if (!vehicleId || typeof vehicleId !== 'string') return null;
      const normalized = vehicleId.trim().replace(/\.veh$/i, '').toUpperCase();
      return byVehicleId.get(normalized) ?? null;
    },
  };
}
