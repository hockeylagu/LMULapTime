import { Color, FogExp2, Mesh, MeshBasicMaterial, MeshStandardMaterial, Scene, ShaderMaterial, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { assertHazed, createHaze, hazePart, setHazeDistanceScale } from '../../../../../src/components/replay/view3d/atmosphere/haze.js';
import { composedMaterial } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { SCENE_BLOCK, sceneBlock, sceneValue } from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';
import { unlitTemplate } from '../../../../../src/components/replay/view3d/shaders/unlitTemplate.js';

const shape = (originY: number) => ({originY, height: {amount: 0.5, rate: 0.01, exponent: 2}, sunDirection: new Vector3(0, 1, 0), sunRadiance: new Color(1, 1, 1), sunward: 0.3});

it("draws each scene's own haze through the scene block every hazed program reads, whichever scene was built last", () => {
  const fog = new FogExp2(new Color(0.25, 0.5, 0.75), 0.002), first = createHaze(shape(12), fog), second = createHaze(shape(-40), new FogExp2(0, 0.01));
  const vector = (name: keyof typeof SCENE_BLOCK.offsets) => [...sceneBlock.subarray(SCENE_BLOCK.offsets[name], SCENE_BLOCK.offsets[name] + 3)];
  first();
  expect(sceneValue('HAZE_ORIGIN_Y')).toBe(12);
  second();
  expect([sceneValue('HAZE_ORIGIN_Y'), sceneValue('haze_density')]).toEqual([-40, Math.fround(0.01)]);
  // The fog's colour and density as they are when the scene renders: the view turns the colour each frame.
  fog.color.setRGB(0.5, 0.5, 0.5); first();
  expect([sceneValue('HAZE_ORIGIN_Y'), sceneValue('haze_density'), ...vector('haze_colour')]).toEqual([12, Math.fround(0.002), 0.5, 0.5, 0.5]);
  expect([sceneValue('HAZE_HEIGHT_AMOUNT'), sceneValue('HAZE_HEIGHT_EXPONENT'), sceneValue('HAZE_SUNWARD'), ...vector('HAZE_SUN_DIRECTION')]).toEqual([0.5, 2, Math.fround(0.3), 0, 1, 0]);
  expect(composedMaterial(unlitTemplate, [hazePart]).uniforms).not.toHaveProperty('HAZE_ORIGIN_Y');
});

it('hazes by the distance along the ray, linear in the exponent, last in its slots, on the scene block, without three fog', () => {
  const {slots} = hazePart;
  expect(slots.vertexOutputs?.glsl).toContain('vHazeDepth = length( mvPosition.xyz );');
  expect(slots.fragmentOutput?.glsl).toContain('1.0 - exp( - HAZE_DISTANCE_SCALE * haze_density * vHazeDepth )');
  expect(slots.fragmentOutput?.glsl).toContain('vec3 hazeColour = mix( haze_colour, HAZE_SUN_RADIANCE, hazeSun * hazeSun * HAZE_SUNWARD );');
  expect(slots.fragmentPars?.glsl).not.toContain('HAZE_SUN_DIRECTION'); // A block member, never declared again.
  expect(Object.values(slots).every(slot => slot?.at === 100)).toBe(true);
  const a = hazePart.uniforms?.(), b = hazePart.uniforms?.();
  expect(Object.keys(a ?? {})).toEqual(['HAZE_DISTANCE_SCALE']);
  expect(a?.HAZE_DISTANCE_SCALE).not.toBe(b?.HAZE_DISTANCE_SCALE); // Each material's own scale, 1 unless set.
  expect(a?.HAZE_DISTANCE_SCALE.value).toBe(1);
  expect(composedMaterial(unlitTemplate, [hazePart]).fog).toBe(false);
});

it("finds a visible fog-enabled material that skipped the haze, in a scene with fog", () => {
  const scene = new Scene(), plain = new MeshStandardMaterial({name: 'plain'});
  scene.add(new Mesh(undefined, composedMaterial(unlitTemplate, [hazePart])), new Mesh(undefined, new ShaderMaterial()), new Mesh(undefined, new MeshBasicMaterial({fog: false})));
  const bare = new Mesh(undefined, plain); bare.name = 'barrier'; scene.add(bare);
  assertHazed(scene); // Without scene fog nothing draws three's fog.
  scene.fog = new FogExp2(0xffffff, 0.001);
  expect(() => { assertHazed(scene); }).toThrow('plain on barrier');
  bare.layers.set(1); // A shadow-only part is never drawn by the scene camera.
  assertHazed(scene);
});
it("scales a composed material's haze distance through its uniform, never its source", () => {
  const scaled = composedMaterial(unlitTemplate, [hazePart]), plain = composedMaterial(unlitTemplate, [hazePart]);
  setHazeDistanceScale(scaled, 0.5);
  expect([scaled.uniforms.HAZE_DISTANCE_SCALE.value, plain.uniforms.HAZE_DISTANCE_SCALE.value]).toEqual([0.5, 1]);
  expect(scaled.fragmentShader).toBe(plain.fragmentShader); expect(scaled.customProgramCacheKey()).toBe(plain.customProgramCacheKey());
  expect(() => { setHazeDistanceScale(scaled, 0); }).toThrow('not positive');
  expect(() => { setHazeDistanceScale(composedMaterial(unlitTemplate, []), 0.5); }).toThrow('has no haze part');
});

it('accepts a composed material with the haze part, and finds one drawing fog without it', () => {
  const scene = new Scene(); scene.fog = new FogExp2(0xffffff, 0.001);
  scene.add(new Mesh(undefined, composedMaterial(unlitTemplate, [hazePart])));
  assertHazed(scene);
  const bare = new ShaderMaterial({fog: true}); bare.name = 'bare';
  scene.add(new Mesh(undefined, bare));
  expect(() => { assertHazed(scene); }).toThrow('bare on Mesh');
});