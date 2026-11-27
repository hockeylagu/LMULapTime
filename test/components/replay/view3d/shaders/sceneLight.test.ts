import { Color, DirectionalLight, Matrix3, Matrix4, Scene, Texture } from 'three';
import { expect, it } from 'vitest';
import { passValues, SCENE_BLOCK, sceneBlock } from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';
import { ENVIRONMENT_DEFINES, ENVIRONMENT_FACE_PX, environmentMaxLod, sceneEnvironmentMap, sceneLight } from '../../../../../src/components/replay/view3d/shaders/sceneLight.js';

/** A PMREM as three's generator makes one for a face size: its levels down to 8 px. */
const pmrem = (face = ENVIRONMENT_FACE_PX) => Object.assign(new Texture(), {isPMREMTexture: true, mipmaps: [1, 2, 4, 8, 16].map(down => ({width: face / down, height: face / down}))});
const member = (name: keyof typeof SCENE_BLOCK.offsets, length = 1) => [...sceneBlock.subarray(SCENE_BLOCK.offsets[name], SCENE_BLOCK.offsets[name] + length)];
const rounded = (values: number[]) => values.map(v => +v.toFixed(6));

it("writes the scene's sun and environment as three gives them to its built-in materials", () => {
  const scene = new Scene(), sun = new DirectionalLight(new Color(2, 3, 4), 0.5), environment = pmrem();
  scene.add(sun, sun.target);
  sun.position.set(3, 4, 0); scene.environment = environment; scene.environmentIntensity = 0.75; scene.environmentRotation.set(0, Math.PI / 2, 0);
  sceneLight(scene, sun)();
  // Toward the light from its target, unit length; the colour times the intensity.
  expect(rounded(member('lit_sunDirection', 3))).toEqual([0.6, 0.8, 0]);
  expect(member('lit_sunColour', 3)).toEqual([1, 1.5, 2]);
  expect(sceneEnvironmentMap.value).toBe(environment); expect(passValues().lit_environmentIntensity).toBe(0.75);
  // The rotation's transpose (WebGLMaterials), a PMREM taking no cube flip, as std140 lays out a mat3: three padded columns.
  const e = new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(scene.environmentRotation)).transpose().elements;
  expect(rounded(member('lit_environmentRotation', 12))).toEqual(rounded([e[0], e[1], e[2], 0, e[3], e[4], e[5], 0, e[6], e[7], e[8], 0]));
});

it("follows the scene's environment intensity, a pass value, and a scene without an environment", () => {
  const scene = new Scene(), sun = new DirectionalLight(), apply = sceneLight(scene, sun);
  scene.environment = pmrem(); scene.environmentIntensity = 0; // The venue's first capture.
  apply(); expect(passValues().lit_environmentIntensity).toBe(0);
  scene.environmentIntensity = 1; apply(); expect(passValues().lit_environmentIntensity).toBe(1);
  scene.environment = null; apply(); expect(sceneEnvironmentMap.value).toBeNull();
});

it("writes the environment's last level, which the lit template reads as three's `ENVMAP_MAX_LOD`, and refuses an environment that is no PMREM", () => {
  expect(ENVIRONMENT_DEFINES).toEqual({USE_ENVMAP: '', ENVMAP_TYPE_PMREM: ''});
  const scene = new Scene(), apply = sceneLight(scene, new DirectionalLight());
  scene.environment = pmrem(); apply(); expect(member('lit_environmentMaxLod')).toEqual([4]);
  // Three's own define: the levels less one, whatever the face size.
  const big = Object.assign(new Texture(), {isPMREMTexture: true, mipmaps: Array.from({length: 8}, () => ({}))});
  scene.environment = big; apply(); expect(member('lit_environmentMaxLod')).toEqual([7]); expect(environmentMaxLod(big)).toBe(7);
  scene.environment = new Texture();
  expect(apply).toThrow('is not a PMREM');
  scene.environment = pmrem(); apply();
});
