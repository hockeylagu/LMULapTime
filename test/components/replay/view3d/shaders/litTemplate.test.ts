import { ShaderChunk, ShaderLib, ShaderMaterial, Texture, Vector2 } from 'three';
import { expect, it } from 'vitest';
import { composedMaterial, composeShader } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { litTemplate, ownEnvironment, setOwnEnvironment } from '../../../../../src/components/replay/view3d/shaders/litTemplate.js';
import { SCENE_BLOCK_GROUPS } from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';
import { ENVIRONMENT_DEFINES, sceneEnvironmentMap } from '../../../../../src/components/replay/view3d/shaders/sceneLight.js';

const includes = (source: string) => [...source.matchAll(/#include <(\w+)>/g)].map(match => match[1]);
const lines = (source: string) => source.split('\n').map(line => line.trim()).filter(Boolean);

it("uses three's chunks unchanged, never its light loop, and redefines no light model macro", () => {
  const {vertexShader, fragmentShader} = composeShader(litTemplate, []);
  expect(includes(vertexShader)).toEqual(['common', 'batching_pars_vertex', 'color_pars_vertex', 'normal_pars_vertex', 'color_vertex', 'batching_vertex',
    'beginnormal_vertex', 'defaultnormal_vertex', 'normal_vertex', 'begin_vertex', 'project_vertex']);
  expect(includes(fragmentShader)).toEqual(['common', 'dithering_pars_fragment', 'color_pars_fragment', 'alphatest_pars_fragment',
    'envmap_physical_pars_fragment', 'normal_pars_fragment', 'lights_physical_pars_fragment', 'color_fragment', 'normal_fragment_begin', 'clearcoat_normal_fragment_begin',
    'lights_physical_fragment', 'opaque_fragment',
    'tonemapping_fragment', 'colorspace_fragment', 'premultiplied_alpha_fragment', 'dithering_fragment']);
  expect(fragmentShader).not.toMatch(/#(define|undef) RE_/);
  expect(fragmentShader).not.toContain('RE_Direct(');
});

it("lights as three's standard material under one directional light and the environment: three's own lines, in three's order", () => {
  const {fragmentShader} = composeShader(litTemplate, []), own = lines(fragmentShader);
  // The geometry and the energy terms three's loop sets up for a standard material under a directional light.
  const loop = ['vec3 geometryPosition = - vViewPosition;', 'vec3 geometryNormal = normal;', 'vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );',
    'float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );', 'material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;',
    'float EssMs = material.dfg.x + material.dfg.y;', 'material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );'];
  for (const line of loop) { expect(lines(ShaderChunk.lights_fragment_begin)).toContain(line); expect(own).toContain(line); }
  expect(lines(ShaderChunk.lights_fragment_maps)).toContain('iblIrradiance += getIBLIrradiance( geometryNormal );');
  // The light as three's directional light gives it, the light model's functions called by name, the sums as the standard program has them.
  expect(fragmentShader).toContain('directLight.direction = normalize( ( viewMatrix * vec4( lit_sunDirection, 0.0 ) ).xyz );');
  const order = ['directLight.color = lit_sunColour;', 'RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
    'iblIrradiance += getIBLIrradiance( geometryNormal );', 'radiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );',
    'RE_IndirectDiffuse_Physical( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
    'RE_IndirectSpecular_Physical( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
    'vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;', 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;'];
  const at = order.map(line => own.indexOf(line));
  expect(at.every(index => index >= 0)).toBe(true); expect([...at].sort((a, b) => a - b)).toEqual(at);
  for (const line of order.slice(-2)) expect(lines(ShaderLib.physical.fragmentShader)).toContain(line);
  // three's white standard material: roughness 1, metalness 0, no emission.
  expect(fragmentShader).toContain('vec4 diffuseColor = vec4( vec3( 1.0 ), opacity );');
  expect(own).toEqual(expect.arrayContaining(['float roughnessFactor = 1.0;', 'float metalnessFactor = 0.0;', 'vec3 totalEmissiveRadiance = vec3( 0.0 );']));
});

it("places the parts' code around the sun's direct term, on the environment lookup, the outgoing light and the encoded colour", () => {
  const {fragmentShader} = composeShader(litTemplate, [{name: 'probe', slots: {
    fragmentColour: {at: 0, glsl: 'COLOUR;'}, fragmentSunLight: {at: 0, glsl: 'SUN_LIGHT;'}, fragmentSunDirect: {at: 0, glsl: 'SUN_DIRECT;'},
    fragmentIrradiance: {at: 0, glsl: 'IRRADIANCE;'}, fragmentLight: {at: 0, glsl: 'OUTGOING;'}, fragmentOutput: {at: 0, glsl: 'OUTPUT;'},
  }}]);
  const at = (text: string) => fragmentShader.indexOf(text);
  const order = ['#include <color_fragment>', 'COLOUR;', '#include <lights_physical_fragment>', 'directLight.visible = true;', 'SUN_LIGHT;', 'RE_Direct_Physical(',
    'SUN_DIRECT;', 'vec3 iblIrradiance = vec3( 0.0 );', 'IRRADIANCE;', 'getIBLRadiance(', 'vec3 outgoingLight', 'OUTGOING;', '#include <opaque_fragment>',
    '#include <colorspace_fragment>', 'OUTPUT;', '#include <premultiplied_alpha_fragment>'].map(at);
  expect(order.every(index => index >= 0)).toBe(true); expect([...order].sort((a, b) => a - b)).toEqual(order);
  // A part's lookup replaces the template's.
  expect(fragmentShader).not.toContain('getIBLIrradiance( geometryNormal )');
});

it('reads the scene light from the blocks, the environment from a shared uniform, its own opacity and three-filled tables', () => {
  const material = composedMaterial(litTemplate, [], {opacity: 0.4}), other = composedMaterial(litTemplate, []);
  expect(material).toBeInstanceOf(ShaderMaterial); expect(material.lights).toBe(false);
  expect(material.uniformsGroups).toEqual(SCENE_BLOCK_GROUPS); expect(material.uniforms.envMap).toBe(sceneEnvironmentMap);
  for (const name of ['lit_sunDirection', 'lit_sunColour', 'envMapIntensity', 'envMapRotation', 'lit_environmentMaxLod']) expect(material.uniforms).not.toHaveProperty(name);
  expect(material.uniforms.opacity.value).toBe(0.4);
  // three fills each material's `dfgLUT`, and sets `receiveShadow` per object: a material uniform would overwrite it.
  expect(material.uniforms.dfgLUT).toEqual({value: null}); expect(material.uniforms.dfgLUT).not.toBe(other.uniforms.dfgLUT);
  expect(material.uniforms).not.toHaveProperty('receiveShadow'); expect(material.fragmentShader).toContain('uniform bool receiveShadow;');
  expect(material.defines).toEqual(ENVIRONMENT_DEFINES);
  // three's environment chunk reads its names from the blocks or the material's own environment, defined before it; its mip rule is three's.
  const pars = material.fragmentShader.indexOf('#define envMapIntensity ( lit_ownEnvironment.x > 0.5 ? 1.0 : lit_environmentIntensity )');
  expect(pars).toBeGreaterThan(0); expect(pars).toBeLessThan(material.fragmentShader.indexOf('#include <envmap_physical_pars_fragment>'));
  expect(material.fragmentShader).toContain('#define envMapRotation ( lit_ownEnvironment.x > 0.5 ? mat3( 1.0 ) : lit_environmentRotation )');
  expect(material.fragmentShader).toContain('#define ENVMAP_MAX_LOD ( lit_ownEnvironment.x > 0.5 ? lit_ownEnvironment.y : lit_environmentMaxLod )');
  for (const line of ['float r = clamp( roughness, 0.0, 1.0 );', 'return ENVMAP_MAX_LOD * r * ( 2.0 - r );', 'uniform samplerCube envMap;']) {
    expect(lines(ShaderChunk.envmap_common_pars_fragment)).toContain(line); expect(lines(material.fragmentShader)).toContain(line);
  }
  expect(material.customProgramCacheKey()).toBe(other.customProgramCacheKey());
});

it("reads the environment's reflection by three's lookups in a slot a part may fill, and corrects it in another", () => {
  const own = composeShader(litTemplate, []).fragmentShader;
  expect(own).toContain('clearcoatRadiance = getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );');
  const {fragmentShader} = composeShader(litTemplate, [{name: 'reads', slots: {fragmentRadiance: {at: 0, glsl: 'READ;'}, fragmentReflection: {at: 0, glsl: 'FIX;'}}}]);
  expect(fragmentShader).not.toContain('radiance = getIBLRadiance(');
  const at = ['vec3 clearcoatRadiance = vec3( 0.0 );', 'READ;', 'FIX;', 'RE_IndirectDiffuse_Physical('].map(text => fragmentShader.indexOf(text));
  expect(at.every(index => index >= 0)).toBe(true); expect([...at].sort((a, b) => a - b)).toEqual(at);
});

it('lights a material by an environment of its own, unturned at whole intensity, without another program, and by the scene again', () => {
  const material = composedMaterial(litTemplate, []), key = material.customProgramCacheKey(), version = material.version;
  const probe = Object.assign(new Texture(), {isPMREMTexture: true, mipmaps: Array.from({length: 8}, () => ({}))});
  expect(ownEnvironment(material)).toBeNull();
  setOwnEnvironment(material, probe);
  expect(ownEnvironment(material)).toBe(probe);
  // Whole and unturned (the template's rule for an own environment), at its own last level.
  expect(material.uniforms.envMap.value).toBe(probe); expect((material.uniforms.lit_ownEnvironment.value as Vector2).toArray()).toEqual([1, 7]);
  expect(material.uniforms.envMap).not.toBe(sceneEnvironmentMap);
  expect([material.customProgramCacheKey(), material.version, material.uniformsNeedUpdate]).toEqual([key, version, true]);
  setOwnEnvironment(material, null);
  expect(ownEnvironment(material)).toBeNull();
  expect(material.uniforms.envMap).toBe(sceneEnvironmentMap); expect((material.uniforms.lit_ownEnvironment.value as Vector2).toArray()).toEqual([0, 0]);
  expect(() => setOwnEnvironment(new ShaderMaterial(), probe)).toThrow('is not on the lit template');
});