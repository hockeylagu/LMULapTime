// Copied from LMUTrackPipeline/shared/contract/manifest.ts, do not edit: change it there and run npm run package -- sync-contract.
/** The package manifest (docs/PACKAGE_FORMAT.md, Manifest): the schema, the package id and its version, nothing else. */
import {PACKAGE_SCHEMA} from './paths.js';
import {orderedKeys, record, text} from './strict.js';

export interface PackageManifest {schemaVersion: typeof PACKAGE_SCHEMA; id: string; version: string}
export const MANIFEST_KEYS = ['schemaVersion', 'id', 'version'] as const;

export const packageManifest = (version: string, id = 'personal-data'): PackageManifest => ({schemaVersion: PACKAGE_SCHEMA, id, version});

/** Refuses any other schema (before anything else is read) and any key other than the three, in this order. */
export function parseManifest(value: unknown): PackageManifest {
  const row = record(value, 'manifest');
  if (row.schemaVersion !== PACKAGE_SCHEMA) throw Error(`Unsupported package schema ${JSON.stringify(row.schemaVersion)}: only schema ${PACKAGE_SCHEMA} is read`);
  orderedKeys(row, MANIFEST_KEYS, 'manifest');
  return {schemaVersion: PACKAGE_SCHEMA, id: text(row.id, 'manifest.id', 160), version: text(row.version, 'manifest.version', 160)};
}
