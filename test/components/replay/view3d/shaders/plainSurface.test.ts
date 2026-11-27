import { Color, DoubleSide, MeshStandardMaterial, ShaderMaterial, type IUniform } from 'three';
import { expect, it } from 'vitest';
import { hazePart } from '../../../../../src/components/replay/view3d/atmosphere/haze.js';
import { composedMaterial, composedParts, composeShader } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { litTemplate } from '../../../../../src/components/replay/view3d/shaders/litTemplate.js';
import { isPlainSurface, plainSurfaceMaterial, plainSurfacePart, setPlainSurface } from '../../../../../src/components/replay/view3d/shaders/plainSurface.js';
import { sceneEnvironmentMap } from '../../../../../src/components/replay/view3d/shaders/sceneLight.js';

const grey = {colour: '#9aa0a6', roughness: 0.6, metalness: 0.1, environment: 1};

it('composes the lit template with the plain surface and the haze, its values in its own uniforms', () => {
  const material = plainSurfaceMaterial(grey), u = material.uniforms;
  expect(material).toBeInstanceOf(ShaderMaterial); expect(material.fog).toBe(false); expect(material.lights).toBe(false);
  expect(composedParts(material)).toEqual([plainSurfacePart, hazePart]); expect(isPlainSurface(material)).toBe(true);
  // three's standard material of the same colour holds the same linear colour as its `diffuse`.
  expect((u.plain_colour.value as Color).equals(new MeshStandardMaterial({color: grey.colour}).color)).toBe(true);
  expect([u.plain_roughness.value, u.plain_metalness.value, u.plain_environment.value]).toEqual([0.6, 0.1, 1]);
  expect(u.envMap).toBe(sceneEnvironmentMap); expect(u.HAZE_DISTANCE_SCALE.value).toBe(1);
  const other = plainSurfaceMaterial({colour: 0, roughness: 1, metalness: 0, environment: 0});
  expect(other.uniforms.plain_colour).not.toBe(u.plain_colour);
  // One program for every plain surface: no value in the source or the defines.
  expect(other.fragmentShader).toBe(material.fragmentShader); expect(other.defines).toEqual(material.defines);
  expect(other.customProgramCacheKey()).toBe(material.customProgramCacheKey());
  expect(material.customProgramCacheKey()).toBe(composeShader(litTemplate, [plainSurfacePart, hazePart]).key);
});

it("sets the colour, roughness and metalness where three's standard program reads them, and drops only the environment's light", () => {
  const {fragmentShader} = plainSurfaceMaterial(grey), at = (text: string) => fragmentShader.indexOf(text);
  const order = ['vec4 diffuseColor = vec4( vec3( 1.0 ), opacity );', 'float roughnessFactor = 1.0;', '#include <color_fragment>', 'diffuseColor.rgb *= plain_colour;',
    'roughnessFactor = plain_roughness;', 'metalnessFactor = plain_metalness;', '#include <lights_physical_fragment>', 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
    'outgoingLight -= ( 1.0 - plain_environment ) * ( reflectedLight.indirectDiffuse + reflectedLight.indirectSpecular );', '#include <opaque_fragment>',
    'float hazeFactor = 1.0 - exp('].map(at);
  expect(order.every(index => index >= 0)).toBe(true); expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(fragmentShader).toContain('uniform vec3 plain_colour;\nuniform float plain_roughness, plain_metalness, plain_environment;');
});

it("keeps the material's own state for three, and its values writable through the part only", () => {
  const material = plainSurfaceMaterial(grey, {transparent: true, opacity: 0.5, depthWrite: false, side: DoubleSide, polygonOffset: true});
  expect([material.transparent, material.depthWrite, material.side, material.polygonOffset]).toEqual([true, false, DoubleSide, true]);
  material.opacity = 0.25; expect(material.uniforms.opacity.value).toBe(0.25);
  setPlainSurface(material, {roughness: 0.7, colour: '#ffffff'});
  expect([material.uniforms.plain_roughness.value, material.uniforms.plain_metalness.value, (material.uniforms.plain_colour as IUniform<Color>).value.getHex()]).toEqual([0.7, 0.1, 0xffffff]);
  expect(() => { setPlainSurface(material, {metalness: Number.NaN}); }).toThrow('metalness is not finite');
  const lit = composedMaterial(litTemplate, []);
  expect(isPlainSurface(lit)).toBe(false); expect(isPlainSurface(new MeshStandardMaterial())).toBe(false);
  expect(() => { setPlainSurface(lit, {roughness: 1}); }).toThrow('is not a plain surface');
});
