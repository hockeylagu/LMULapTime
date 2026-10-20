import fs from 'node:fs/promises';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import type { LiveCaptureManifest } from '../../../../shared/types/liveCapture.js';

/** Only completed attempts can move: interrupted attempts may still resume by filename. */
export function resolvedCaptureFilename(manifest: LiveCaptureManifest): string {
  if (manifest.status !== 'completed' || !manifest.layoutKey || !manifest.filename.startsWith('unresolved_')) return manifest.filename;
  const layout = manifest.layoutKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${layout}_${manifest.filename.slice('unresolved_'.length)}`;
}

/** Caller must release every recording/read handle before moving this file. */
export async function finalizeCaptureFilename(
  directory: string, manifest: LiveCaptureManifest, physicalFilename = manifest.filename,
): Promise<LiveCaptureManifest> {
  const filename = resolvedCaptureFilename(manifest);
  if (filename === manifest.filename) return manifest;
  const root = path.resolve(directory);
  const source = path.resolve(root, physicalFilename);
  const target = path.resolve(root, filename);
  if (path.dirname(source) !== root || path.dirname(target) !== root) throw new Error('Live capture rename escaped its directory');
  if (physicalFilename !== manifest.filename && physicalFilename !== filename) throw new Error('Unexpected live capture rename source');
  const info = await fs.lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Live capture rename source must be a regular file');
  const moved = source !== target;
  if (moved) {
    const collision = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (collision) throw new Error('Resolved live capture filename already exists');
    await fs.rename(source, target);
  }
  const updated = { ...manifest, filename };
  // If the process exits after the move, discovery recognizes this exact filename transition.
  const database = await DuckDBInstance.create(target);
  try {
    const connection = await database.connect();
    try {
      await connection.run('BEGIN TRANSACTION');
      try {
        await connection.run('UPDATE capture_manifest SET manifest_json = CAST(? AS JSON) WHERE singleton = TRUE AND recording_id = ?',
          [JSON.stringify(updated), manifest.recordingId]);
        await connection.run("UPDATE capture_metadata SET value = ? WHERE key = 'filename'", [filename]);
        await connection.run('COMMIT');
      } catch (error: unknown) {
        try { await connection.run('ROLLBACK'); } catch { /* Preserve the metadata error. */ }
        throw error;
      }
      await connection.run('CHECKPOINT');
    } finally { connection.closeSync(); }
  } finally { database.closeSync(); }
  return updated;
}
