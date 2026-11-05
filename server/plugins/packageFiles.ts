import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** A content-addressed package file: registered at load (existence and size). */
export interface PackageFile { relative: string; file: string; sha256: string; byteLength: number }

/** Containment is checked again on every read: replacing a junction cannot change the resource. */
function contained(root: string, relative: string): string {
  if (!relative || path.isAbsolute(relative) || relative.includes(':') || relative.split('/').some(part => !part || part === '.' || part === '..')) throw Error('Invalid package resource path');
  const file = fs.realpathSync(path.join(root, relative)), escaped = path.relative(root, file);
  if (escaped.startsWith('..') || path.isAbsolute(escaped)) throw Error('Escaping package resource');
  return file;
}

/**
 * Registers a file the catalog names. Startup checks existence, type and size only: a layout holds hundreds of MB. Scenery and
 * car files are then served as is (`dataPluginRoutes.ts`); only the small files read at load go through `readPackageFile`.
 */
export function registerPackageFile(root: string, relative: string, sha256: string, byteLength: number | null, maxBytes: number): PackageFile {
  const file = contained(root, relative), stat = fs.statSync(file);
  if (!stat.isFile() || (byteLength !== null && stat.size !== byteLength) || stat.size > maxBytes) throw Error(`Package file differs from its catalog size: ${relative}`);
  return { relative, file, sha256, byteLength: stat.size };
}

export function readPackageFile(root: string, entry: PackageFile): Buffer {
  if (contained(root, entry.relative) !== entry.file || fs.statSync(entry.file).size !== entry.byteLength) throw Error('Package resource changed');
  const bytes = fs.readFileSync(entry.file);
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw Error('Package resource changed');
  return bytes;
}
