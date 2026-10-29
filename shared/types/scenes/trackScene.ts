/** Local render geometry; never a substitute for analytical road or timing data. */
import type { MeshAsset } from './meshAsset.js';

export interface TrackScene extends MeshAsset {
  schemaVersion: 1;
  layoutKey: string;
  coordinates: 'lmu-local-xyz-metres';
  sourceGeometryRevision: string;
  /** Never buildings or textures. `surfaces+barriers` adds collision-proxy barriers as the kinds barrier, tyreBarrier and tecpro. */
  coverage: 'surfaces' | 'surfaces+barriers';
}

export interface TrackSceneResource extends Omit<TrackScene, 'asset'> {
  packageRevision: string;
}
