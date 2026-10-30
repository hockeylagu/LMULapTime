import { Mesh, Texture, type Object3D, type Material, type BufferGeometry } from 'three';

/** Dispose each GPU allocation once, including geometry shared by wheel parts. */
export function disposeObjects(root: Object3D): void {
  const materials = new Set<Material>(), geometries = new Set<BufferGeometry>(), textures = new Set<Texture>();
  root.traverse(object => {
    if (object instanceof Mesh || 'isLineSegments' in object) {
      const renderable = object as Mesh;
      if (renderable.geometry) geometries.add(renderable.geometry);
      for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) materials.add(material);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => {
    if ('map' in material && material.map instanceof Texture) textures.add(material.map as Texture);
    material.dispose();
  });
  textures.forEach(texture => texture.dispose());
}
