import { Texture, RepeatWrapping, SRGBColorSpace, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type { LoadedTrackTexture } from '../../../api/scenes/trackTextureApi.js';

/**
 * Binds content-addressed game textures to matching surface meshes in the track GLB scene.
 * Tiled surfaces use RepeatWrapping with native UV orientation (flipY = false).
 */
export function applyTrackTextures(root: Object3D, loadedTextures: LoadedTrackTexture[]): void {
  if (!loadedTextures.length) return;

  const textureMap = new Map<string, Texture>();
  let sharedNormalTexture: Texture | null = null;

  for (const { metadata, image } of loadedTextures) {
    const tex = new Texture(image);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.flipY = false;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    if (metadata.material === 'normal' || metadata.textureKey.toLowerCase().includes('_nm')) {
      sharedNormalTexture = tex;
    } else {
      tex.colorSpace = SRGBColorSpace;
      textureMap.set(metadata.textureKey.toUpperCase(), tex);
    }
  }

  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const key = object.name.toUpperCase();
    const texture = textureMap.get(key);
    if (!texture) return;

    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(mat instanceof MeshStandardMaterial)) continue;
      mat.map = texture;
      mat.color.set('#ffffff');
      const isKerb = /curb|kerb/i.test(object.name);
      mat.roughness = isKerb ? 0.55 : 0.8;

      if (sharedNormalTexture && !isKerb) {
        mat.normalMap = sharedNormalTexture;
        mat.normalScale.set(0.6, 0.6);
      }
      mat.needsUpdate = true;
    }
  });
}
