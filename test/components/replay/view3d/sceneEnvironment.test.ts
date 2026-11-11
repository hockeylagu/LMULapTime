import { expect, it, vi } from 'vitest';
import { Color, CubeCamera, WebGLCoordinateSystem, ShaderChunk, BoxGeometry, DirectionalLight, FogExp2, Mesh, MeshBasicMaterial, MeshStandardMaterial, NoToneMapping, OrthographicCamera, PerspectiveCamera, Scene, Texture, Vector3, type Camera, type ShaderMaterial, type WebGLRenderer } from 'three';
import { addSceneEnvironment, sceneLighting, sceneSun, SUN_DIRECTION, type SceneVenue } from '../../../../src/components/replay/view3d/sceneEnvironment.js';
import { hazeColour, hazeDensity, skyConditions } from '../../../../src/components/replay/view3d/atmosphere/skyDome.js';
import { SUN_UNIT, sunRadiance } from '../../../../src/components/replay/view3d/atmosphere/sunSamples.js';
import { TEST_HAZE_WEIGHTS, testShading, testSky, testSun } from '../../../helpers/scenes/sceneryProfiles.js';
import { solarPosition } from '../../../../src/components/replay/view3d/solarPosition.js';
import { cascadeShadowUniforms } from '../../../../src/components/replay/view3d/shadows/cascadeSampling.js';
import { crownSun } from '../../../../src/components/replay/view3d/scenery/materials/foliageCrown.js';

/** The sun's light in scene units, as the environment's sun carries it. */
const sunColour = (sun: Parameters<typeof sunRadiance>[0], elevationDeg: number, cloudCover: number) => sunRadiance(sun, elevationDeg, cloudCover).multiplyScalar(SUN_UNIT);

const probe = vi.hoisted(() => ({render: vi.fn<(scene: Scene) => void>(), dispose: vi.fn(), cubemaps: 0}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return {...actual, PMREMGenerator: class {
    fromScene(scene: Scene) { probe.render(scene); return {texture: new actual.Texture(), dispose: probe.dispose}; }
    fromCubemap() { probe.cubemaps++; return {texture: new actual.Texture(), dispose: probe.dispose}; }
    dispose() {}
  }};
});
const fakeRenderer = () => ({capabilities: {maxTextureSize: 16384}, state: {buffers: {depth: {getReversed: () => false, setReversed() {}}}}, render: vi.fn(), clear: vi.fn(), autoClear: true, getRenderTarget: () => null, setRenderTarget: vi.fn(), initRenderTarget: vi.fn(), getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0, xr: {enabled: false}, coordinateSystem: WebGLCoordinateSystem});
/** A venue without daylight: the default midday sun, the synthetic sky, the probe at the scene origin. */
const venue = (daylight?: SceneVenue['daylight'], position: [number, number, number] = [0, 0, 0]): SceneVenue => ({daylight, sky: testSky(), environmentProbe: {position}, shading: testShading()});
const skyMaterial = (scene: Scene) => (scene.getObjectByName('sky') as Mesh<BoxGeometry, ShaderMaterial>).material;

it('uses the analytic sky, PMREM and a sun light without three shadow maps, keeping the shared lighting chunks', () => {
  const scene = new Scene(), renderer = {toneMapping: 0, toneMappingExposure: 0, ...fakeRenderer()} as unknown as WebGLRenderer;
  const lightChunk = ShaderChunk.lights_fragment_begin, lightPars = ShaderChunk.lights_pars_begin;
  const material = new MeshStandardMaterial(), receiver = new Mesh(new BoxGeometry(), material); receiver.receiveShadow = true; scene.add(receiver);
  const environment = addSceneEnvironment(scene, renderer, venue(), new Vector3(), 'chase');
  expect(scene.getObjectByName('default-terrain')).toBeUndefined(); expect(scene.children.filter(child => child instanceof Mesh && child.name !== 'sky')).toEqual([receiver]);
  expect(scene.getObjectByName('sky')).toBeDefined();
  // Without daylight there is no haze to thicken the fog; the fog is exponential in the distance along the ray.
  expect(scene.fog).toBeInstanceOf(FogExp2); expect((scene.fog as FogExp2).density).toBe(0);
  expect(ShaderChunk.fog_fragment).toContain('1.0 - exp( - fogDensity * vFogDepth )');
  expect(ShaderChunk.fog_pars_fragment).toContain('const float HAZE_HEIGHT_AMOUNT = 0.0,');
  expect(skyMaterial(scene).name).toBe('sky-dome');
  // The dome hazes toward its own haze colour (set with the fog's, not three's fog).
  expect(skyMaterial(scene).fog).toBe(false); expect((skyMaterial(scene).uniforms.hazeColour.value as Color).r).toBeGreaterThan(0);
  expect(scene.background).toBeNull();
  expect(renderer.toneMapping).toBe(NoToneMapping); // The exposure pass applies the camera profile's tone curve.
  const camera = new PerspectiveCamera(48, 1.5, 0.5, 15000); camera.position.set(500, 3, -200); camera.updateMatrixWorld();
  environment.setCamera(camera); environment.update();
  const suns = scene.children.filter((child): child is DirectionalLight => child instanceof DirectionalLight);
  // One sun light; its shadow comes from the package's cascades (shadows/), not a three shadow map.
  expect(suns.map(light => light.name)).toEqual(['sun']);
  const [sun] = suns;
  expect(sun.castShadow).toBe(false); expect(sun.intensity).toBe(1);
  expect(sun.color.toArray()).toEqual(sunColour(testSun(), Math.asin(SUN_DIRECTION.y) * 180 / Math.PI, 0).toArray());
  expect(sun.position.clone().sub(sun.target.position).normalize().toArray().map(v => +v.toFixed(6))).toEqual(SUN_DIRECTION.toArray().map(v => +v.toFixed(6)));
  expect(crownSun.value.distanceTo(SUN_DIRECTION)).toBeLessThan(1e-9); // Foliage cards read the same sun.
  // Materials keep their own compile hooks and the shared lighting chunks stay three.js's.
  expect(material.defines ?? {}).not.toHaveProperty('USE_CSM');
  expect(ShaderChunk.lights_fragment_begin).toBe(lightChunk); expect(ShaderChunk.lights_pars_begin).toBe(lightPars);
  environment.setCamera(new OrthographicCamera(-80, 80, 80, -80, 0.5, 15000));
  environment.update(); expect(scene.children.filter(child => child instanceof DirectionalLight)).toHaveLength(1);
  expect(scene.environment).toBeInstanceOf(Texture); expect(scene.environmentIntensity).toBe(1);
  const sky = scene.getObjectByName('sky') as Mesh<BoxGeometry, ShaderMaterial>;
  const reflectedSky = probe.render.mock.calls.at(-1)![0].getObjectByName('sky') as Mesh;
  expect(reflectedSky.material).toBe(sky.material);
  // The lower hemisphere is sunlit ground (albedo 0.2), not a near-black plane: shaded faces get bounce light.
  const ground = probe.render.mock.calls.at(-1)![0].children.find(child => child instanceof Mesh && child.name !== 'sky') as Mesh<BoxGeometry, MeshBasicMaterial>;
  expect(ground.material.color.r).toBeCloseTo(0.2 * sun.color.r * SUN_DIRECTION.y / Math.PI, 6);
  expect((sky.material.uniforms.sunDirection.value as Vector3).distanceTo(SUN_DIRECTION)).toBeLessThan(1e-12);
  environment.dispose(); expect(scene.environment).toBeNull(); expect(probe.dispose).toHaveBeenCalledOnce();
  expect(scene.children.some(child => child instanceof DirectionalLight)).toBe(false);
});

it('lights a layout from its published daylight: race-start sun height and bearing', () => {
  const sessions = (race: number, sunBearingDeg?: number) => [{id: 'race' as const, localTime: '11:00', sunElevationDeg: race, sunBearingDeg}, {id: 'qualify' as const, localTime: '15:00', sunElevationDeg: 46.1},
    {id: 'practice1' as const, localTime: '11:00', sunElevationDeg: 51.88}, {id: 'practice2' as const, localTime: '15:30', sunElevationDeg: 40.89}];
  const fuji = sceneLighting({date: '2023-09-10', sessions: sessions(51.88, 136.26), airPollution: 0.5, hazeBaseScale: 0.55, ...TEST_HAZE_WEIGHTS, latitudeDeg: 35.37, longitudeDeg: 138.93, utcOffsetHours: 9});
  expect(Math.asin(fuji.sunDirection.y) * 180 / Math.PI).toBeCloseTo(51.88, 6);
  expect(fuji.sunDirection.x).toBeCloseTo(0.42680, 5);
  expect(fuji.sunDirection.z).toBeCloseTo(0.44600, 5);
  expect(fuji.sunDirection.length()).toBeCloseTo(1, 9);
  // A race start after sunset is held on the horizon (night is not drawn).
  expect(sceneLighting({date: '2023-11-04', sessions: sessions(-3), airPollution: 0.8, hazeBaseScale: 1, ...TEST_HAZE_WEIGHTS, latitudeDeg: 35.37, longitudeDeg: 138.93, utcOffsetHours: 9}).sunDirection.y).toBe(0);
  expect(sceneLighting().sunDirection.toArray()).toEqual(SUN_DIRECTION.toArray());
});

it("places the sun at the replay's clock: session start plus session time at the layout's location", () => {
  const sessions = [{id: 'race' as const, localTime: '13:00', sunElevationDeg: 50}, {id: 'qualify' as const, localTime: '12:45', sunElevationDeg: 46.1},
    {id: 'practice1' as const, localTime: '11:00', sunElevationDeg: 51.88}, {id: 'practice2' as const, localTime: '15:30', sunElevationDeg: 40.89}];
  const located = {date: '2023-09-10', sessions, airPollution: 0.5, hazeBaseScale: 0.55, ...TEST_HAZE_WEIGHTS, latitudeDeg: 35.37, longitudeDeg: 138.93, utcOffsetHours: 9};
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

it("takes the sun's colour and strength from the layout's sun grid in scene units, dimmed by the replay's cloud cover", () => {
  // Grid samples come back exactly, scaled by the one unit conversion.
  expect(sunColour(testSun(), 90, 0).toArray().map(v => +v.toFixed(9))).toEqual([100 * SUN_UNIT, 104 * SUN_UNIT, 95 * SUN_UNIT].map(v => +v.toFixed(9)));
  const low = sunColour(testSun(), 3, 0), high = sunColour(testSun(), 90, 0);
  expect(low.b / low.r).toBeLessThan(high.b / high.r); expect(low.r).toBeLessThan(high.r);
  // Full cover halves the synthetic grid; half cover sits between.
  expect(sunColour(testSun(), 90, 1).g).toBeCloseTo(52 * SUN_UNIT, 9);
  expect(sunColour(testSun(), 90, 0.5).g).toBeCloseTo(78 * SUN_UNIT, 9);
});

it("thickens the haze with the layout's haze scale and air pollution and colours it with the sky above the horizon toward the view", () => {
  const scene = new Scene(), renderer = {toneMapping: 0, toneMappingExposure: 0, ...fakeRenderer()} as unknown as WebGLRenderer;
  const daylight = {date: '2023-06-10', sessions: [{id: 'qualify' as const, localTime: '20:45', sunElevationDeg: 12, sunBearingDeg: 290}], airPollution: 0.6, hazeBaseScale: 1, ...TEST_HAZE_WEIGHTS, latitudeDeg: 47.95, longitudeDeg: 0.22, utcOffsetHours: 2};
  // The replay's cloud cover sets the weather, dims the sun and thickens the haze.
  const clock = {session: 'qualify' as const, startMinute: null, sessionTimeSec: 0, cloudCover: 0.62};
  const environment = addSceneEnvironment(scene, renderer, venue(daylight), new Vector3(), 'chase', sceneSun(venue(daylight), 0, clock)), fog = scene.fog as FogExp2;
  try {
    const sun = sceneLighting(daylight, clock).sunDirection, sunElevationDeg = Math.asin(sun.y) * 180 / Math.PI, weather = skyConditions(daylight, 0.62);
    expect(fog.density).toBeCloseTo(hazeDensity(testSky(), daylight, weather, sunElevationDeg), 12);
    const horizon = hazeColour(testSky(), sun, weather);
    expect((scene.getObjectByName('sun') as DirectionalLight).color.toArray()).toEqual(sunColour(testSun(), sunElevationDeg, 0.62).toArray());
    const camera = new PerspectiveCamera(48, 1.5, 0.5, 15000), toward = (x: number, z: number) => { camera.lookAt(x, 0, z); camera.updateMatrixWorld(); environment.update(); return fog.color.clone(); };
    environment.setCamera(camera);
    const sunward = toward(sun.x * 100, sun.z * 100), away = toward(-sun.x * 100, -sun.z * 100);
    const heading = Math.atan2(-sun.z, -sun.x), expected = horizon(heading, new Color());
    expect(away.toArray().map(v => +v.toFixed(6))).toEqual(expected.toArray().map(v => +v.toFixed(6)));
    // The haze toward a low sun is brighter than away from it.
    expect(sunward.r).toBeGreaterThan(away.r);
    // The haze chunks carry this scene's terms: the scene origin's height and the height and sun terms.
    expect(ShaderChunk.fog_pars_fragment).toContain('const float HAZE_ORIGIN_Y = 0.0;');
    expect(ShaderChunk.fog_fragment).toContain('HAZE_HEIGHT_AMOUNT');
  } finally { environment.dispose(); }
});

it("captures the venue at the package's probe without the cars, twice, and lights the scene with the second capture", () => {
  const render = vi.fn<(scene: Scene, camera: Camera) => void>(), scene = new Scene(), renderer = {toneMapping: 0, toneMappingExposure: 0, ...fakeRenderer(), render} as unknown as WebGLRenderer;
  const car = new Mesh(new BoxGeometry(), new MeshBasicMaterial()); scene.add(car);
  const seen: {at: number[]; car: boolean; lit: boolean; environment: Texture | null}[] = [];
  render.mockImplementation((_scene, camera) => {
    if (camera.parent instanceof CubeCamera) seen.push({at: camera.parent.position.toArray(), car: car.visible, lit: scene.environmentIntensity > 0, environment: scene.environment});
  });
  const environment = addSceneEnvironment(scene, renderer, venue(undefined, [110, 7, -40]), new Vector3(100, 5, 20), 'chase');
  environment.setDynamic([car]);
  try {
    const first = scene.environment, cubemaps = probe.cubemaps;
    environment.captureVenue();
    expect(probe.cubemaps - cubemaps).toBe(2); expect(seen).toHaveLength(12);
    // LMU local (110, 7, -40) against the origin (100, 5, 20): scene x right, y up, z mirrored.
    expect(seen.every(face => face.at.join() === '10,2,60' && !face.car)).toBe(true);
    expect(seen.slice(0, 6).every(face => !face.lit) && seen.slice(6).every(face => face.lit)).toBe(true);
    // The sun-only pass keeps the first environment bound (at zero intensity), so no material needs a second program.
    expect(seen.slice(0, 6).every(face => face.environment === first)).toBe(true); expect(scene.environmentIntensity).toBe(1);
    expect(car.visible).toBe(true); expect(scene.environment).not.toBe(first); expect(scene.environment).toBeInstanceOf(Texture);
  } finally { environment.dispose(); }
  expect(scene.environment).toBeNull();
});

it("samples the package's cascade set from its first draw, for any camera, and holds the surfaces lit on the next set's atlas", () => {
  const scene = new Scene(), render = vi.fn<(scene: Scene, camera: OrthographicCamera) => void>();
  const renderer = {...fakeRenderer(), render} as unknown as WebGLRenderer;
  const environment = addSceneEnvironment(scene, renderer, venue(), new Vector3(), 'chase');
  // From the start the surfaces sample an allocated depth texture, unread: WebGL drops draws whose shadow sampler has none.
  const chaseAtlas = cascadeShadowUniforms.surface_cascadeAtlas.value;
  expect(chaseAtlas?.isDepthTexture).toBe(true); expect(cascadeShadowUniforms.surface_cascadeCount.value).toBe(0);
  try {
    expect(environment.update()).toBe(false); expect(render).not.toHaveBeenCalled(); // No camera yet.
    environment.setCamera(new PerspectiveCamera(48, 1.5, 0.5, 15000));
    // The first frame draws the test chase set's three cascades, then the surfaces sample them.
    environment.update(); expect(render).toHaveBeenCalledTimes(3); expect(cascadeShadowUniforms.surface_cascadeCount.value).toBe(3);
    // The cockpit set (two cascades) replaces it: lit on its own atlas until its first draw.
    environment.setShadowCascades('cockpit'); expect(cascadeShadowUniforms.surface_cascadeCount.value).toBe(0);
    expect(cascadeShadowUniforms.surface_cascadeAtlas.value).not.toBe(chaseAtlas);
    environment.update(); expect(cascadeShadowUniforms.surface_cascadeCount.value).toBe(2);
    // The overhead camera is orthographic: the cascades follow it as well.
    render.mockClear(); environment.setShadowCascades('chase'); environment.setCamera(new OrthographicCamera(-80, 80, 80, -80, 0.5, 15000));
    environment.update(); expect(render).toHaveBeenCalledTimes(3); expect(cascadeShadowUniforms.surface_cascadeCount.value).toBe(3);
  } finally { environment.dispose(); }
  expect(cascadeShadowUniforms.surface_cascadeCount.value).toBe(0); expect(cascadeShadowUniforms.surface_cascadeAtlas.value).toBeNull();
});
