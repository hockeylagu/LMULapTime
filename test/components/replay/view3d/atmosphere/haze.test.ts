import { Color, FogExp2, Mesh, MeshBasicMaterial, MeshStandardMaterial, Scene, ShaderChunk, ShaderMaterial, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { expect, it } from 'vitest';
import { assertHazed, createHaze, hazeProgram, isHazed } from '../../../../../src/components/replay/view3d/atmosphere/haze.js';

const shape = (originY: number) => ({originY, height: {amount: 0.5, rate: 0.01, exponent: 2}, sunDirection: new Vector3(0, 1, 0), sunRadiance: new Color(1, 1, 1), sunward: 0.3});
const program = () => ({
  uniforms: {} as Record<string, {value: unknown}>, vertexShader: '#include <fog_pars_vertex>\n#include <fog_vertex>', fragmentShader: '#include <fog_pars_fragment>\n#include <fog_fragment>',
}) as unknown as WebGLProgramParametersWithUniforms & {uniforms: Record<string, {value: unknown}>};
const compile = (material: MeshStandardMaterial | MeshBasicMaterial) => { const shader = program(); material.onBeforeCompile(shader, null as unknown as WebGLRenderer); return shader; };

it("draws each scene's own haze terms through uniforms every hazed program shares, whichever scene was built last", () => {
  const first = createHaze(shape(12)), second = createHaze(shape(-40)), material = new MeshStandardMaterial();
  hazeProgram(material);
  const {uniforms} = compile(material);
  first();
  expect(uniforms.HAZE_ORIGIN_Y.value).toBe(12);
  second();
  expect(uniforms.HAZE_ORIGIN_Y.value).toBe(-40);
  first();
  expect(uniforms.HAZE_ORIGIN_Y.value).toBe(12);
  expect([uniforms.HAZE_HEIGHT_AMOUNT.value, uniforms.HAZE_SUNWARD.value, (uniforms.HAZE_SUN_DIRECTION.value as Vector3).toArray()]).toEqual([0.5, 0.3, [0, 1, 0]]);
});

it("replaces three's fog includes with the haze, by the distance along the ray, and leaves three's chunks as they are", () => {
  const fog = ShaderChunk.fog_fragment, material = new MeshStandardMaterial();
  hazeProgram(material);
  const shader = compile(material);
  expect(shader.vertexShader).toContain('vFogDepth = length( mvPosition.xyz );');
  expect(shader.fragmentShader).toContain('1.0 - exp( - fogDensity * vFogDepth )');
  expect(shader.fragmentShader).toContain('uniform vec3 HAZE_SUN_DIRECTION, HAZE_SUN_RADIANCE;');
  expect(shader.fragmentShader).not.toContain('#include');
  expect(ShaderChunk.fog_fragment).toBe(fog);
  expect(ShaderChunk.fog_vertex).toContain('vFogDepth = - mvPosition.z;');
});

it('chains with the material\'s own compile hook and cache key, and scales the distance on request', () => {
  const material = new MeshStandardMaterial(), steps: string[] = [];
  material.onBeforeCompile = shader => { steps.push('own'); shader.fragmentShader += '// own'; };
  material.customProgramCacheKey = () => 'own-key';
  hazeProgram(material, 0.5); hazeProgram(material, 0.5);
  const shader = compile(material);
  expect(steps).toEqual(['own']);
  expect(shader.fragmentShader).toContain('// own');
  expect(shader.fragmentShader).toContain('exp( - 0.5 * fogDensity * vFogDepth )');
  expect(material.customProgramCacheKey()).toBe('own-key|haze0.5');
  expect(() => { hazeProgram(material); }).toThrow(/distance scale 0.5/);
});

it('keeps three\'s default key, the hook\'s source, apart for materials with different hooks', () => {
  const a = new MeshStandardMaterial(), b = new MeshStandardMaterial();
  a.onBeforeCompile = () => { /* a */ }; b.onBeforeCompile = () => { /* b */ };
  hazeProgram(a); hazeProgram(b);
  expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
});

it('refuses a program without three\'s fog includes', () => {
  const material = new MeshStandardMaterial();
  hazeProgram(material);
  expect(() => { material.onBeforeCompile({...program(), fragmentShader: '#include <fog_pars_fragment>'}, null as unknown as WebGLRenderer); }).toThrow(/no #include <fog_fragment>/);
});

it("finds a visible fog-enabled material that skipped the haze, in a scene with fog", () => {
  const scene = new Scene(), plain = new MeshStandardMaterial({name: 'plain'}), hazed = new MeshBasicMaterial();
  hazeProgram(hazed);
  scene.add(new Mesh(undefined, hazed), new Mesh(undefined, new ShaderMaterial()), new Mesh(undefined, new MeshBasicMaterial({fog: false})));
  const bare = new Mesh(undefined, plain); bare.name = 'barrier'; scene.add(bare);
  assertHazed(scene); // Without scene fog nothing draws three's fog.
  scene.fog = new FogExp2(0xffffff, 0.001);
  expect(() => { assertHazed(scene); }).toThrow('plain on barrier');
  bare.layers.set(1); // A shadow-only part is never drawn by the scene camera.
  assertHazed(scene);
  bare.layers.enable(0); hazeProgram(plain);
  assertHazed(scene);
  expect([isHazed(plain), isHazed(new MeshBasicMaterial())]).toEqual([true, false]);
});
