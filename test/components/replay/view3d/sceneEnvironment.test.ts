import { expect, it, vi } from 'vitest';
import { Color, ShaderChunk, BoxGeometry, DirectionalLight, FogExp2, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshStandardMaterial, NoToneMapping, OrthographicCamera, PerspectiveCamera, Scene, Texture, Vector3, type WebGLRenderer } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { addSceneEnvironment, DAYLIGHT, sceneLighting, SUN_DIRECTION, sunTransmittance } from '../../../../src/components/replay/view3d/sceneEnvironment.js';
import { solarPosition } from '../../../../src/components/replay/view3d/solarPosition.js';
import { staticShadowUniforms } from '../../../../src/components/replay/view3d/sunShadows.js';

const probe = vi.hoisted(() => ({render: vi.fn<(scene: Scene) => void>(), dispose: vi.fn()}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return {...actual, PMREMGenerator: class {
    fromScene(scene: Scene) { probe.render(scene); return {texture: new actual.Texture(), dispose: probe.dispose}; }
    dispose() {}
  }};
});
const fakeRenderer = () => ({render: vi.fn(), clear: vi.fn(), autoClear: true, getRenderTarget: () => null, setRenderTarget: vi.fn()});

it('uses standard sky, PMREM and a near sun shadow without touching shared shader chunks', () => {
  const scene = new Scene(), renderer = {shadowMap: {enabled: false, type: 0, autoUpdate: true}, toneMapping: 0, toneMappingExposure: 0, ...fakeRenderer()} as unknown as WebGLRenderer;
  const lightChunk = ShaderChunk.lights_fragment_begin, lightPars = ShaderChunk.lights_pars_begin;
  const material = new MeshStandardMaterial(), receiver = new Mesh(new BoxGeometry(), material); receiver.receiveShadow = true; scene.add(receiver);
  const environment = addSceneEnvironment(scene, renderer);
  expect(scene.getObjectByName('default-terrain')).toBeUndefined(); expect(scene.children.filter(child => child instanceof Mesh && child.name !== 'sky')).toEqual([receiver]);
  expect(scene.getObjectByName('sky')).toBeDefined();
  expect(scene.fog).toBeInstanceOf(FogExp2); expect((scene.fog as FogExp2).density).toBe(DAYLIGHT.fogDensity);
  // Without a replay's cloud cover the sky is clear and the haze keeps its midday colour.
  expect((scene.fog as FogExp2).color.getHexString()).toBe(DAYLIGHT.horizonColor.slice(1));
  expect((scene.getObjectByName('sky') as Sky).material.uniforms.cloudCoverage.value).toBe(0);
  expect(scene.background).toBeNull(); expect(renderer.shadowMap.enabled).toBe(true);
  expect(renderer.toneMapping).toBe(NoToneMapping); // The exposure pass applies the camera profile's tone curve.
  const camera = new PerspectiveCamera(48, 1.5, 0.5, 15000); camera.position.set(500, 3, -200); camera.updateMatrixWorld();
  environment.setCamera(camera); environment.update(new Vector3(500, 0, -210));
  const suns = scene.children.filter((child): child is DirectionalLight => child instanceof DirectionalLight);
  // One sun light: the static scenery map is its own pass (sunShadows.ts).
  expect(suns.map(light => light.name)).toEqual(['sun']);
  const [sun] = suns;
  expect(sun.castShadow).toBe(true); expect(sun.intensity).toBe(DAYLIGHT.sunIntensity);
  expect(sun.shadow.mapSize.toArray()).toEqual([4096, 4096]);
  expect(sun.shadow.camera.right - sun.shadow.camera.left).toBe(80);
  expect(sun.shadow.intensity).toBe(1); expect(sun.shadow.radius).toBe(0);
  expect(sun.shadow.bias).toBe(0.000001); expect(sun.shadow.normalBias).toBe(0.05);
  expect(sun.position.clone().sub(sun.target.position).normalize().toArray().map(v => +v.toFixed(6))).toEqual(SUN_DIRECTION.toArray().map(v => +v.toFixed(6)));
  // Materials keep their own compile hooks and the shared lighting chunks stay three.js's.
  expect(material.defines ?? {}).not.toHaveProperty('USE_CSM');
  expect(ShaderChunk.lights_fragment_begin).toBe(lightChunk); expect(ShaderChunk.lights_pars_begin).toBe(lightPars);
  environment.setCamera(new OrthographicCamera(-80, 80, 80, -80, 0.5, 15000));
  environment.update(new Vector3()); expect(scene.children.filter(child => child instanceof DirectionalLight)).toHaveLength(1);
  expect(scene.environment).toBeInstanceOf(Texture); expect(scene.environmentIntensity).toBe(1); expect((scene.getObjectByName('sky') as Sky).material.blendColor.r).toBeCloseTo(DAYLIGHT.skyScale);
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
  const scene = new Scene(), renderer = {shadowMap: {enabled: false, type: 0, autoUpdate: true}, ...fakeRenderer()} as unknown as WebGLRenderer;
  const environment = addSceneEnvironment(scene, renderer), camera = new PerspectiveCamera(48, 1.5, 0.5, 15000);
  camera.position.set(0, 3, 10); camera.lookAt(0, 0, 0); environment.setCamera(camera);
  try {
    const sun = scene.children.find((child): child is DirectionalLight => child instanceof DirectionalLight)!;
    const texel = 80 / 4096, sunAxis = (point: Vector3) => point.clone().projectOnPlane(SUN_DIRECTION);
    environment.update(new Vector3(0, 0, 0));
    // The camera looks along -z: the window leads the focus by 25 m that way (within half a texel of snapping).
    const centre = sunAxis(sun.target.position).sub(sunAxis(new Vector3(0, 0, -25)));
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

it('draws the static shadow map a quarter per frame without the cars or sub-metre casters, again after 200 m (100 m after a scenery change)', () => {
  const scene = new Scene(), render = vi.fn<(scene: Scene, camera: OrthographicCamera) => void>();
  const renderer = {shadowMap: {enabled: false, type: 0, autoUpdate: true}, ...fakeRenderer(), render} as unknown as WebGLRenderer;
  const environment = addSceneEnvironment(scene, renderer), camera = new PerspectiveCamera(48, 1.5, 0.5, 15000);
  const car = new Mesh(new BoxGeometry(), new MeshBasicMaterial()); scene.add(car);
  const bolt = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial()), stand = new Mesh(new BoxGeometry(20, 10, 5), new MeshBasicMaterial());
  const standMaterial = stand.material;
  bolt.castShadow = true; stand.castShadow = true; scene.add(bolt, stand); scene.updateMatrixWorld();
  const drawn: {car: boolean; bolt: boolean; standDepth: boolean; nearRedrawn: boolean; width: number}[] = [];
  render.mockImplementation((_scene, tile) => {
    drawn.push({car: car.visible, bolt: bolt.visible, standDepth: stand.visible && stand.material instanceof MeshDepthMaterial,
      nearRedrawn: renderer.shadowMap.autoUpdate, width: tile.right - tile.left});
  });
  expect(environment.update(new Vector3())).toBe(false); expect(render).not.toHaveBeenCalled(); // No camera yet.
  environment.setCamera(camera); environment.setDynamic([car]);
  try {
    // The first map draws its four 600 m quarters at once, with depth materials, without the car, the bolt or a near-map redraw.
    expect(environment.update(new Vector3())).toBe(false); expect(render).toHaveBeenCalledTimes(4);
    expect(drawn.every(frame => !frame.car && !frame.bolt && frame.standDepth && !frame.nearRedrawn && frame.width === 600)).toBe(true);
    expect(car.visible && bolt.visible && stand.material === standMaterial && renderer.shadowMap.autoUpdate).toBe(true);
    const first = staticShadowUniforms.map.value; expect(first).not.toBeNull(); expect(staticShadowUniforms.ready.value).toBe(1);
    expect(environment.update(new Vector3(150, 0, 0))).toBe(false); expect(render).toHaveBeenCalledTimes(4);
    // Later maps draw a quarter per frame while the surfaces keep the previous map, then swap.
    expect([201, 202, 203].map(x => environment.update(new Vector3(x, 0, 0)))).toEqual([true, true, true]);
    expect(render).toHaveBeenCalledTimes(7); expect(staticShadowUniforms.map.value).toBe(first);
    expect(environment.update(new Vector3(204, 0, 0))).toBe(false); expect(render).toHaveBeenCalledTimes(8);
    expect(staticShadowUniforms.map.value).not.toBe(first);
    // A scenery change redraws once the view has moved 100 m.
    environment.staticShadowStale(); expect(environment.update(new Vector3(250, 0, 0))).toBe(false); expect(render).toHaveBeenCalledTimes(8);
    expect(environment.update(new Vector3(302, 0, 0))).toBe(true); expect(render).toHaveBeenCalledTimes(9);
  } finally { environment.dispose(); }
  expect(staticShadowUniforms.map.value).toBeNull(); expect(staticShadowUniforms.ready.value).toBe(0);
});

it('lights a layout from its published daylight: race-start sun height, turbidity from air pollution', () => {
  const sessions = (race: number, sunBearingDeg?: number) => [{id: 'race' as const, localTime: '11:00', sunElevationDeg: race, sunBearingDeg}, {id: 'qualify' as const, localTime: '15:00', sunElevationDeg: 46.1},
    {id: 'practice1' as const, localTime: '11:00', sunElevationDeg: 51.88}, {id: 'practice2' as const, localTime: '15:30', sunElevationDeg: 40.89}];
  const fuji = sceneLighting({date: '2023-09-10', sessions: sessions(51.88, 136.26), airPollution: 0.5, hazeBaseScale: 0.55, latitudeDeg: 35.37, longitudeDeg: 138.93, utcOffsetHours: 9});
  expect(Math.asin(fuji.sunDirection.y) * 180 / Math.PI).toBeCloseTo(51.88, 6);
  expect(fuji.sunDirection.x).toBeCloseTo(0.42680, 5);
  expect(fuji.sunDirection.z).toBeCloseTo(0.44600, 5);
  expect(fuji.sunDirection.length()).toBeCloseTo(1, 9);
  expect(fuji.turbidity).toBeCloseTo(2.75, 9);
  // A race start after sunset is still lit by a low sun.
  expect(sceneLighting({date: '2023-11-04', sessions: sessions(-3), airPollution: 0.8, hazeBaseScale: 1, latitudeDeg: 35.37, longitudeDeg: 138.93, utcOffsetHours: 9}).sunDirection.y).toBeGreaterThan(0.15);
  expect(sceneLighting().sunDirection.toArray()).toEqual(SUN_DIRECTION.toArray());
});

it("places the sun at the replay's clock: session start plus session time at the layout's location", () => {
  const sessions = [{id: 'race' as const, localTime: '13:00', sunElevationDeg: 50}, {id: 'qualify' as const, localTime: '12:45', sunElevationDeg: 46.1},
    {id: 'practice1' as const, localTime: '11:00', sunElevationDeg: 51.88}, {id: 'practice2' as const, localTime: '15:30', sunElevationDeg: 40.89}];
  const located = {date: '2023-09-10', sessions, airPollution: 0.5, hazeBaseScale: 0.55, latitudeDeg: 35.37, longitudeDeg: 138.93, utcOffsetHours: 9};
  const height = (lighting: {sunDirection: {y: number}}) => Math.asin(lighting.sunDirection.y) * 180 / Math.PI;
  // An online event's start (here 15:30 qualifying, 120 s in) wins over the session default.
  expect(height(sceneLighting(located, {session: 'qualify', startMinute: 930, sessionTimeSec: 120})))
    .toBeCloseTo(solarPosition(35.37, 138.93, '2023-09-10', 932, 9).elevationDeg, 6);
  // Offline, the session's default time, plus the session time.
  expect(height(sceneLighting(located, {session: 'practice1', startMinute: null, sessionTimeSec: 3600})))
    .toBeCloseTo(solarPosition(35.37, 138.93, '2023-09-10', 720, 9).elevationDeg, 6);
  // Without a clock, the race session's published sun.
  expect(height(sceneLighting(located))).toBeCloseTo(50, 6);
});

it('computes the sun position: overhead at the equator at solar noon on the equinox, east in the morning, west in the afternoon', () => {
  expect(solarPosition(0, 0, '2026-03-20', 12 * 60 + 7, 0).elevationDeg).toBeGreaterThan(89);
  const morning = solarPosition(48, 0, '2026-06-21', 9 * 60, 0), afternoon = solarPosition(48, 0, '2026-06-21', 15 * 60 + 4, 0);
  expect(morning.bearingDeg).toBeGreaterThan(90); expect(morning.bearingDeg).toBeLessThan(135);
  expect(afternoon.bearingDeg).toBeGreaterThan(225); expect(afternoon.bearingDeg).toBeLessThan(270);
  expect(morning.elevationDeg).toBeCloseTo(afternoon.elevationDeg, 0);
});

it('dims and reddens a low sun through the air mass and hides it under cloud, never brighter than the calibrated sun', () => {
  expect(sunTransmittance(DAYLIGHT.elevationDeg).toArray()).toEqual([1, 1, 1]);
  expect(sunTransmittance(85).toArray()).toEqual([1, 1, 1]);
  const low = sunTransmittance(12);
  expect(low.b).toBeLessThan(low.g);
  expect(low.g).toBeLessThan(low.r);
  expect(low.r).toBeLessThan(1);
  expect(sunTransmittance(12, 0.13).r).toBeLessThan(low.r * 0.6);
  expect(sunTransmittance(DAYLIGHT.elevationDeg, 1).toArray()).toEqual([0, 0, 0]);
});

it("covers the sky with the replay's cloud cover and lights the haze with the sun that reaches it", () => {
  const scene = new Scene(), renderer = {shadowMap: {enabled: false, type: 0, autoUpdate: true}, toneMapping: 0, toneMappingExposure: 0, ...fakeRenderer()} as unknown as WebGLRenderer;
  const daylight = {date: '2023-06-10', sessions: [{id: 'qualify' as const, localTime: '20:45', sunElevationDeg: 12, sunBearingDeg: 290}], airPollution: 0.6, hazeBaseScale: 1, latitudeDeg: 47.95, longitudeDeg: 0.22, utcOffsetHours: 2};
  const environment = addSceneEnvironment(scene, renderer, daylight, {session: 'qualify', startMinute: null, sessionTimeSec: 0, cloudCover: 0.62});
  expect((scene.getObjectByName('sky') as Sky).material.uniforms.cloudCoverage.value).toBe(0.62);
  const haze = (scene.fog as FogExp2).color, midday = new Color(DAYLIGHT.horizonColor);
  expect(haze.g).toBeLessThan(midday.g * 0.5);
  expect(haze.b / haze.r).toBeLessThan(midday.b / midday.r);
  environment.dispose();
});

