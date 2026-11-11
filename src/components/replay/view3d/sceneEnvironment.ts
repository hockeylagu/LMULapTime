import { BoxGeometry, Color, CubeCamera, DirectionalLight, DoubleSide, FogExp2, HalfFloatType, LinearMipmapLinearFilter, MathUtils, Mesh, MeshBasicMaterial, NoToneMapping, PlaneGeometry, PMREMGenerator, Scene, Vector3, WebGLCubeRenderTarget, type Camera, type Object3D, type OrthographicCamera, type PerspectiveCamera, type WebGLRenderTarget, type WebGLRenderer } from 'three';
import { nativeToScene } from './sceneFrame.js';
import { createCascadeShadows, type CascadeShadows } from './shadows/cascadeShadows.js';
import { holdCascadeShadows, sampleCascadeShadows } from './shadows/cascadeSampling.js';
import { shadowCascadeLayout, type ShadowCascadeLayout, type ShadowCascadeSet } from './shadows/shadowCascades.js';
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
  /** The package cascade set the sun's shadow comes from (shadows/). */
  setShadowCascades(set: ShadowCascadeSet): void;
  /**
   * Captures the loaded scenery at the venue's probe (cars hidden) as the scene's environment: a first capture lit by the sun,
   * then one lit by the first, so shaded faces get the light the venue bounces. Call once the scenery around it is resident.
   */
  captureVenue(): void;
  /** Writes this scene's haze into the shader chunks: call before compiling its materials outside a render. */
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
  {lighting, sunElevationDeg, clouds, weather, radiance}: SceneSun = sceneSun(venue, origin.y)): SceneEnvironment {
  // The weather thickens the haze; the clouds toward the sun dim the sun's light further.
  const clearSun = radiance.clone().multiplyScalar(SUN_UNIT), sunRgb = clearSun.clone().multiplyScalar(clouds.sunVisibility ?? 1);
  const sky = new Mesh(new BoxGeometry(1, 1, 1), createSkyDomeMaterial(lighting.sunDirection, venue.sky, venue.daylight, weather));
  sky.scale.setScalar(SKY_RADIUS_M);
  sky.name = 'sky'; sky.frustumCulled = false;
  // The dome travels with the eye so its horizon stays at infinity at every zoom level.
  sky.onBeforeRender = (_renderer, _scene, camera: Camera) => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
  scene.background = null;
  // The haze takes its colour from the sky just above the horizon toward the view (update); the sun's light, the height term and
  // the distance shape are in the fog chunks (haze.ts).
  const haze = hazeColour(venue.sky, lighting.sunDirection, weather), heading = new Vector3(), skyHaze = sky.material.uniforms.hazeColour.value as Color;
  const fog = new FogExp2(haze(0, new Color(), skyHaze), hazeDensity(venue.sky, venue.daylight, weather, sunElevationDeg));
  scene.fog = fog;

  // The first environment: the sky over a sunlit ground plane, so faces out of the sun get the light the ground bounces up to them
  // until the venue is captured. Ground radiance is a lambertian ground of GROUND_ALBEDO under the sun: albedo · sun · sin(elevation) / π.
  const environmentScene = new Scene(), environmentSky = sky.clone();
  const groundRadiance = GROUND_ALBEDO * Math.max(0, lighting.sunDirection.y) / Math.PI;
  const applyHaze = createHaze({originY: origin.y, height: heightHaze(venue.sky, venue.daylight, weather), sunDirection: lighting.sunDirection.clone().normalize(),
    sunRadiance: sunRgb.clone(), sunward: sunwardHaze(venue.sky, weather)});
  // Programs compile on a scene's render (and the warm-up's compile, `applyHaze`): each writes this scene's haze terms back first.
  applyHaze(); scene.onBeforeRender = applyHaze;
  const reflectedGround = new Mesh(new PlaneGeometry(24000, 24000), new MeshBasicMaterial({color: sunRgb.clone().multiplyScalar(groundRadiance), side: DoubleSide}));
  reflectedGround.rotation.x = -Math.PI / 2; reflectedGround.position.y = ENVIRONMENT_GROUND_Y;
  environmentScene.add(environmentSky, reflectedGround);
  // One generator for this environment and the venue's captures: a new one links its prefilter programs again.
  const generator = new PMREMGenerator(renderer), firstEnvironment = generator.fromScene(environmentScene, 0, 0.1, SKY_RADIUS_M, {size: VENUE_PROBE_PX});
  scene.environment = firstEnvironment.texture;
  let venueProbe: WebGLRenderTarget | null = null, venueCube: WebGLCubeRenderTarget | null = null, reflection: ReflectionCubes | null = null;
  const integration = integrationTexture(venue.shading.integrationMap);
  setSceneryReflection(venue.shading, null, integration);
  // The exposure pass applies the camera profile's tone curve (autoExposure.ts): nothing else tone-maps.
  renderer.toneMapping = NoToneMapping;

  // The sun lights the scene from its direction; its shadow comes from the package's cascades (shadows/). The colour carries the strength.
  const sun = new DirectionalLight(sunRgb, 1), toSun = lighting.sunDirection.clone().normalize();
  sun.name = 'sun'; sun.position.copy(toSun);
  scene.add(sun, sun.target);
  crownSun.value.copy(toSun); // Foliage cards tilt their lighting normal up less as they come to face the sun.
  let view: PerspectiveCamera | OrthographicCamera | null = null, dynamic: readonly Object3D[] = [];
  // The surfaces sample a set only after its first draw; until then they are held lit on its atlas.
  const startCascades = (set: ShadowCascadeSet) => {
    const {shadows} = venue.shading, layout = shadowCascadeLayout(shadows, shadows.cameras[set]);
    const pass = createCascadeShadows(renderer, scene, shadows, layout, toSun.clone().negate());
    holdCascadeShadows(pass.state.atlas);
    return {set, layout, pass, sampled: false};
  };
  let cascades: {set: ShadowCascadeSet; layout: ShadowCascadeLayout; pass: CascadeShadows; sampled: boolean} = startCascades(shadowSet);
  scene.add(sky);
  // The clouds are lit by the sun before they dim it. The first environment and the venue capture are taken without them.
  const cloudLayer = clouds.sheets ? createCloudLayer(venue.sky.clouds, clouds.sheets, {sunDirection: toSun, sunGreen: clearSun.g, cloudCover: weather.cloudCover}) : null;
  if (cloudLayer) scene.add(cloudLayer.group);
  const [probeX, probeY, probeZ] = venue.environmentProbe.position;
  const probeAt = new Vector3(...nativeToScene({x: probeX, y: probeY, z: probeZ}, origin));
  return {
    setCamera(camera) { view = camera; },
    setDynamic(objects) { dynamic = objects; },
    setShadowCascades(set) {
      if (cascades.set === set) return;
      const previous = cascades.pass;
      cascades = startCascades(set); previous.dispose();
    },
    applyHaze,
    captureVenue() {
      // The cube keeps its mips: the reflection convolution reads them.
      const cube = new WebGLCubeRenderTarget(VENUE_PROBE_PX, {type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter}), camera = new CubeCamera(0.5, VENUE_PROBE_FAR_M, cube);
      if (camera.coordinateSystem !== renderer.coordinateSystem) { camera.coordinateSystem = renderer.coordinateSystem; camera.updateCoordinateSystem(); }
      camera.position.copy(probeAt); camera.updateMatrixWorld();
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
    },
    update() {
      if (!view) return false;
      view.getWorldDirection(heading); haze(Math.atan2(heading.z, heading.x), fog.color, skyHaze);
      const drawing = cascades.pass.update(view, dynamic);
      if (!cascades.sampled) { sampleCascadeShadows(venue.shading.shadows, cascades.layout, cascades.pass.state); cascades.sampled = true; }
      return drawing;
    },
    dispose() {
      holdCascadeShadows(null); cascades.pass.dispose();
      scene.remove(sun, sun.target); sun.dispose();
      scene.environment = null; generator.dispose(); firstEnvironment.dispose(); venueProbe?.dispose(); reflection?.dispose(); venueCube?.dispose();
      setSceneryReflection(venue.shading, null, integration); integration.dispose(); reflectedGround.geometry.dispose(); reflectedGround.material.dispose();
      sky.geometry.dispose(); sky.material.dispose();
      if (cloudLayer) { scene.remove(cloudLayer.group); cloudLayer.dispose(); }
    },
  };
}
