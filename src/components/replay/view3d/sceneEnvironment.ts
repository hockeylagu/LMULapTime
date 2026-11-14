import { BoxGeometry, Color, CubeCamera, DirectionalLight, DoubleSide, FogExp2, HalfFloatType, LinearMipmapLinearFilter, MathUtils, Mesh, MeshBasicMaterial, NoToneMapping, PlaneGeometry, PMREMGenerator, Scene, Vector3, WebGLCubeRenderTarget, type Camera, type Object3D, type OrthographicCamera, type PerspectiveCamera, type WebGLRenderTarget, type WebGLRenderer } from 'three';
import { nativeToScene } from './scene/sceneFrame.js';
import { createCascadeShadows, type CascadeShadows } from './shadows/cascadeShadows.js';
import { holdCascadeShadows, sampleCascadeShadows } from './shadows/cascadeSampling.js';
import { shadowCameraOf, shadowCascadeLayout, type ShadowCascadeLayout, type ShadowCascadeSet } from './shadows/shadowCascades.js';
import type { CarCamera } from '../../../../shared/types/scenes/car.js';
import type { SceneryDaylight, SceneryLayout } from '../../../../shared/types/scenes/scenery.js';
import type { ReplayDaylightClock } from '../../../../shared/types/replay.js';
import { solarPosition } from './solarPosition.js';
import { createSkyDomeMaterial, hazeColour, hazeDensity, heightHaze, skyConditions, sunwardHaze, type SkyConditions } from './atmosphere/skyDome.js';
import { createHaze } from './atmosphere/haze.js';
import { cloudCoverage, cloudSheets, sunVisibility, type CloudSheet } from './atmosphere/clouds.js';
import { createCloudLayer } from './atmosphere/cloudLayer.js';
import { SUN_UNIT, sunRadiance } from './atmosphere/sunSamples.js';
import { crownSun } from './scenery/materials/foliageCrown.js';
import { convolveReflection, type ReflectionCubes } from './reflectionCube.js';
import { integrationTexture, setSceneryReflection } from './scenery/materials/sceneryReflection.js';

/** The sun direction without a layout's daylight: midday, from the pipeline review viewer's daylight (pipeline/viewer/daylight.js). */
const DAYLIGHT = Object.freeze({elevationDeg: 55, azimuthDeg: 45});
const SKY_RADIUS_M = 12000, ENVIRONMENT_GROUND_Y = -0.5;
/** Mean reflectance of the ground around a circuit (grass, asphalt, concrete) for the bounce light of the first environment. */
const GROUND_ALBEDO = 0.2;
/** The venue capture: cube face size (the size of the venue cubes in the reference frame captures; no game file sets it) and how far it sees. */
export const VENUE_PROBE_PX = 128;
const VENUE_PROBE_FAR_M = 3000;
const sunToward = (elevationDeg: number) => {
  const a = MathUtils.degToRad(DAYLIGHT.azimuthDeg), e = MathUtils.degToRad(elevationDeg);
  return new Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
};
/** Unit vector toward the sun in scene space, without a layout's daylight. */
export const SUN_DIRECTION = sunToward(DAYLIGHT.elevationDeg);
/** Night is not drawn: a sun below the horizon lights the scene from the horizon. */
const MIN_SUN_ELEVATION_DEG = 0;

export interface SceneLighting { sunDirection: Vector3 }

/**
 * The replay's clock sets the sun: its session start (the track's default time for the session when the replay does not carry
 * one) plus the lap's session time, at the layout's location. Without a clock, the race session's published sun. Packages without
 * a bearing use the default scene azimuth. Without daylight, the default midday.
 */
export function sceneLighting(daylight?: SceneryDaylight, clock?: ReplayDaylightClock): SceneLighting {
  if (!daylight) return {sunDirection: SUN_DIRECTION.clone()};
  const id = clock?.session ?? 'race', session = daylight.sessions.find(entry => entry.id === id);
  if (!session) throw Error(`Layout daylight has no ${id} session`);
  let sun: {elevationDeg: number; bearingDeg?: number} = {elevationDeg: session.sunElevationDeg, bearingDeg: session.sunBearingDeg};
  if (clock) {
    const [hours, minutes] = session.localTime.split(':').map(Number);
    const minuteOfDay = (clock.startMinute ?? hours * 60 + minutes) + clock.sessionTimeSec / 60;
    sun = solarPosition(daylight.latitudeDeg, daylight.longitudeDeg, daylight.date, minuteOfDay, daylight.utcOffsetHours);
  }
  const elevationDeg = Math.max(MIN_SUN_ELEVATION_DEG, sun.elevationDeg);
  let sunDirection = sunToward(elevationDeg);
  if (sun.bearingDeg !== undefined) {
    const bearing = MathUtils.degToRad(sun.bearingDeg), elevation = MathUtils.degToRad(elevationDeg);
    const horizontal = Math.cos(elevation);
    const native = {x: horizontal * Math.sin(bearing), y: Math.sin(elevation), z: horizontal * Math.cos(bearing)};
    sunDirection = new Vector3(...nativeToScene(native, {x: 0, y: 0, z: 0}));
  }
  return {sunDirection};
}

export interface SceneEnvironment {
  /** The camera the shadow cascades follow and whose view direction turns the haze toward its horizon colour. */
  setCamera(camera: PerspectiveCamera | OrthographicCamera): void;
  /** Objects that move (the cars): the cached cascades and the venue capture are drawn without them. */
  setDynamic(objects: readonly Object3D[]): void;
  /**
   * The package cascade set the sun's shadow comes from (shadows/), with a car camera's own shadow keys over it (`shadowCameraOf`).
   * Cheap when neither changed: the shell sets it every frame.
   */
  setShadowCascades(set: ShadowCascadeSet, own: CarCamera['shadow']): void;
  /**
   * Captures the loaded scenery at the venue's probe (cars hidden) as the scene's environment: a first capture lit by the sun,
   * then one lit by the first, so shaded faces get the light the venue bounces. Call once the scenery around it is resident.
   */
  captureVenue(): void;
  /**
   * Lights the scene by another moment's sun and weather: the sky, the haze, the sun's light and its shadow (every cascade is drawn
   * again), the foliage and the clouds; the venue is captured again when it was captured already. Not during a render.
   */
  setSun(sun: SceneSun): void;
  /** Writes this scene's haze terms into the uniforms hazed materials read; each of the scene's renders does it too. */
  applyHaze(): void;
  /**
   * Before a frame renders: colours the haze toward the view and draws the shadow cascades that are due. True while cached
   * cascades are still due: the caller renders another frame.
   */
  update(): boolean;
  dispose(): void;
}

/** The layout values the environment reads: its daylight, the package's sky and where the venue's environment is captured. */
export type SceneVenue = Pick<SceneryLayout, 'daylight' | 'sky' | 'environmentProbe' | 'shading'>;

/**
 * The weather of a replay moment: the cloud coverage and how much of the sun's light passes the clouds, from the replay's cloud
 * field placed around an eye at the scene origin's height, with the placed sheets. A replay without a cloud field keeps its cloud
 * cover figure and has no sun visibility or sheets of its own.
 */
export function sceneClouds(venue: Pick<SceneVenue, 'sky' | 'shading'>, lighting: SceneLighting, originY: number, clock?: ReplayDaylightClock): {cloudCover: number; sunVisibility?: number; sheets?: CloudSheet[]} {
  const field = clock?.cloudField;
  if (!field) return {cloudCover: clock?.cloudCover ?? 0};
  // The cloud field is laid out in LMU local axes: the scene's z is the opposite one.
  const {x, y, z} = lighting.sunDirection, sheets = cloudSheets(venue.sky.clouds, field, originY);
  return {cloudCover: cloudCoverage(venue.sky.clouds, field), sunVisibility: sunVisibility(venue.shading.sunVisibility, venue.sky.clouds, sheets, [x, y, -z]), sheets};
}

/** The replay moment's sun and weather, worked out once for the environment and the exposure. */
export interface SceneSun {
  lighting: SceneLighting;
  sunElevationDeg: number;
  clouds: {cloudCover: number; sunVisibility?: number; sheets?: CloudSheet[]};
  weather: SkyConditions;
  /**
   * The direct sun's radiance in the package's light unit, before the clouds toward the sun dim it (sunSamples.ts): the layout's
   * sampled sun under the replay's cloud cover, dimmer and redder as the sun gets low. The replay's cover stands in for the base
   * coverage the grid is sampled by. Known gap (pipeline, 2026-11-09): clouded reference frames come out 2–20 % brighter than the grid.
   */
  radiance: Color;
}

/**
 * The sun from the replay's clock (sceneLighting) and the weather at the lap (sceneClouds): the replay's cloud cover sets the
 * weather and dims the sun. `originY` is the scene origin's height in LMU local metres.
 */
export function sceneSun(venue: Pick<SceneVenue, 'daylight' | 'sky' | 'shading'>, originY: number, clock?: ReplayDaylightClock): SceneSun {
  const lighting = sceneLighting(venue.daylight, clock), sunElevationDeg = MathUtils.radToDeg(Math.asin(MathUtils.clamp(lighting.sunDirection.y, -1, 1)));
  const clouds = sceneClouds(venue, lighting, originY, clock), weather = skyConditions(venue.daylight, clouds.cloudCover, clouds.sunVisibility);
  return {lighting, sunElevationDeg, clouds, weather, radiance: sunRadiance(venue.sky.sun, sunElevationDeg, weather.cloudCover)};
}

/**
 * Sky dome, horizon haze, a shadow-casting sun and an image-based light: first the sky over a sunlit ground, then the venue's own
 * capture. The scenery supplies its own terrain, filler ground and horizon; nothing here draws ground. `origin` is the scene
 * origin in LMU local metres.
 */
export function addSceneEnvironment(scene: Scene, renderer: WebGLRenderer, venue: SceneVenue, origin: Vector3, shadowSet: ShadowCascadeSet,
  ownShadow: CarCamera['shadow'], initial: SceneSun = sceneSun(venue, origin.y)): SceneEnvironment {
  const sky = new Mesh(new BoxGeometry(1, 1, 1), createSkyDomeMaterial(initial.lighting.sunDirection, venue.sky, venue.daylight, initial.weather));
  sky.scale.setScalar(SKY_RADIUS_M);
  sky.name = 'sky'; sky.frustumCulled = false;
  // The dome travels with the eye so its horizon stays at infinity at every zoom level.
  sky.onBeforeRender = (_renderer, _scene, camera: Camera) => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
  scene.background = null;
  const fog = new FogExp2(new Color(), 0);
  scene.fog = fog;
  // The first environment: the sky over a sunlit ground plane, so faces out of the sun get the light the ground bounces up to them
  // until the venue is captured.
  const environmentScene = new Scene(), environmentSky = sky.clone();
  const reflectedGround = new Mesh(new PlaneGeometry(24000, 24000), new MeshBasicMaterial({side: DoubleSide}));
  reflectedGround.rotation.x = -Math.PI / 2; reflectedGround.position.y = ENVIRONMENT_GROUND_Y;
  environmentScene.add(environmentSky, reflectedGround);
  // One generator for this environment and the venue's captures: a new one links its prefilter programs again.
  const generator = new PMREMGenerator(renderer);
  let firstEnvironment: WebGLRenderTarget | null = null, venueProbe: WebGLRenderTarget | null = null, venueCube: WebGLCubeRenderTarget | null = null, reflection: ReflectionCubes | null = null;
  const integration = integrationTexture(venue.shading.integrationMap);
  setSceneryReflection(venue.shading, null, integration);
  // The exposure pass applies the camera profile's tone curve (autoExposure.ts): nothing else tone-maps.
  renderer.toneMapping = NoToneMapping;
  // The sun lights the scene from its direction; its shadow comes from the package's cascades (shadows/). The colour carries the strength.
  const sun = new DirectionalLight(new Color(), 1), toSun = initial.lighting.sunDirection.clone().normalize();
  sun.name = 'sun';
  scene.add(sun, sun.target);
  let view: PerspectiveCamera | OrthographicCamera | null = null, dynamic: readonly Object3D[] = [];
  // The surfaces sample a set only after its first draw; until then they are held lit on its atlas.
  const startCascades = (set: ShadowCascadeSet, own: CarCamera['shadow']) => {
    const {shadows} = venue.shading, layout = shadowCascadeLayout(shadows, shadowCameraOf(shadows.cameras[set], own));
    const pass = createCascadeShadows(renderer, scene, shadows, layout, toSun.clone().negate());
    holdCascadeShadows(pass.state.atlas);
    return {set, own, layout, pass, sampled: false};
  };
  let cascades: {set: ShadowCascadeSet; own: CarCamera['shadow']; layout: ShadowCascadeLayout; pass: CascadeShadows; sampled: boolean} =
    startCascades(shadowSet, ownShadow), lit = false;
  scene.add(sky);
  /** The haze colour toward a view heading (and the sky's, just above the horizon), and the haze terms hazed materials read. */
  let haze: ReturnType<typeof hazeColour> = () => fog.color, applyHaze: () => void = () => {}, cloudLayer: ReturnType<typeof createCloudLayer> | null = null;
  const heading = new Vector3();
  const skyHaze = () => sky.material.uniforms.hazeColour.value as Color;
  /** Everything the sun and the weather set. */
  const light = ({lighting, sunElevationDeg, clouds, weather, radiance}: SceneSun) => {
    // The weather thickens the haze; the clouds toward the sun dim the sun's light further.
    const clearSun = radiance.clone().multiplyScalar(SUN_UNIT), sunRgb = clearSun.clone().multiplyScalar(clouds.sunVisibility ?? 1);
    toSun.copy(lighting.sunDirection).normalize();
    if (lit) {
      // The same program: only its uniforms change.
      const previous = sky.material;
      sky.material = environmentSky.material = createSkyDomeMaterial(lighting.sunDirection, venue.sky, venue.daylight, weather);
      previous.dispose();
    }
    // The haze takes its colour from the sky just above the horizon toward the view (update); the sun's light, the height term and
    // the distance shape are in the hazed materials' programs (haze.ts).
    haze = hazeColour(venue.sky, lighting.sunDirection, weather);
    haze(view ? Math.atan2(view.getWorldDirection(heading).z, heading.x) : 0, fog.color, skyHaze());
    fog.density = hazeDensity(venue.sky, venue.daylight, weather, sunElevationDeg);
    applyHaze = createHaze({originY: origin.y, height: heightHaze(venue.sky, venue.daylight, weather), sunDirection: toSun.clone(),
      sunRadiance: sunRgb.clone(), sunward: sunwardHaze(venue.sky, weather)});
    applyHaze();
    // Ground radiance is a lambertian ground of GROUND_ALBEDO under the sun: albedo · sun · sin(elevation) / π.
    reflectedGround.material.color.copy(sunRgb).multiplyScalar(GROUND_ALBEDO * Math.max(0, toSun.y) / Math.PI);
    sun.color.copy(sunRgb); sun.position.copy(toSun);
    crownSun.value.copy(toSun); // Foliage cards tilt their lighting normal up less as they come to face the sun.
    if (lit) cascades.pass.setLight(toSun.clone().negate());
    // The clouds are lit by the sun before they dim it. The first environment and the venue capture are taken without them.
    if (cloudLayer) { scene.remove(cloudLayer.group); cloudLayer.dispose(); }
    cloudLayer = clouds.sheets ? createCloudLayer(venue.sky.clouds, clouds.sheets, {sunDirection: toSun.clone(), sunGreen: clearSun.g, cloudCover: weather.cloudCover}) : null;
    if (cloudLayer) scene.add(cloudLayer.group);
    if (!venueProbe) {
      firstEnvironment?.dispose();
      firstEnvironment = generator.fromScene(environmentScene, 0, 0.1, SKY_RADIUS_M, {size: VENUE_PROBE_PX});
      scene.environment = firstEnvironment.texture;
    }
    lit = true;
  };
  light(initial);
  // Hazed materials read the terms of the scene that rendered last: each scene writes its own before it renders.
  scene.onBeforeRender = () => applyHaze();
  const [probeX, probeY, probeZ] = venue.environmentProbe.position;
  const probeAt = new Vector3(...nativeToScene({x: probeX, y: probeY, z: probeZ}, origin));
  const captureVenue = () => {
    // The cube keeps its mips: the reflection convolution reads them.
    const cube = new WebGLCubeRenderTarget(VENUE_PROBE_PX, {type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter}), camera = new CubeCamera(0.5, VENUE_PROBE_FAR_M, cube);
    if (camera.coordinateSystem !== renderer.coordinateSystem) { camera.coordinateSystem = renderer.coordinateSystem; camera.updateCoordinateSystem(); }
    camera.position.copy(probeAt); camera.updateMatrixWorld();
    // The scene's world matrices update once per frame, not per render (sceneShell), and the capture may come before the first
    // frame: without this, the sun's light has no direction yet and the probe sees the venue unlit by it.
    scene.updateMatrixWorld();
    const shown = dynamic.map(object => object.visible);
    try {
      dynamic.forEach(object => { object.visible = false; });
      if (cloudLayer) cloudLayer.group.visible = false;
      // The first capture is lit by the sun alone; the second adds the light of the first. The environment stays set at zero
      // intensity, and the first environment has the probe's size: an unset or differently sized one is another program variant
      // of every material, compiled on the main thread here instead of by the warm-up.
      scene.environmentIntensity = 0;
      for (let pass = 0; pass < 2; pass++) {
        camera.update(renderer, scene);
        const next = generator.fromCubemap(cube.texture);
        scene.environment = next.texture; scene.environmentIntensity = 1; venueProbe?.dispose(); venueProbe = next;
      }
      reflection?.dispose(); venueCube?.dispose();
      reflection = convolveReflection(renderer, cube, venue.shading.convolution.kernels); venueCube = cube;
      setSceneryReflection(venue.shading, reflection.convolved, integration);
    } finally {
      dynamic.forEach((object, i) => { object.visible = shown[i]; });
      if (cloudLayer) cloudLayer.group.visible = true;
      if (venueCube !== cube) cube.dispose();
    }
  };
  return {
    setCamera(camera) { view = camera; },
    setDynamic(objects) { dynamic = objects; },
    setShadowCascades(set, own) {
      if (cascades.set === set && cascades.own === own) return;
      const previous = cascades.pass;
      cascades = startCascades(set, own); previous.dispose();
    },
    applyHaze: () => applyHaze(),
    captureVenue,
    setSun(next) {
      light(next);
      if (venueProbe) captureVenue();
    },
    update() {
      if (!view) return false;
      view.getWorldDirection(heading); haze(Math.atan2(heading.z, heading.x), fog.color, skyHaze());
      const set = cascades, drawing = set.pass.update(view, dynamic);
      if (!set.sampled) { sampleCascadeShadows(venue.shading.shadows, set.layout, set.pass.state); set.sampled = true; }
      return drawing;
    },
    dispose() {
      holdCascadeShadows(null); cascades.pass.dispose();
      scene.remove(sun, sun.target); sun.dispose();
      scene.environment = null; generator.dispose(); firstEnvironment?.dispose(); venueProbe?.dispose(); reflection?.dispose(); venueCube?.dispose();
      setSceneryReflection(venue.shading, null, integration); integration.dispose(); reflectedGround.geometry.dispose(); reflectedGround.material.dispose();
      sky.geometry.dispose(); sky.material.dispose();
      if (cloudLayer) { scene.remove(cloudLayer.group); cloudLayer.dispose(); }
    },
  };
}
