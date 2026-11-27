import { expect, it } from 'vitest';
import { Color, Texture, type Matrix3, type Vector4 } from 'three';
import { carMapPart, carStandardPart } from '../../../../../src/components/replay/view3d/car/carStandardSurface.js';
import { composedCutOut, composedGhost, composedMaterial, composedTextures } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { litTemplate } from '../../../../../src/components/replay/view3d/shaders/litTemplate.js';

it("reads a car's albedo map on its UV set by weight, through the texture's own transform, as its own texture and cut-out", () => {
  const map = new Texture(), second = new Texture();
  map.repeat.set(4, 2); second.channel = 2;
  const material = composedMaterial(litTemplate, [carMapPart(map, false)]), other = composedMaterial(litTemplate, [carMapPart(second, false)]);
  expect((material.uniforms.carMap_uv.value as Vector4).toArray()).toEqual([1, 0, 0, 0]);
  expect((other.uniforms.carMap_uv.value as Vector4).toArray()).toEqual([0, 0, 1, 0]);
  // One program whichever set a map reads.
  expect(other.customProgramCacheKey()).toBe(material.customProgramCacheKey());
  // The transform three refreshes for its own materials: the repeat, read at the draw.
  expect((material.uniforms.carMap_transform.value as Matrix3).elements[0]).toBe(4);
  map.repeat.set(8, 2);
  expect((material.uniforms.carMap_transform.value as Matrix3).elements[0]).toBe(8);
  expect(composedTextures(material)).toEqual([map]);
  // Cut out where it is read: its UV set's weights and its transform, the material's own uniforms.
  const cut = composedCutOut(material)!;
  expect([cut.map, cut.uvSets, cut.transform]).toEqual([material.uniforms.map, material.uniforms.carMap_uv, material.uniforms.carMap_transform]);
  expect(cut.transform).toBe(material.uniforms.carMap_transform);
  expect([cut.scale.value.toArray(), cut.shift.value.toArray()]).toEqual([[1, 1], [0, 0]]);
  expect(material.fragmentShader).toContain('diffuseColor *= texture2D( map, vCarMapUv );');
  expect(composedMaterial(litTemplate, [carMapPart(map, true)]).fragmentShader).toContain('diffuseColor *= focusTexture(map, focus_map, vCarMapUv);');
  expect(() => carMapPart(Object.assign(new Texture(), {channel: 4}), false)).toThrow('reads UV set 4');
});

it("draws a car part on three's standard model by its own colour, finish and emission, a ghost rougher and without metal", () => {
  const values = {colour: new Color(0.5, 0.25, 1), roughness: 0.3, metalness: 0.8};
  const plain = composedMaterial(litTemplate, [carStandardPart(values)]), glowing = composedMaterial(litTemplate, [carStandardPart({...values, emissive: new Color(1, 0, 0)})]);
  expect([plain.uniforms.diffuse.value, plain.uniforms.roughness.value, plain.uniforms.metalness.value]).toEqual([values.colour, 0.3, 0.8]);
  expect(plain.fragmentShader).toContain('roughnessFactor = roughness;'); expect(plain.fragmentShader).not.toContain('totalEmissiveRadiance = emissive;');
  expect(glowing.fragmentShader).toContain('totalEmissiveRadiance = emissive;');
  // Values in uniforms: two finishes, one program.
  expect(composedMaterial(litTemplate, [carStandardPart({...values, roughness: 0.9})]).customProgramCacheKey()).toBe(plain.customProgramCacheKey());
  composedGhost(plain);
  expect([plain.uniforms.roughness.value, plain.uniforms.metalness.value]).toEqual([0.7, 0]);
  expect(() => carStandardPart({...values, roughness: Number.NaN})).toThrow('not finite');
});
