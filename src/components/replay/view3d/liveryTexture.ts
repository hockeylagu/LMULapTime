import { RepeatWrapping, SRGBColorSpace, Texture } from 'three';

/**
 * Game vehicle livery textures decoded from DDS into WebP.
 * Direct vertical orientation (flipY = false) and repeat wrapping restore the body atlas.
 */
export function createLiveryTexture(image: HTMLImageElement): Texture {
  const texture = new Texture(image);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
