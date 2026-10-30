export interface MeshAsset {
  /** Optional exact on-disk layout; top-level hash, byte length and bounds describe the decoded GLB. */
  storage?: {encoding: 'ground-grid-v1'; sha256: string; byteLength: number};
  revision: string;
  asset: string;
  sha256: string;
  byteLength: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  triangles: number;
}
