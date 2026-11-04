import { expect, it, vi } from 'vitest';
import { ShaderChunk, BoxGeometry, DirectionalLight, FogExp2, Mesh, MeshBasicMaterial, MeshStandardMaterial, NeutralToneMapping, OrthographicCamera, PerspectiveCamera, Scene, Texture, Vector3, type WebGLRenderer } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { addSceneEnvironment, DAYLIGHT, sceneLighting, SUN_DIRECTION } from '../../../../src/components/replay/view3d/sceneEnvironment.js';

const probe = vi.hoisted(() => ({render: vi.fn<(scene: Scene) => void>(), dispose: vi.fn()}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return {...actual, PMREMGenerator: class {
    fromScene(scene: Scene) { probe.render(scene); return {texture: new actual.Texture(), dispose: probe.dispose}; }
    dispose() {}
  }};
});

it('uses standard sky, PMREM and camera-split directional shadows while preserving material hooks', () => {
  const scene = new Scene(), renderer = {shadowMap: {enabled: false, type: 0}, toneMapping: 0, toneMappingExposure: 0} as unknown as WebGLRenderer;
  const lightChunk = ShaderChunk.lights_fragment_begin, lightPars = ShaderChunk.lights_pars_begin;
  const material = new MeshStandardMaterial(), onBeforeCompile = vi.fn(); material.onBeforeCompile = onBeforeCompile;
  const receiver = new Mesh(new BoxGeometry(), material); receiver.receiveShadow = true; scene.add(receiver);
  const environment = addSceneEnvironment(scene, renderer);
  expect(scene.getObjectByName('default-terrain')).toBeUndefined(); expect(scene.children.filter(child => child instanceof Mesh && child.name !== 'sky')).toEqual([receiver]);
  expect(scene.getObjectByName('sky')).toBeDefined();
  expect(scene.fog).toBeInstanceOf(FogExp2); expect((scene.fog as FogExp2).density).toBe(DAYLIGHT.fogDensity);
  expect(scene.background).toBeNull(); expect(renderer.shadowMap.enabled).toBe(true);
  expect(renderer.toneMapping).toBe(NeutralToneMapping); expect(renderer.toneMappingExposure).toBe(0.90);
  const camera = new PerspectiveCamera(48, 1.5, 0.5, 15000); camera.position.set(500, 3, -200); camera.updateMatrixWorld();
  environment.setCamera(camera); environment.update();
  const suns = scene.children.filter((child): child is DirectionalLight => child instanceof DirectionalLight);
  expect(suns).toHaveLength(3);
  for (const sun of suns) {
    expect(sun.castShadow).toBe(true); expect(sun.intensity).toBe(DAYLIGHT.sunIntensity);
    expect(sun.shadow.mapSize.toArray()).toEqual([2048, 2048]);
    expect(sun.shadow.intensity).toBe(1); expect(sun.shadow.radius).toBe(1);
    expect(sun.shadow.bias).toBe(0.000001); expect(sun.shadow.normalBias).toBe(0.01);
  }
  expect(suns[0].shadow.camera.right - suns[0].shadow.camera.left).toBeLessThan(suns[1].shadow.camera.right - suns[1].shadow.camera.left);
  expect(suns[1].shadow.camera.right - suns[1].shadow.camera.left).toBeLessThan(suns[2].shadow.camera.right - suns[2].shadow.camera.left);
  expect(material.defines).toMatchObject({USE_CSM: 1, CSM_CASCADES: 3});
  const streamedMaterial = new MeshStandardMaterial(), streamedReceiver = new Mesh(new BoxGeometry(), streamedMaterial);
  streamedReceiver.receiveShadow = true; environment.prepareObject(streamedReceiver);
  expect(streamedMaterial.defines).toMatchObject({USE_CSM: 1, CSM_CASCADES: 3});
  const shader = {uniforms: {}} as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, renderer); expect(onBeforeCompile).toHaveBeenCalledOnce();
  expect(ShaderChunk.lights_fragment_begin).not.toBe(lightChunk);
  environment.setCamera(new OrthographicCamera(-80, 80, 80, -80, 0.5, 15000));
  environment.update(); expect(scene.children.filter(child => child instanceof DirectionalLight)).toHaveLength(3);
  expect(scene.environment).toBeInstanceOf(Texture); expect(scene.environmentIntensity).toBeCloseTo(0.112);
  const sky = scene.getObjectByName('sky') as Sky;
  const reflectedSky = probe.render.mock.calls.at(-1)![0].children.find(child => child instanceof Sky)!;
  expect(reflectedSky.material).toBe(sky.material);
  // The lower hemisphere is sunlit ground (albedo 0.2), not a near-black plane: shaded faces get bounce light.
  const ground = probe.render.mock.calls.at(-1)![0].children.find(child => child instanceof Mesh && !(child instanceof Sky)) as Mesh<BoxGeometry, MeshBasicMaterial>;
  expect(ground.material.color.r).toBeCloseTo(0.2 * DAYLIGHT.sunIntensity * SUN_DIRECTION.y / Math.PI, 6);
  expect((sky.material.uniforms.sunPosition.value as Vector3).toArray()).toEqual(SUN_DIRECTION.toArray());
  expect(sky.material.fragmentShader).not.toContain('referenceRadianceScale');
  environment.dispose(); expect(scene.environment).toBeNull(); expect(probe.dispose).toHaveBeenCalledOnce();
  material.onBeforeCompile(shader, renderer); expect(onBeforeCompile).toHaveBeenCalledTimes(2);
  expect(ShaderChunk.lights_fragment_begin).toBe(lightChunk); expect(ShaderChunk.lights_pars_begin).toBe(lightPars);
});

it('moves the standard shadow window with the selected camera', () => {
  const scene = new Scene(), renderer = {shadowMap: {enabled: false, type: 0}} as unknown as WebGLRenderer;
  const environment = addSceneEnvironment(scene, renderer), camera = new PerspectiveCamera(48, 1.5, 0.5, 15000);
  environment.setCamera(camera);
  try {
    environment.update();
    const sun = scene.children.find((child): child is DirectionalLight => child instanceof DirectionalLight)!;
    const focus = sun.position.clone(); camera.position.x += 10; camera.updateMatrixWorld(); environment.update();
    expect(sun.position.x - focus.x).toBeCloseTo(10, 0);
    expect(scene.children.filter(child => child instanceof DirectionalLight)).toHaveLength(3);
  } finally { environment.dispose(); }
});

it('lights a layout from its published daylight: race-start sun height, turbidity from air pollution', () => {
  const sessions = (race: number, sunBearingDeg?: number) => [{id: 'race' as const, localTime: '11:00', sunElevationDeg: race, sunBearingDeg}, {id: 'qualify' as const, localTime: '15:00', sunElevationDeg: 46.1},
    {id: 'practice1' as const, localTime: '11:00', sunElevationDeg: 51.88}, {id: 'practice2' as const, localTime: '15:30', sunElevationDeg: 40.89}];
  const fuji = sceneLighting({date: '2023-09-10', sessions: sessions(51.88, 136.26), airPollution: 0.5, hazeBaseScale: 0.55});
  expect(Math.asin(fuji.sunDirection.y) * 180 / Math.PI).toBeCloseTo(51.88, 6);
  expect(fuji.sunDirection.x).toBeCloseTo(0.42680, 5);
  expect(fuji.sunDirection.z).toBeCloseTo(0.44600, 5);
  expect(fuji.sunDirection.length()).toBeCloseTo(1, 9);
  expect(fuji.turbidity).toBeCloseTo(2.75, 9);
  // A race start after sunset is still lit by a low sun.
  expect(sceneLighting({date: '2023-11-04', sessions: sessions(-3), airPollution: 0.8, hazeBaseScale: 1}).sunDirection.y).toBeGreaterThan(0.15);
  expect(sceneLighting().sunDirection.toArray()).toEqual(SUN_DIRECTION.toArray());
});
