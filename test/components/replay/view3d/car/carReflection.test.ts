import { expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Scene, Texture, Vector3, WebGLCoordinateSystem, type PerspectiveCamera, type WebGLRenderer } from 'three';
const pmrem = vi.hoisted(() => ({conversions: 0, convolutions: 0, reused: 0, disposed: 0, sources: [] as unknown[]}));
vi.mock('../../../../../src/components/replay/view3d/reflectionCube.js', () => ({
  convolveReflection(_renderer: unknown, source: {texture: {generateMipmaps: boolean}}, kernels: unknown[], into?: {sharp: unknown}) {
    pmrem.convolutions++; pmrem.sources.push(source);
    if (into) { pmrem.reused++; into.sharp = source.texture; return into; }
    return {sharp: source.texture, convolved: {kernels}, levels: kernels.length, target: {}, dispose() { pmrem.disposed++; }};
  },
}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  const prefiltered = {texture: new actual.Texture(), dispose() {}};
  return {...actual, PMREMGenerator: class {
    compileCubemapShader() {}
    fromCubemap(_cube: unknown, reuse: unknown) { pmrem.conversions++; return reuse ?? prefiltered; }
    dispose() {}
  }};
});
import { bindCarSurfaceReflection, createCarReflection } from '../../../../../src/components/replay/view3d/car/carReflection.js';
import { sceneryReflectionUniforms } from '../../../../../src/components/replay/view3d/scenery/materials/sceneryReflection.js';
import { configureCarPaint } from '../../../../../src/components/replay/view3d/car/carPaint.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';
import type { CarSurface } from '../../../../../shared/types/scenes/car.js';

function stubRenderer() {
  const faces: Array<{face: number; carShown: boolean; shadowUpdate: boolean; mips: boolean}> = [], eyes: Vector3[] = [], ranges: [number, number][] = [];
  let target: unknown = null, face = 0;
  const renderer = {
    coordinateSystem: WebGLCoordinateSystem, shadowMap: {autoUpdate: true},
    getRenderTarget: () => target,
    setRenderTarget(next: unknown, activeFace = 0) { target = next; face = activeFace; },
    render(_scene: Scene, camera: PerspectiveCamera) {
      faces.push({face, carShown: cars.visible, shadowUpdate: renderer.shadowMap.autoUpdate, mips: (target as {texture: {generateMipmaps: boolean}}).texture.generateMipmaps});
      eyes.push(camera.getWorldPosition(new Vector3())); ranges.push([camera.near, camera.far]);
    },
  };
  const cars = new Group();
  return {renderer: renderer as unknown as WebGLRenderer, faces, eyes, ranges, cars, target: () => target};
}

it('renders the probe three faces a frame from the roof without the cars, then gives the car its reflection', () => {
  const {renderer, faces, eyes, ranges, cars, target} = stubRenderer();
  const glass = new MeshPhysicalMaterial(), unlit = new MeshBasicMaterial({envMap: null}), paint = new MeshPhysicalMaterial({map: new Texture()});
  configureCarPaint(paint, carPaint(), () => new Texture(), testShading());
  const paintUniforms = () => { const shader = {uniforms: {}, vertexShader: '', fragmentShader: ''}; paint.onBeforeCompile(shader as never, null as never); return shader.uniforms as Record<string, {value: unknown}>; };
  // A lamp housing, drawn by the surface program: its own program patch runs first, then the reflection uniforms become the car's.
  const lamp = new MeshStandardMaterial(), venueCube = new Texture();
  lamp.onBeforeCompile = shader => { shader.uniforms.surface_albedo = {value: null}; };
  bindCarSurfaceReflection(lamp);
  const lampUniforms = () => { const shader = {uniforms: {}, vertexShader: '', fragmentShader: ''}; lamp.onBeforeCompile(shader as never, null as never); return shader.uniforms as Record<string, {value: unknown}>; };
  sceneryReflectionUniforms.surface_reflection.value = venueCube; sceneryReflectionUniforms.surface_reflectionReady.value = 1;
  expect(Object.keys(lampUniforms())).toEqual(['surface_albedo', 'surface_reflection', 'surface_reflectionReady']);
  expect(lampUniforms().surface_reflection.value).toBe(venueCube);
  // A 2 m tall body whose origin is on the ground: the box centre is 1 m up.
  const body = new Mesh(new BoxGeometry(2, 2, 4), [glass, unlit, paint, lamp]); body.position.y = 1;
  const car = new Group().add(body);
  cars.add(car);
  const reflection = createCarReflection(renderer, new Scene(), testShading()), centre = new Vector3(10, 0.5, 20);
  reflection.setCar(car, cars);
  for (let i = 0; i < 2; i++) expect(reflection.update(centre)).toBe(true);
  // The cube's mips regenerate after the last face only: the kernels read them.
  expect(faces).toEqual([0, 1, 2, 3, 4, 5].map(face => ({face, carShown: false, shadowUpdate: false, mips: face === 5})));
  // The eye sits 0.72 m over the box centre (roof height) and each face sees from 0.1 m to 150 m.
  for (const eye of eyes) expect(eye.toArray().map(v => +v.toFixed(6))).toEqual([10, 2.22, 20]);
  expect(ranges[0]).toEqual([0.1, 150]);
  expect(cars.visible).toBe(true); expect(renderer.shadowMap.autoUpdate).toBe(true); expect(target()).toBeNull();
  // Only after the sixth face: an incomplete cube would reflect black. The paint takes the convolved cubes, the other lit
  // materials three's prefiltered one, the unlit nothing.
  expect(pmrem.conversions).toBe(1); expect(pmrem.convolutions).toBe(1); expect(glass.envMap).not.toBeNull(); expect(unlit.envMap).toBeNull();
  expect(paint.envMap).toBeNull(); expect(paintUniforms().paint_probe.value).toBe(1); expect(paintUniforms().paint_levels.value).toBe(2);
  // The surface program's material reads the car's convolved cube in place of the venue's, even before the venue has one.
  expect(lampUniforms().surface_reflection.value).toEqual({kernels: testShading().convolution.kernels});
  sceneryReflectionUniforms.surface_reflectionReady.value = 0; expect(lampUniforms().surface_reflectionReady.value).toBe(1);

  // A paused car keeps its probe; moving the car or new scenery starts another.
  expect(reflection.update(centre)).toBe(false);
  reflection.stale(); expect(reflection.update(centre)).toBe(true);
  reflection.update(centre);
  expect(reflection.update(centre)).toBe(false);
  expect(reflection.update(new Vector3(11, 0.5, 20))).toBe(true);
  expect(faces).toHaveLength(15); expect(pmrem.conversions).toBe(2); expect(pmrem.convolutions).toBe(2); expect(pmrem.reused).toBe(1); expect(pmrem.disposed).toBe(0);

  reflection.dispose();
  expect(glass.envMap).toBeNull(); expect(paintUniforms().paint_probe.value).toBe(0); expect(pmrem.disposed).toBe(1);
  expect(lampUniforms().surface_reflection.value).toBe(venueCube); expect(lampUniforms().surface_reflectionReady.value).toBe(0);
  sceneryReflectionUniforms.surface_reflection.value = null;
});

const region = {
  baseCoatRoughness: 0.3, baseCoatSpecStrength: 0.5, baseCoatRefractiveIndex: 2.25, clearCoatSpecStrength: 1, clearCoatRoughness: 0,
  clearCoatRefractiveIndex: 1.44, lacquerColour: [1, 1, 1, 1], metallicPaintStrength: 0.8, metallicFlakeStrength: 0, carbonFibreStrength: 0.6, orangePeelStrength: 1,
};
const carPaint = (): CarSurface => ({
  version: 4, kind: 'carPaint', maps: {albedo: {texture: 'a', uv: 'uv0', scale: [1, 1]}},
  parameters: {regions: {black: region, red: region, green: region, blue: region, white: region}, clearCoatStrength: 0.5, lacquerThickness: 0.3,
    carbonFibreAlbedoColour: [0.43, 0.43, 0.43, 0], metallicFlakeColour: [1, 1, 1], uvScale: {carbonFibre: [125, 125], metallicFlakes: [1, 1], orangePeel: [1, 1]}},
});
