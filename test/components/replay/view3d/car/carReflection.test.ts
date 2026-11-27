import { expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene, Texture, Vector3, WebGLCoordinateSystem, type PerspectiveCamera, type ShaderMaterial, type Vector2, type WebGLRenderer } from 'three';
const pmrem = vi.hoisted(() => ({conversions: 0, convolutions: 0, reused: 0, disposed: 0, sources: [] as unknown[]}));
vi.mock('../../../../../src/components/replay/view3d/reflectionCube.js', () => ({
  convolveReflection(_renderer: unknown, source: {texture: {generateMipmaps: boolean}}, kernels: unknown[], into?: {sharp: unknown}) {
    pmrem.convolutions++; pmrem.sources.push(source);
    if (into) { pmrem.reused++; into.sharp = source.texture; return into; }
    return {sharp: source.texture, convolved: {kernels}, levels: kernels.length, target: {}, dispose() { pmrem.disposed++; }};
  },
}));
// The overhead map draws through the shadow caster pass; here it records where it was asked to draw and what it left out.
const overhead = vi.hoisted(() => ({updates: [] as Array<{at: number[]; cars: unknown[]; busy: boolean}>, stale: 0, disposed: 0}));
vi.mock('../../../../../src/components/replay/view3d/car/overheadMap.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../../../src/components/replay/view3d/car/overheadMap.js')>(),
  createOverheadMap() {
    const map = {
      matrix: {elements: []}, depth: null as unknown, belowMatrix: {elements: []}, below: null as unknown, depthM: 600,
      update(car: {toArray(): number[]}, cars: unknown[], busy = false) {
        overhead.updates.push({at: car.toArray(), cars, busy});
        const drew = map.depth === null; map.depth ??= {}; map.below ??= {};
        return drew;
      },
      stale() { overhead.stale++; },
      dispose() { overhead.disposed++; },
    };
    return map;
  },
}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  // three's prefiltered 1024 px cube: its levels down to 16 px.
  const prefiltered = {texture: Object.assign(new actual.Texture(), {isPMREMTexture: true, mipmaps: Array.from({length: 7}, () => ({}))}), dispose() {}};
  return {...actual, PMREMGenerator: class {
    compileCubemapShader() {}
    fromCubemap(_cube: unknown, reuse: unknown) { pmrem.conversions++; return reuse ?? prefiltered; }
    dispose() {}
  }};
});
import { CAR_REFLECTION_STEPS, carSurfaceProbe, createCarReflection } from '../../../../../src/components/replay/view3d/car/carReflection.js';
import { sceneryReflectionUniforms } from '../../../../../src/components/replay/view3d/scenery/materials/sceneryReflection.js';
import { createCarMaterial } from '../../../../../src/components/replay/view3d/car/carMaterials.js';
import { composedMaterial } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { litTemplate, ownEnvironment } from '../../../../../src/components/replay/view3d/shaders/litTemplate.js';
import { sceneEnvironmentMap } from '../../../../../src/components/replay/view3d/shaders/sceneLight.js';
import { testShading } from '../../../../helpers/scenes/sceneryProfiles.js';
import type { CarAppearance, CarSurface } from '../../../../../shared/types/scenes/car.js';

/** A car material drawn by the surface program's probe read alone (carReflection.ts), bound to its car's probe. */
function probeMaterial(reflects: boolean, overhead = true): ShaderMaterial {
  const probe = carSurfaceProbe(reflects, overhead), material = composedMaterial(litTemplate, probe.parts);
  probe.bind(material);
  return material;
}
/** A car paint material, as the car draws it. */
const paintMaterial = () => createCarMaterial({id: 'p', name: 'BODY', paint: true}, {alias: 'x', albedo: 'a', paint: carPaint(), optionNodes: []} as unknown as CarAppearance, () => new Texture(), testShading());

function stubRenderer() {
  const faces: Array<{face: number; carShown: boolean; mips: boolean}> = [], eyes: Vector3[] = [], ranges: [number, number][] = [];
  let target: unknown = null, face = 0;
  const renderer = {
    coordinateSystem: WebGLCoordinateSystem, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}},
    getRenderTarget: () => target, initRenderTarget() {},
    setRenderTarget(next: unknown, activeFace = 0) { target = next; face = activeFace; },
    render(_scene: Scene, camera: PerspectiveCamera) {
      faces.push({face, carShown: cars.visible, mips: (target as {texture: {generateMipmaps: boolean}}).texture.generateMipmaps});
      eyes.push(camera.getWorldPosition(new Vector3())); ranges.push([camera.near, camera.far]);
    },
  };
  const cars = new Group();
  return {renderer: renderer as unknown as WebGLRenderer, faces, eyes, ranges, cars, target: () => target};
}

/** What the faces leave out: nothing. */
const setFaces = () => ({notReflected: () => [], clipM: 150});

it('renders the probe three faces a frame from the roof without the cars, then gives the car its reflection', () => {
  const {renderer, faces, eyes, ranges, cars, target} = stubRenderer();
  const glass = composedMaterial(litTemplate, []), unlit = new MeshBasicMaterial({envMap: null}), paint = paintMaterial();
  const paintUniforms = () => paint.uniforms as Record<string, {value: unknown}>;
  // A lamp housing, drawn by the surface program: the reflection uniforms are the car's.
  const lamp = probeMaterial(true), venueCube = new Texture();
  const lampUniforms = () => lamp.uniforms as Record<string, {value: unknown}>;
  sceneryReflectionUniforms.surface_reflection.value = venueCube; sceneryReflectionUniforms.surface_reflectionReady.value = 1;
  expect(Object.keys(lampUniforms())).toEqual(expect.arrayContaining(['surface_reflection', 'surface_reflectionReady', 'overhead_top', 'overhead_below',
    'overhead_topMatrix', 'overhead_belowMatrix', 'overhead_eyes', 'overhead_ready', 'overhead_sky']));
  expect(lampUniforms().overhead_ready.value).toBe(0);
  expect(lampUniforms().surface_reflection.value).toBe(venueCube);
  // A 2 m tall body whose origin is on the ground: the box centre is 1 m up.
  const body = new Mesh(new BoxGeometry(2, 2, 4), [glass, unlit, paint, lamp]); body.position.y = 1;
  const car = new Group().add(body);
  cars.add(car);
  const reflection = createCarReflection(renderer, new Scene(), testShading(), setFaces()), centre = new Vector3(10, 0.5, 20);
  // The prefiltered target is converted once from the empty cube, and the car's lit materials take it at once, its last level
  // a uniform: one program with the scene's environment or the probe's.
  expect(pmrem.conversions).toBe(1);
  const key = glass.customProgramCacheKey();
  reflection.setCar(car, cars);
  expect(ownEnvironment(glass)).not.toBeNull(); expect(paintUniforms().paint_probe.value).toBe(0);
  expect(glass.customProgramCacheKey()).toBe(key); expect((glass.uniforms.lit_ownEnvironment.value as Vector2).toArray()).toEqual([1, 6]); expect(ownEnvironment(paint)).toBeNull();
  // Three faces a frame: three's prefilter rides with the last three, the paint's convolution takes the frame after.
  expect(reflection.update(centre)).toBe(true); expect(pmrem.conversions).toBe(1);
  expect(reflection.update(centre)).toBe(true); expect(pmrem.conversions).toBe(2); expect(pmrem.convolutions).toBe(0);
  expect(reflection.update(centre)).toBe(true); expect(CAR_REFLECTION_STEPS).toBe(3);
  // The cube's mips regenerate after the last face only: the kernels read them.
  expect(faces).toEqual([0, 1, 2, 3, 4, 5].map(face => ({face, carShown: false, mips: face === 5})));
  // The eye sits 0.72 m over the box centre (roof height) and each face sees from 0.1 m to 150 m.
  for (const eye of eyes) expect(eye.toArray().map(v => +v.toFixed(6))).toEqual([10, 2.22, 20]);
  expect(ranges[0]).toEqual([0.1, 150]);
  expect(cars.visible).toBe(true); expect(target()).toBeNull();
  // Only after the sixth face: an incomplete cube would reflect black. The paint takes the convolved cubes, the other lit
  // materials three's prefiltered one, the unlit nothing.
  expect(pmrem.conversions).toBe(2); expect(pmrem.convolutions).toBe(1); expect(ownEnvironment(glass)).not.toBeNull(); expect(unlit.envMap).toBeNull();
  expect(ownEnvironment(paint)).toBeNull(); expect(paintUniforms().paint_probe.value).toBe(1); expect(paintUniforms().paint_levels.value).toBe(2);
  // The overhead map was drawn around the car with the cars left out, and the paint reads it with each face's eye.
  expect(overhead.updates[0]).toEqual({at: [10, 0.5, 20], cars: [cars], busy: false});
  expect(paintUniforms().overhead_ready.value).toBe(1); expect(paintUniforms().overhead_below.value).not.toBeNull();
  expect([...paintUniforms().overhead_eyes.value as Float32Array].map(v => +v.toFixed(5))).toEqual(Array.from({length: 6}, () => [10, 2.22, 20]).flat());
  // So do the car's other materials, with the venue's cube for the sky; without it, they are left as the probe drew them.
  expect(lampUniforms().overhead_ready.value).toBe(1); expect(lampUniforms().overhead_sky.value).toBe(venueCube);
  // The surface program's material reads the car's convolved cube in place of the venue's, even before the venue has one.
  expect(lampUniforms().surface_reflection.value).toEqual({kernels: testShading().convolution.kernels});
  sceneryReflectionUniforms.surface_reflectionReady.value = 0; expect(lampUniforms().surface_reflectionReady.value).toBe(1);
  expect(lampUniforms().overhead_ready.value).toBe(0);

  // A paused car keeps its probe; moving the car or new scenery starts another.
  expect(reflection.update(centre)).toBe(false);
  reflection.stale(); expect(overhead.stale).toBe(1); // New scenery: the map is drawn again too.
  for (let i = 0; i < 3; i++) expect(reflection.update(centre)).toBe(true);
  expect(faces).toHaveLength(12);
  expect(reflection.update(centre)).toBe(false);
  const moved = new Vector3(11, 0.5, 20);
  expect(reflection.update(moved)).toBe(true); expect(reflection.update(moved)).toBe(true); expect(faces).toHaveLength(18);
  expect(reflection.update(moved)).toBe(true);
  expect(pmrem.conversions).toBe(4); expect(pmrem.convolutions).toBe(3); expect(pmrem.reused).toBe(2); expect(pmrem.disposed).toBe(0);
  // Each probe drew into the other cube while the car showed the one before; the paint now reads the one just drawn.
  const [shown, drawn] = (pmrem.sources as {texture: Texture}[]).slice(-2);
  expect(drawn).not.toBe(shown); expect(paintUniforms().paint_sharp.value).toBe(drawn.texture);
  // A moving car: each frame's faces look from where the car is at that frame, not where the probe began, so no face sees the
  // road the car has left (sunlit where its shadow had been).
  reflection.update(new Vector3(12, 0.5, 20)); reflection.update(new Vector3(13, 0.5, 20));
  expect(eyes.slice(-6).map(eye => eye.x)).toEqual([12, 12, 12, 13, 13, 13]);

  reflection.dispose();
  expect(ownEnvironment(glass)).toBeNull(); expect(glass.uniforms.envMap).toBe(sceneEnvironmentMap); expect(paintUniforms().paint_probe.value).toBe(0); expect(pmrem.disposed).toBe(1);
  expect(paintUniforms().overhead_ready.value).toBe(0); expect(overhead.disposed).toBe(1);
  expect(lampUniforms().surface_reflection.value).toBe(venueCube); expect(lampUniforms().surface_reflectionReady.value).toBe(0);
  sceneryReflectionUniforms.surface_reflection.value = null;
});

it('leaves a due step to the next frame when the frame is busy, never two frames in a row, and never the first probe', () => {
  const {renderer, faces} = stubRenderer();
  const reflection = createCarReflection(renderer, new Scene(), testShading(), setFaces()), centre = new Vector3();
  reflection.setCar(new Mesh(new BoxGeometry(), composedMaterial(litTemplate, [])), new Group());
  for (let i = 0; i < CAR_REFLECTION_STEPS; i++) reflection.update(centre, true);
  expect(faces).toHaveLength(6);
  // The map is told the frame is busy, and waits by its own rule (overheadMap.ts).
  expect(overhead.updates.at(-1)?.busy).toBe(true);
  reflection.stale();
  reflection.update(centre, true); expect(faces).toHaveLength(6); // the faces are due: left to the next frame
  reflection.update(centre, true); expect(faces).toHaveLength(9); // busy again, but it waited once already
  reflection.update(centre); expect(faces).toHaveLength(12);
  reflection.dispose();
});

it('draws no further face once the frame is past its budget, one at least, a cube never running past its sixth face', () => {
  const {renderer, faces, eyes} = stubRenderer();
  const reflection = createCarReflection(renderer, new Scene(), testShading(), setFaces());
  reflection.setCar(new Mesh(new BoxGeometry(), composedMaterial(litTemplate, [])), new Group());
  for (let i = 0; i < CAR_REFLECTION_STEPS; i++) reflection.update(new Vector3());
  faces.length = 0; eyes.length = 0;
  const conversions = pmrem.conversions, now = performance.now();
  // A moving car: two frames over budget (one face each), one with time to spare (three), then one with the last face left.
  for (const [x, until] of [[1, now - 1], [2, now - 1], [3, Infinity], [4, Infinity]] as const) reflection.update(new Vector3(x, 0, 0), false, until);
  expect(faces.map(f => f.face)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(eyes.map(eye => eye.x)).toEqual([1, 2, 3, 3, 3, 4]);
  // The cube completed once: one prefilter.
  expect(pmrem.conversions - conversions).toBe(1);
  reflection.dispose();
});

it('gives a near car the probe: its glass and trim the prefiltered cube, its paint the probe cubes from the first one on', () => {
  const {renderer} = stubRenderer();
  const reflection = createCarReflection(renderer, new Scene(), testShading(), setFaces());
  const own = composedMaterial(litTemplate, []), nearGlass = composedMaterial(litTemplate, []), nearPaint = paintMaterial(), unlit = new MeshBasicMaterial();
  const probe = () => nearPaint.uniforms.paint_probe.value as number;
  reflection.setCar(new Mesh(new BoxGeometry(), own), new Group());
  reflection.share(new Group().add(new Mesh(new BoxGeometry(), [nearGlass, nearPaint, unlit])));
  // The followed car's prefiltered probe: the same program as the followed car's glass.
  expect(ownEnvironment(nearGlass)).toBe(ownEnvironment(own)); expect(ownEnvironment(nearGlass)).not.toBeNull();
  expect(ownEnvironment(nearPaint)).toBeNull(); expect(unlit.envMap).toBeNull();
  // The paint waits for the first complete probe, as the followed car's does.
  expect(probe()).toBe(0);
  for (let i = 0; i < CAR_REFLECTION_STEPS; i++) reflection.update(new Vector3());
  expect(probe()).toBe(1);
  // A disposed car leaves the probe; the rest go back to the venue's environment with it.
  nearPaint.dispose(); reflection.update(new Vector3(5, 0, 0));
  reflection.dispose();
  expect(probe()).toBe(1);
});

it("corrects either of the car's surface reads for the scenery overhead, in a program of its own", () => {
  const fragment = (reflects: boolean, overhead = true) => probeMaterial(reflects, overhead).fragmentShader;
  // The scenery rule's cube read (trim, lamps): corrected right after it.
  const trim = fragment(true);
  expect(trim).toContain('vec4 overheadFix(vec3 r)');
  expect(trim).toContain('light = carSurfaceReflection(light, r, roughness);');
  expect(trim.indexOf('vec3 carSurfaceReflection')).toBeGreaterThan(trim.indexOf('uniform samplerCube surface_reflection'));
  // three's environment read (glass, screens), corrected once read.
  const glass = fragment(false);
  expect(glass.indexOf('radiance = carOverheadRadiance( radiance, geometryViewDir, geometryNormal, material.roughness );')).toBeGreaterThan(glass.indexOf('radiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );'));
  expect(glass).not.toContain('carSurfaceReflection(light');
  // A material at the texture unit limit reads its car's probe uncorrected, in a program of its own.
  const cabin = probeMaterial(true, false);
  expect(cabin.fragmentShader).not.toContain('overheadFix');
  expect(cabin.customProgramCacheKey()).not.toBe(probeMaterial(true).customProgramCacheKey());
  expect(carSurfaceProbe(false, false).parts).toEqual([]);
});
it('leaves the scenery the game does not reflect out of its faces, three faces a frame, a conversion step riding with them', () => {
  const {renderer, faces} = stubRenderer();
  // A reflected part, a part left out, and one left out that another rule already hides.
  const reflected = new Group(), left = new Group(), hiddenAnyway = Object.assign(new Group(), {visible: false}), seen: Array<[boolean, boolean, boolean]> = [];
  const render = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => { seen.push([reflected.visible, left.visible, hiddenAnyway.visible]); render(scene, camera); };
  const reflection = createCarReflection(renderer, new Scene(), testShading(), {notReflected: () => [left, hiddenAnyway], clipM: 150}), centre = new Vector3();
  reflection.setCar(new Mesh(new BoxGeometry(), composedMaterial(litTemplate, [])), new Group());
  const conversions = pmrem.conversions, convolutions = pmrem.convolutions;
  // The first cube: three faces, then three more with the prefilter, then the convolution alone (the car has not moved).
  expect(reflection.update(centre)).toBe(true); expect(faces.map(f => f.face)).toEqual([0, 1, 2]);
  expect(reflection.update(centre)).toBe(true); expect(faces.map(f => f.face)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(pmrem.conversions - conversions).toBe(1); expect(pmrem.convolutions - convolutions).toBe(0);
  expect(reflection.update(centre)).toBe(true); expect(pmrem.convolutions - convolutions).toBe(1); expect(faces).toHaveLength(6);
  expect(reflection.update(centre)).toBe(false);
  // Only the reflected part draws into the faces; outside them every part is as it was.
  expect(seen.every(([shown, leftShown, other]) => shown && !leftShown && !other)).toBe(true);
  expect([reflected.visible, left.visible, hiddenAnyway.visible]).toEqual([true, true, false]);
  // A moving car: a new cube every two frames, the convolution of the last sharing a frame with the first faces of the next.
  for (let x = 1; x <= 4; x++) reflection.update(new Vector3(x, 0, 0));
  expect(faces).toHaveLength(6 + 12); expect(pmrem.conversions - conversions).toBe(3); expect(pmrem.convolutions - convolutions).toBe(2);
  reflection.dispose();
});

const region = {
  baseCoatRoughness: 0.3, baseCoatSpecStrength: 0.5, baseCoatRefractiveIndex: 2.25, clearCoatSpecStrength: 1, clearCoatRoughness: 0,
  clearCoatRefractiveIndex: 1.44, lacquerColour: [1, 1, 1, 1], metallicPaintStrength: 0.8, metallicFlakeStrength: 0, carbonFibreStrength: 0.6, orangePeelStrength: 1,
};
const carPaint = (): CarSurface => ({
  version: 4, kind: 'carPaint', normalShadowInfluence: 0.5, maps: {albedo: {texture: 'a', uv: 'uv0', scale: [1, 1]}},
  parameters: {regions: {black: region, red: region, green: region, blue: region, white: region}, clearCoatStrength: 0.5, lacquerThickness: 0.3,
    carbonFibreAlbedoColour: [0.43, 0.43, 0.43, 0], metallicFlakeColour: [1, 1, 1], uvScale: {carbonFibre: [125, 125], metallicFlakes: [1, 1], orangePeel: [1, 1]}},
});
