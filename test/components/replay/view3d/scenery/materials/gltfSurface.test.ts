import { describe, expect, it } from 'vitest';
import { BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Texture, type Matrix3 } from 'three';
import { hazePart } from '../../../../../../src/components/replay/view3d/atmosphere/haze.js';
import { configureSurfaceMaterial, createSharedSurfaceMaterials } from '../../../../../../src/components/replay/view3d/scenery/materials/configureSurfaceMaterial.js';
import { gltfSurfaceMaterial } from '../../../../../../src/components/replay/view3d/scenery/materials/gltfSurface.js';
import { composedCutOut, composedParts, composedTextures } from '../../../../../../src/components/replay/view3d/shaders/composer.js';
import { plainSurfacePart } from '../../../../../../src/components/replay/view3d/shaders/plainSurface.js';

describe('glTF scenery materials without a surface description', () => {
  it("draws the material's colour, map, roughness, metalness and emission on the plain lit program, hazed", () => {
    const map = new Texture();
    map.repeat.set(2, 3);
    const glb = new MeshStandardMaterial({ color: new Color(0.5, 0.25, 1), roughness: 0.3, metalness: 0.6, map, emissive: new Color(1, 0, 0), emissiveIntensity: 2 });
    const material = gltfSurfaceMaterial(glb);
    expect(composedParts(material)?.map(part => part.name)).toEqual(['plainSurface', 'gltfSurface', 'haze']);
    expect(composedParts(material)?.[0]).toBe(plainSurfacePart); expect(composedParts(material)?.[2]).toBe(hazePart);
    const u = material.uniforms;
    expect((u.plain_colour.value as Color).toArray()).toEqual([0.5, 0.25, 1]);
    expect([u.plain_roughness.value, u.plain_metalness.value, u.plain_environment.value]).toEqual([0.3, 0.6, 1]);
    expect((u.gltf_emissive.value as Color).toArray()).toEqual([2, 0, 0]);
    expect(u.gltf_map.value).toBe(map);
    expect((u.gltf_mapTransform.value as Matrix3).elements.slice(0, 5).map(v => v + 0)).toEqual([2, 0, 0, 0, 3]);
    expect(composedTextures(material)).toEqual([map]);
    // The shadow pass cuts it by its map on its UV set through its transform, as it is drawn.
    const cut = composedCutOut(material)!;
    expect([cut.map, cut.transform]).toEqual([u.gltf_map, u.gltf_mapTransform]); expect(cut.transform).toBe(u.gltf_mapTransform);
    expect([cut.uvSets.value.toArray(), cut.scale.value.toArray(), cut.shift.value.toArray()]).toEqual([[1, 0, 0, 0], [1, 1], [0, 0]]);
    const second = new Texture(); second.channel = 1;
    expect(composedCutOut(gltfSurfaceMaterial(new MeshStandardMaterial({ map: second })))?.uvSets.value.toArray()).toEqual([0, 1, 0, 0]);
    expect(material.fragmentShader).toContain('diffuseColor *= texture2D( gltf_map, vGltfMapUv );');
    expect(material.fragmentShader.indexOf('texture2D( gltf_map')).toBeLessThan(material.fragmentShader.indexOf('#include <color_fragment>'));
    expect(material.fragmentShader.indexOf('#include <color_fragment>')).toBeLessThan(material.fragmentShader.indexOf('#include <alphatest_fragment>'));
  });
  it('keeps its own state, draws once with both sides, and is built once for every mesh that shares it', () => {
    const glb = new MeshStandardMaterial({ transparent: true, side: DoubleSide, alphaTest: 0.4, vertexColors: true });
    const material = gltfSurfaceMaterial(glb);
    expect([material.transparent, material.side, material.alphaTest, material.vertexColors, material.forceSinglePass, material.fog]).toEqual([true, DoubleSide, 0.4, true, true, false]);
    expect(gltfSurfaceMaterial(glb)).toBe(material);
    const plain = gltfSurfaceMaterial(new MeshStandardMaterial());
    expect(plain.uniforms).not.toHaveProperty('gltf_map'); expect(composedCutOut(plain)).toBeNull();
    expect(plain.customProgramCacheKey()).not.toBe(gltfSurfaceMaterial(new MeshStandardMaterial({ map: new Texture() })).customProgramCacheKey());
  });
  it('throws for a map the plain program does not draw, or a material other than the standard one', () => {
    expect(() => gltfSurfaceMaterial(new MeshStandardMaterial({ normalMap: new Texture() }))).toThrow('has a normalMap');
    expect(() => gltfSurfaceMaterial(new MeshPhysicalMaterial())).toThrow('is not a standard material');
    expect(() => gltfSurfaceMaterial(new MeshBasicMaterial())).toThrow('is not a standard material');
    const uv2 = new Texture(); uv2.channel = 2;
    expect(() => gltfSurfaceMaterial(new MeshStandardMaterial({ map: uv2 }))).toThrow('UV set 2');
  });
  it('replaces the glTF material of a scenery mesh, and leaves an already composed one', async () => {
    const glb = new MeshStandardMaterial(), mesh = new Mesh(new BufferGeometry(), glb), shared = createSharedSurfaceMaterials();
    await configureSurfaceMaterial(mesh, { load: () => Promise.reject(Error('no maps')) }, shared);
    const drawn = mesh.material;
    expect(composedParts(drawn)).not.toBeNull();
    await configureSurfaceMaterial(mesh, { load: () => Promise.reject(Error('no maps')) }, shared);
    expect(mesh.material).toBe(drawn);
  });
});
