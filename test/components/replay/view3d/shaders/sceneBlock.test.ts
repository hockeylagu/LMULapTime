import { DynamicDrawUsage, MeshStandardMaterial, Texture, Vector3, type ShaderMaterial } from 'three';
import { expect, it } from 'vitest';
import { contactShadowQuad } from '../../../../../src/components/replay/view3d/car/carContactShadow.js';
import { carSurfaceProbe } from '../../../../../src/components/replay/view3d/car/carReflection.js';
import { numberPlateGlowPart } from '../../../../../src/components/replay/view3d/car/numberPlateGlow.js';
import { hazePart } from '../../../../../src/components/replay/view3d/atmosphere/haze.js';
import { trackLightPart } from '../../../../../src/components/replay/view3d/night/trackLightProgram.js';
import { billboardShadowMaterial } from '../../../../../src/components/replay/view3d/scenery/materials/billboardCard.js';
import { surfaceMaterial } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceProgram.js';
import type { SurfaceConfig, SurfaceMap } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';
import { composedMaterial } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { depthTemplate } from '../../../../../src/components/replay/view3d/shaders/depthTemplate.js';
import { litTemplate } from '../../../../../src/components/replay/view3d/shaders/litTemplate.js';
import { plainSurfaceMaterial } from '../../../../../src/components/replay/view3d/shaders/plainSurface.js';
import {
  blockLayout, PASS_BLOCK, passValues, SCENE_BLOCK, SCENE_BLOCK_GROUPS, SCENE_BLOCKS_GLSL, sceneBlock, sceneValue, setPass, setScene, withPass,
} from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';
import { unlitTemplate } from '../../../../../src/components/replay/view3d/shaders/unlitTemplate.js';
import { surface } from '../scenery/surfaceFixture.js';

it('lays a block out by std140: a vec3 aligned as a vec4 with a float in its last lane, vec2 on 8 bytes, arrays and matrices on 16', () => {
  const layout = blockLayout('Probe', [
    {name: 'a', type: 'float'}, {name: 'b', type: 'vec3'}, {name: 'c', type: 'float'}, {name: 'd', type: 'vec2'}, {name: 'e', type: 'vec4', count: 2},
    {name: 'f', type: 'mat3'}, {name: 'g', type: 'float'}, {name: 'h', type: 'vec2'}, {name: 'i', type: 'mat4', count: 2}, {name: 'j', type: 'vec3'},
  ] as const);
  // In floats: a 0; b at the next vec4 (4); c right after b's three (7); d on its 2-float boundary (8); e at 12, two vec4s; f, three vec4
  // columns from 20; g at 32; h at 34; i at 36, two mat4s; j at 68; the block rounded up to whole vec4s.
  expect(layout.offsets).toEqual({a: 0, b: 4, c: 7, d: 8, e: 12, f: 20, g: 32, h: 34, i: 36, j: 68});
  expect(layout.floats).toBe(72);
  expect(layout.glsl).toBe(['layout(std140) uniform Probe {', '  highp float a;', '  highp vec3 b;', '  highp float c;', '  highp vec2 d;', '  highp vec4 e[ 2 ];',
    '  highp mat3 f;', '  highp float g;', '  highp vec2 h;', '  highp mat4 i[ 2 ];', '  highp vec3 j;', '};'].join('\n'));
});

it('refuses an array of floats or vec3s, an empty array and a member declared twice', () => {
  expect(() => blockLayout('X', [{name: 'a', type: 'float', count: 4}])).toThrow('declare it as vec4');
  expect(() => blockLayout('X', [{name: 'a', type: 'vec3', count: 4}])).toThrow('declare it as vec4');
  expect(() => blockLayout('X', [{name: 'a', type: 'vec4', count: 0}])).toThrow('has 0 elements');
  expect(() => blockLayout('X', [{name: 'a', type: 'float'}, {name: 'a', type: 'vec2'}])).toThrow('declares a twice');
});

it('keeps the scene block within WebGL 2’s guaranteed block size, its arrays at the shaders’ sizes and its members apart', () => {
  expect(SCENE_BLOCK.floats * 4).toBeLessThanOrEqual(16384);
  expect(SCENE_BLOCK.glsl).toContain('highp mat4 surface_cascadeMatrices[ 8 ];');
  expect(SCENE_BLOCK.glsl).toContain('highp vec4 trackLight_near[ 64 ];');
  expect(SCENE_BLOCK.glsl).toContain('highp vec4 carSpot_spots[ 80 ];'); expect(SCENE_BLOCK.glsl).toContain('highp vec4 carSpot_owners[ 40 ];');
  // Every member on its boundary, none overlapping the next.
  const members = [...SCENE_BLOCK.glsl.matchAll(/highp (\w+) (\w+)(?:\[ (\d+) \])?;/g)].map(([, type, name, count]) => ({type, name, count: Number(count ?? 1)}));
  const size = {float: 1, vec2: 2, vec3: 3, vec4: 4, mat3: 12, mat4: 16} as Record<string, number>;
  const offsets = SCENE_BLOCK.offsets as Record<string, number>;
  members.forEach(({type, name, count}, i) => {
    expect(offsets[name] % (type === 'float' ? 1 : type === 'vec2' ? 2 : 4)).toBe(0);
    const next = members[i + 1];
    if (next) expect(offsets[name] + size[type] * count).toBeLessThanOrEqual(offsets[next.name]);
  });
  expect(sceneBlock.length).toBe(SCENE_BLOCK.floats);
});

it('starts the scene block lit from above by day, unturned, the haze height term at exponent 1 and the assumed rubber', () => {
  expect([...sceneBlock.subarray(SCENE_BLOCK.offsets.lit_sunDirection, SCENE_BLOCK.offsets.lit_sunDirection + 3)]).toEqual([0, 1, 0]);
  expect([sceneValue('lit_dayLight'), sceneValue('HAZE_HEIGHT_EXPONENT')]).toEqual([1, 1]);
  expect(sceneValue('surface_realRoadMedian')).toBeCloseTo(51 / 255, 6);
  const rotation = SCENE_BLOCK.offsets.lit_environmentRotation;
  expect([...sceneBlock.subarray(rotation, rotation + 12)]).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  setScene('surface_time', 12.5); expect(sceneValue('surface_time')).toBe(12.5);
  setScene('surface_cardFacing', [1, 0, 0, 1]);
  expect([...sceneBlock.subarray(SCENE_BLOCK.offsets.surface_cardFacing, SCENE_BLOCK.offsets.surface_cardFacing + 4)]).toEqual([1, 0, 0, 1]);
});

it('packs the pass block as four floats written in place, and puts back what a pass changed', () => {
  expect(PASS_BLOCK.offsets).toEqual({surface_alphaCut: 0, lit_environmentIntensity: 1, surface_emission: 2, carSpot_shown: 3});
  expect(PASS_BLOCK.floats).toBe(4);
  const value = SCENE_BLOCK_GROUPS[1].uniforms[0] as {value: unknown};
  const block = value.value as Float32Array;
  expect(block).toBeInstanceOf(Float32Array); expect(block.length).toBe(4);
  expect(passValues()).toEqual({surface_alphaCut: 1, lit_environmentIntensity: 1, surface_emission: 1, carSpot_shown: 1});
  let during = passValues();
  withPass({surface_alphaCut: 0}, () => { during = passValues(); });
  expect(during.surface_alphaCut).toBe(0); expect(passValues().surface_alphaCut).toBe(1);
  expect(() => withPass({carSpot_shown: 0}, () => { throw Error('lost context'); })).toThrow('lost context');
  expect(passValues().carSpot_shown).toBe(1);
  setPass({surface_emission: 0}); expect([...block]).toEqual([1, 1, 0, 1]); setPass({surface_emission: 1});
  expect(value.value).toBe(block);
});

it('puts back only the values a pass set, also when its draw throws', () => {
  // A value the draw writes to another member (the capture's emission, the environment intensity) outlives the pass.
  withPass({carSpot_shown: 0}, () => setPass({surface_emission: 0}));
  expect(passValues()).toEqual({surface_alphaCut: 1, lit_environmentIntensity: 1, surface_emission: 0, carSpot_shown: 1});
  expect(() => withPass({surface_alphaCut: 0}, () => { setPass({lit_environmentIntensity: 0}); throw Error('lost context'); })).toThrow('lost context');
  expect(passValues()).toEqual({surface_alphaCut: 1, lit_environmentIntensity: 0, surface_emission: 0, carSpot_shown: 1});
  setPass({lit_environmentIntensity: 1, surface_emission: 1});
});

it('gives three two dynamic groups, each one typed array, named as the GLSL declares them', () => {
  // three binds each by its name (getUniformBlockIndex), which its type does not list.
  expect(SCENE_BLOCK_GROUPS.map(group => (group as typeof group & {name: string}).name)).toEqual(['LmuScene', 'LmuScenePass']);
  expect(SCENE_BLOCK_GROUPS.map(group => group.uniforms.length)).toEqual([1, 1]);
  expect(SCENE_BLOCK_GROUPS.map(group => group.usage)).toEqual([DynamicDrawUsage, DynamicDrawUsage]);
  expect((SCENE_BLOCK_GROUPS[0].uniforms[0] as {value: unknown}).value).toBe(sceneBlock);
  expect(SCENE_BLOCKS_GLSL).toBe(`${SCENE_BLOCK.glsl}\n${PASS_BLOCK.glsl}\n`);
  expect(PASS_BLOCK.glsl).toBe('layout(std140) uniform LmuScenePass {\n  highp float surface_alphaCut;\n  highp float lit_environmentIntensity;\n  highp float surface_emission;\n  highp float carSpot_shown;\n};');
});

it('declares both blocks first in both stages of every template, and binds every material on them to the same two groups', () => {
  for (const template of [litTemplate, unlitTemplate, depthTemplate]) {
    const material = composedMaterial(template, []);
    expect(material.vertexShader.trimStart().startsWith(SCENE_BLOCK.glsl)).toBe(true);
    expect(material.fragmentShader.trimStart().startsWith(SCENE_BLOCK.glsl)).toBe(true);
    for (const stage of [material.vertexShader, material.fragmentShader]) expect(stage.split(SCENE_BLOCKS_GLSL).length).toBe(2);
    expect(material.uniformsGroups).toEqual(SCENE_BLOCK_GROUPS);
    expect(material.uniformsGroups[0]).toBe(SCENE_BLOCK_GROUPS[0]); expect(material.uniformsGroups).not.toBe(SCENE_BLOCK_GROUPS);
  }
});

/** The block members: GLSL puts them in the global scope, so a program that declared one again would not compile. */
const MEMBERS = [...Object.keys(SCENE_BLOCK.offsets), ...Object.keys(PASS_BLOCK.offsets)];
const map = (texture: string): SurfaceMap => ({texture, uv: 'uv0', scale: [1, 1], srgb: true});
const scenery = (config: SurfaceConfig) => surfaceMaterial(new MeshStandardMaterial(), config, Object.fromEntries(Object.keys(config.maps).map(key => [key, new Texture()])));

it('declares no block member again, nor gives one as a material uniform, in any composed program', () => {
  const materials: ShaderMaterial[] = [
    plainSurfaceMaterial({colour: 0xffffff, roughness: 1, metalness: 0, environment: 1}), contactShadowQuad(1, 2).material, billboardShadowMaterial(),
    scenery(surface('standard', {maps: {albedo: map('A')}, flags: {emissive: 'night'}})), scenery(surface('terrain', {maps: {layerA: map('A'), splatter: map('S')}, flags: {layers: '1'}})),
    scenery(surface('highLumTrackside', {maps: {albedo: map('A')}})), scenery(surface('dashboard', {maps: {albedo: map('A')}})),
    scenery(surface('digitalFlag', {maps: {on: map('A'), off: map('B')}})), scenery(surface('vegetation', {maps: {albedo: map('A')}, flags: {translucency: 'on'}, billboard: true})),
    scenery(surface('road', {maps: {albedo: map('A')}, flags: {decalBlend: 'addSub', ambientOcclusion: 'local', groove: 'trackAverage'}})),
    composedMaterial(litTemplate, [trackLightPart('near', {omni: '1.0', spot: '1.0', cockpit: 'cockpitLightTerm(vec3(0.0),1.0,vec3(1.0),lampPoint,lampNormal)'}),
      numberPlateGlowPart({colour: new Vector3(1, 1, 1), switchU: 0.5, nightOnly: true}, false), ...carSurfaceProbe(true, true).parts, hazePart]),
  ];
  for (const material of materials) {
    for (const stage of [material.vertexShader, material.fragmentShader]) {
      const own = stage.split(SCENE_BLOCKS_GLSL).join('');
      for (const name of MEMBERS) expect(own).not.toMatch(new RegExp(`uniform\\s+\\w+\\s+[^;]*\\b${name}\\b`));
    }
    for (const name of MEMBERS) expect(material.uniforms).not.toHaveProperty(name);
    expect(material.uniformsGroups).toEqual(SCENE_BLOCK_GROUPS);
  }
});
