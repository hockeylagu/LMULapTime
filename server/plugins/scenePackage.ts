import type { TrackBoundaryGeometry } from '../../shared/types/trackGeometry.js';
import type { TrackScene } from '../../shared/types/scenes/trackScene.js';
import { registerMeshAsset, type RegisteredMesh } from './meshAsset.js';

export function loadScenePackage(root: string, catalog: unknown, geometry: (key: string) => TrackBoundaryGeometry | null): Map<string, RegisteredMesh<TrackScene>> {
  if (!Array.isArray(catalog) || !catalog.length || catalog.length > 100) throw Error('Invalid scene catalog');
  const result = new Map<string, RegisteredMesh<TrackScene>>();
  // Layouts of one venue often share every triangle: their rows name one file, read and counted once.
  const files = new Map<string, RegisteredMesh>();
  let totalBytes = 0;
  for (const value of catalog as unknown[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid scene metadata');
    const row = value as TrackScene;
    const allowed = new Set(['schemaVersion', 'layoutKey', 'coordinates', 'sourceGeometryRevision', 'revision', 'asset', 'sha256', 'byteLength', 'bounds', 'triangles', 'coverage']);
    if (Object.keys(row).some(key => !allowed.has(key)) || row.schemaVersion !== 1 || row.coordinates !== 'lmu-local-xyz-metres' || (row.coverage !== 'surfaces' && row.coverage !== 'surfaces+barriers') || typeof row.layoutKey !== 'string' || typeof row.asset !== 'string' || !row.asset.endsWith('.glb') || !/^[a-f0-9]{64}$/.test(row.sha256) || row.revision !== `scene-${row.sha256}`) throw Error('Invalid scene contract');
    const track = geometry(row.layoutKey);
    if (!track || track.geometryRevision !== row.sourceGeometryRevision || result.has(row.layoutKey)) throw Error('Scene geometry mismatch');
    const shared = files.get(row.asset);
    if (shared && JSON.stringify([shared.metadata.sha256, shared.metadata.byteLength, shared.metadata.triangles, shared.metadata.bounds]) !== JSON.stringify([row.sha256, row.byteLength, row.triangles, row.bounds])) throw Error('Scene asset conflict');
    if (!shared) {
      files.set(row.asset, registerMeshAsset(root, row));
      totalBytes += row.byteLength;
      if (totalBytes > 512_000_000) throw Error('Scene budget exceeded');
    }
    result.set(row.layoutKey, {metadata: structuredClone(row), file: files.get(row.asset)!.file});
  }
  return result;
}

