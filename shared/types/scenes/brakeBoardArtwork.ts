/** Optional local PNG artwork, bound to exact published marker IDs and their layout revision. */
export interface BrakeBoardArtwork {
  layoutKey: string;
  sourceGeometryRevision: string;
  markerIds: string[];
  label: string;
  revision: string;
  sha256: string;
  asset: string;
  byteLength: number;
  widthPx: number;
  heightPx: number;
  widthM: number;
  heightM: number;
}

export interface BrakeBoardArtworkResource extends Omit<BrakeBoardArtwork, 'asset'> {
  packageRevision: string;
}
