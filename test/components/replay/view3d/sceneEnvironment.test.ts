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

it('uses standard sky, PMREM and one sun shadow without touching shared shader chunks', () => {
  const scene = new Scene(), renderer = {shadowMap: {enabled: false, type: 0}, toneMapping: 0, toneMappingExposure: 0} as unknown as WebGLRenderer;
  const lightChunk = ShaderChunk.lights_fragment_begin, lightPars = ShaderChunk.lights_pars_begin;
  const material = new MeshStandardMaterial(), receiver = new Mesh(new BoxGeometry(), material); receiver.receiveShadow = true; scene.add(receiver);
  const environment = addSceneEnvironment(scene, renderer);
  expect(scene.getObjectByName('default-terrain')).toBeUndefined(); expect(scene.children.filter(child => child instanceof Mesh && child.name !== 'sky')).toEqual([receiver]);
  expect(scene.getObjectByName('sky')).toBeDefined();
  expect(scene.fog).toBeInstanceOf(FogExp2); expect((scene.fog as FogExp2).density).toBe(DAYLIGHT.fogDensity);
  expect(scene.background).toBeNull(); expect(renderer.shadowMap.enabled).toBe(true);
  expect(renderer.toneMapping).toBe(NeutralToneMapping); expect(renderer.toneMappingExposure).toBe(0.90);
  const camera = new PerspectiveCamera(48, 1.5, 0.5, 15000); camera.position.set(500, 3, -200); camera.updateMatrixWorld();
  environment.setCamera(camera); environment.update(new Vector3(500, 0, -210));
  const suns = scene.children.filter((child): child is DirectionalLight => child instanceof DirectionalLight);
  expect(suns).toHaveLength(1);
  const [sun] = suns;
  expect(sun.castShadow).toBe(true); expect(sun.intensity).toBe(DAYLIGHT.sunIntensity);
  expect(sun.shadow.mapSize.toArray()).toEqual([4096, 4096]);
  expect(sun.shadow.camera.right - sun.shadow.camera.left).toBe(160);
  expect(sun.shadow.intensity).toBe(1); expect(sun.shadow.radius).toBe(1);
  expect(sun.shadow.bias).toBe(0.000001); expect(sun.shadow.normalBias).toBe(0.01);
  expect(sun.position.clone().sub(sun.target.position).normalize().toArray().map(v => +v.toFixed(6))).toEqual(SUN_DIRECTION.toArray().map(v => +v.toFixed(6)));
  // Materials keep their own compile hooks and the shared lighting chunks stay three.js's.
  expect(material.defines ?? {}).not.toHaveProperty('USE_CSM');
  expect(ShaderChunk.lights_fragment_begin).toBe(lightChunk); expect(ShaderChunk.lights_pars_begin).toBe(lightPars);
  environment.setCamera(new OrthographicCamera(-80, 80, 80, -80, 0.5, 15000));
  environment.update(new Vector3()); expect(scene.children.filter(child => child instanceof DirectionalLight)).toHaveLength(1);
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
  expect(scene.children.some(child => child instanceof DirectionalLight)).toBe(false);
});

it('centres the shadow window ahead of the focus along the view and snaps it to whole texels', () => {
  const scene = new Scene(), renderer = {shadowMap: {enabled: false, type: 0}} as unknown as WebGLRenderer;
  const environment = addSceneEnvironment(scene, renderer), camera = new PerspectiveCamera(48, 1.5, 0.5, 15000);
  camera.position.set(0, 3, 10); camera.lookAt(0, 0, 0); environment.setCamera(camera);
  try {
    const sun = scene.children.find((child): child is DirectionalLight => child instanceof DirectionalLight)!;
    const texel = 160 / 4096, sunAxis = (point: Vector3) => point.clone().projectOnPlane(SUN_DIRECTION);
    environment.update(new Vector3(0, 0, 0));
    // The camera looks along -z: the window leads the focus by 50 m that way (within half a texel of snapping).
    const centre = sunAxis(sun.target.position).sub(sunAxis(new Vector3(0, 0, -50)));
    expect(centre.length()).toBeLessThanOrEqual(texel);
    // Wherever the focus goes, the world origin sits on a whole texel of the shadow camera, so texels never slide under the scene.
    const onGrid = (value: number) => Math.abs(value / texel - Math.round(value / texel)) < 1e-3;
    for (const x of [0.013, 3.7, 10, 123.456]) {
      environment.update(new Vector3(x, 0, -x / 3));
      sun.shadow.updateMatrices(sun);
      const origin = new Vector3().applyMatrix4(sun.shadow.camera.matrixWorldInverse);
      expect(onGrid(origin.x) && onGrid(origin.y)).toBe(true);
    }
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
