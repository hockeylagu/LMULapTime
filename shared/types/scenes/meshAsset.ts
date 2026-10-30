export interface MeshAsset {
  revision: string;
  asset: string;
  sha256: string;
  byteLength: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  triangles: number;
}
