export interface TrackTextureMetadata {
  layoutKey: string;
  textureKey: string;
  material?: string;
  asset: string;
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
  revision: string;
}

export interface TrackTextureResource extends Omit<TrackTextureMetadata, 'asset'> {
  packageRevision: string;
}
