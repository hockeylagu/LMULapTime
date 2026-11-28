import { BoxGeometry, Color, CubeCamera, DirectionalLight, DoubleSide, FogExp2, HalfFloatType, LinearMipmapLinearFilter, MathUtils, Mesh, MeshBasicMaterial, NoToneMapping, PlaneGeometry, PMREMGenerator, Scene, Vector3, WebGLCubeRenderTarget, type Camera, type Object3D, type OrthographicCamera, type PerspectiveCamera, type WebGLRenderTarget, type WebGLRenderer } from 'three';
import { dayShare } from './scene/dayLight.js';
import { nativeToScene } from './scene/replayPose.js';
import { createCascadeShadows, type CascadeShadows } from './shadows/cascadeShadows.js';
import { holdCascadeShadows, sampleCascadeShadows } from './shadows/cascadeSampling.js';
import { shadowCameraOf, shadowCascadeLayout, type ShadowCascadeLayout, type ShadowCascadeSet } from './shadows/shadowCascades.js';
import type { CarCamera } from '../../../../shared/types/scenes/car.js';
import type { SceneryLayout } from '../../../../shared/types/scenes/scenery.js';
import type { ReplayDaylightClock } from '../../../../shared/types/replay.js';
import { createSkyDomeMaterial, hazeColour, setSkyDome, hazeDensity, heightHaze, skyConditions, sunwardHaze, type NightSky, type SkyConditions } from './atmosphere/skyDome.js';
import { createHaze } from './atmosphere/haze.js';
import { cloudCoverage, cloudSheets, sunVisibility, type CloudEye, type CloudSheet } from './atmosphere/clouds.js';
import { createCloudLayer } from './atmosphere/cloudLayer.js';
import { GAME_LIGHT_UNIT, sunRadiance } from './atmosphere/sunSamples.js';
import { nightMoment, nightPlace, type NightMoment } from './night/nightMoment.js';
import { convolveReflection, type ReflectionCubes } from './reflectionCube.js';
import { integrationTexture, setSceneryReflection } from './scenery/materials/sceneryReflection.js';
import { setPass, setScene } from './shaders/sceneBlock.js';
import { ENVIRONMENT_FACE_PX, sceneEnvironmentMap, sceneLight } from './shaders/sceneLight.js';

const SKY_RADIUS_M = 12000, ENVIRONMENT_GROUND_Y = -0.5;
/** Mean reflectance of the ground around a circuit (grass, asphalt, concrete) for the bounce light of the first environment. */
const GROUND_ALBEDO = 0.2;
/**
 * How far the venue capture sees. Its cube face size, ENVIRONMENT_FACE_PX, is the size of the venue cubes in the reference frame
 * captures (no game file sets it); the first environment takes it too.
 */
const VENUE_PROBE_FAR_M = 3000;
/** Without a replay clock: a published sun below the horizon lights the scene from the horizon. */
const MIN_SUN_ELEVATION_DEG = 0;

export interface SceneLighting {
  /** Toward the sun; below the horizon at night. */
  sunDirection: Vector3;
  /** Toward the body that lights the scene: the sun while it has direct light, then the moon (unlit while it is down too). */
  lightDirection: Vector3;
  /** The moment's night facts; null without a replay clock (the published sun is a day sun). */
  night: NightMoment | null;
}

/** A direction toward a sky position (bearing clockwise from north), in scene space. */
function skyDirection({elevationDeg, bearingDeg}: {elevationDeg: number; bearingDeg: number}): Vector3 {
  const bearing = MathUtils.degToRad(bearingDeg), elevation = MathUtils.degToRad(elevationDeg), horizontal = Math.cos(elevation);
  return new Vector3(...nativeToScene({x: horizontal * Math.sin(bearing), y: Math.sin(elevation), z: horizontal * Math.cos(bearing)}, {x: 0, y: 0, z: 0}));
}

/**
 * The replay's clock sets the sun: its session start (the track's default time for the session when the replay does not carry
 * one) plus the lap's session time, placed as the game's sky middleware places it (night/skyBodies.ts) at the replay's night scene
 * (its place and date, nightMoment.ts) with the moon, unclamped. Without a clock, the race session's published sun, held at the horizon.
 */
export function sceneLighting(venue: Pick<SceneVenue, 'daylight' | 'sky' | 'night' | 'shading'>, clock?: ReplayDaylightClock): SceneLighting {
  const {daylight} = venue, id = clock?.session ?? 'race', session = daylight.sessions.find(entry => entry.id === id);
  if (!session) throw Error(`Layout daylight has no ${id} session`);
  if (clock) {
    const [hours, minutes] = session.localTime.split(':').map(Number);
    const localSeconds = (clock.startMinute ?? hours * 60 + minutes) * 60 + clock.sessionTimeSec;
    const moment = nightMoment(venue.sky.night, venue.sky.hosek.xyzToRgb, nightPlace(venue.night, daylight, clock.scene), localSeconds, venue.shading.ambient.nightLevel);
    const sunDirection = skyDirection(moment.bodies.sun), {moon} = moment.bodies;
    const lightDirection = moment.sunShare > 0 ? sunDirection.clone() : skyDirection(moon);
    return {sunDirection, lightDirection, night: moment};
  }
  if (session.sunBearingDeg === undefined) throw Error(`Layout daylight's ${id} session has no sun bearing`);
  const direction = skyDirection({elevationDeg: Math.max(MIN_SUN_ELEVATION_DEG, session.sunElevationDeg), bearingDeg: session.sunBearingDeg});
  return {sunDirection: direction, lightDirection: direction.clone(), night: null};
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
   * Captures the loaded scenery at the venue's probe (cars hidden, no emission) as the scene's environment: a first capture lit by
   * the sun (the moon at night), then one lit by the first, so shaded faces get the light the venue bounces. Call once the scenery around it is resident.
   */
  captureVenue(): void;
  /**
   * Lights the scene by another moment's sun and weather: the sky, the haze, the sun's light and its shadow (every cascade is drawn
   * again), the foliage and the clouds; the venue is captured again when it was captured already. Not during a render.
   */
  setSun(sun: SceneSun): void;
  /**
   * The same moment seen from elsewhere (`sunSeenFrom`): the sky, the haze and the sun's light follow the sun's new visibility
   * through the clouds; the shadows, the clouds and the environment captures stay. Not during a render.
   */
  setSunVisibility(sun: SceneSun): void;
  /** Writes this scene's haze into the scene block hazed materials read (haze.ts); each of the scene's renders does it too. */
  applyHaze(): void;
  /** Links the sun shadow's depth programs for the casters under `roots` before they first cast (the warm-up's compile). */
  compileShadows(roots: readonly Object3D[]): Promise<unknown>;
  /** Draws the shadow casters that show, `root` among them, into a texel as the sun shadow draws them (`CascadeShadows.drawFirst`). */
  drawShadowsFirst(root: Object3D, view: PerspectiveCamera): void;
  /**
   * Before a frame renders: colours the haze toward the view and draws the shadow cascades that are due, the cars into the far ones
   * whose slice holds one of `casters` (where the cars that cast are, world). True while cached cascades are still due: the caller
   * renders another frame.
   */
  update(casters?: readonly Vector3[]): boolean;
  /** Whether the last update redrew static shadow depth: other heavy passes can take the next frame instead. */
  readonly shadowsRedrawn: boolean;
  dispose(): void;
}

/** The layout values the environment reads: its daylight, the package's sky and where the venue's environment is captured. */
export type SceneVenue = Pick<SceneryLayout, 'daylight' | 'sky' | 'environmentProbe' | 'shading' | 'night'>;

/**
 * The weather of a replay moment: the cloud coverage and how much of the sun's light passes the clouds seen from `eye`, from the
 * replay's cloud field placed for an eye at the scene origin's height, with the placed sheets. A replay without a cloud field keeps
 * its cloud cover figure and has no sun visibility or sheets of its own.
 */
export function sceneClouds(venue: Pick<SceneVenue, 'sky' | 'shading'>, lighting: SceneLighting, originY: number, clock?: ReplayDaylightClock, eye: CloudEye = [0, 0, 0]): {cloudCover: number; sunVisibility?: number; sheets?: CloudSheet[]} {
  const field = clock?.cloudField;
  if (!field) return {cloudCover: clock?.cloudCover ?? 0};
  const sheets = cloudSheets(venue.sky.clouds, field, originY);
  return {cloudCover: cloudCoverage(venue.sky.clouds, field), sunVisibility: sunVisibility(venue.shading.sunVisibility, venue.sky.clouds, sheets, cloudSun(lighting), eye), sheets};
}

/** Toward the body that lights the scene (the sun, or the moon at night) in the cloud field's axes (LMU local): the scene's z is the opposite one. */
export const cloudSun = ({lightDirection: {x, y, z}}: SceneLighting): [number, number, number] => [x, y, -z];

/** The replay moment's sun and weather, worked out once for the environment and the exposure. */
export interface SceneSun {
  lighting: SceneLighting;
  /** The sun's elevation: below the horizon at night (sceneLighting). */
  sunElevationDeg: number;
  clouds: {cloudCover: number; sunVisibility?: number; sheets?: CloudSheet[]};
  weather: SkyConditions;
  /**
   * The directional light's radiance in the package's light unit, before the clouds toward it dim it. By day the direct sun (sunSamples.ts):
   * the layout's sampled sun under the replay's cloud cover, dimmer and redder as the sun gets low. The replay's cover stands in for the
   * base coverage the grid is sampled by. Known gap (pipeline, 2026-11-09): clouded reference frames come out 2–20 % brighter than the grid.
   * Around sunset the sun's horizon sample times its direct share, then the moon's light (nightLight.ts) once the share is 0.
   */
  radiance: Color;
}

/**
 * The sun from the replay's clock (sceneLighting) and the weather at the lap (sceneClouds), the clouds seen from `eye`: the replay's
 * cloud cover sets the weather and dims the sun. `originY` is the scene origin's height in LMU local metres.
 */
export function sceneSun(venue: Pick<SceneVenue, 'daylight' | 'sky' | 'shading' | 'night'>, originY: number, clock?: ReplayDaylightClock, eye?: CloudEye): SceneSun {
  const lighting = sceneLighting(venue, clock),sunElevationDeg = MathUtils.radToDeg(Math.asin(MathUtils.clamp(lighting.sunDirection.y, -1, 1)));
  const clouds = sceneClouds(venue, lighting, originY, clock, eye), weather = skyConditions(venue.daylight, clouds.cloudCover, clouds.sunVisibility);
  const {night} = lighting;
  const radiance = !night ? sunRadiance(venue.sky.sun, sunElevationDeg, weather.cloudCover)
    : night.sunShare > 0 ? sunRadiance(venue.sky.sun, Math.max(0, sunElevationDeg), weather.cloudCover).multiplyScalar(night.sunShare) : new Color(...night.light.moonLight);
  return {lighting, sunElevationDeg, clouds, weather, radiance};
}

/** The same moment with the sun's visibility through the clouds seen from elsewhere. */
export function sunSeenFrom(venue: Pick<SceneVenue, 'daylight'>, sun: SceneSun, sunVisibility: number): SceneSun {
  return {...sun, clouds: {...sun.clouds, sunVisibility}, weather: skyConditions(venue.daylight, sun.clouds.cloudCover, sunVisibility)};
}

/** The night sky of a moment for the dome and the haze; none by day or without the night model. */
function nightSky(venue: Pick<SceneVenue, 'sky'>, {lighting: {night}}: Pick<SceneSun, 'lighting'>): NightSky | undefined {
  return night && night.domeWeight > 0 ? {chromaticity: venue.sky.night.twilight.chromaticity, zenithLuminance: night.light.zenithLuminance, weight: night.domeWeight} : undefined;
}

/** The fog colour toward the night model's neutral fog (nightLight.ts) by the dome's night weight: the mix is ours. The dome's haze stays the sky's. */
function nightFog(haze: ReturnType<typeof hazeColour>, night: NightMoment | null): ReturnType<typeof hazeColour> {
  if (!night || night.domeWeight === 0) return haze;
  const fog = new Color(...night.light.fog).multiplyScalar(GAME_LIGHT_UNIT), weight = night.domeWeight;
  return (heading, target, skyTarget) => haze(heading, target, skyTarget).lerp(fog, weight);
}
/**
 * Sky dome, horizon haze, a shadow-casting sun and an image-based light: first the sky over a sunlit ground, then the venue's own
 * capture. The scenery supplies its own terrain, filler ground and horizon; nothing here draws ground. `origin` is the scene
 * origin in LMU local metres.
 */
export function addSceneEnvironment(scene: Scene, renderer: WebGLRenderer, venue: SceneVenue, origin: Vector3, shadowSet: ShadowCascadeSet,
  ownShadow: CarCamera['shadow'], initial: SceneSun): SceneEnvironment {
  const sky = new Mesh(new BoxGeometry(1, 1, 1), createSkyDomeMaterial(initial.lighting.sunDirection, venue.sky, venue.daylight, initial.weather, nightSky(venue, initial)));
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
  // The sun (the moon at night) lights the scene from its direction; its shadow comes from the package's cascades (shadows/). The colour
  // carries the strength.
  const sun = new DirectionalLight(new Color(), 1), toLight = initial.lighting.lightDirection.clone().normalize();
  sun.name = 'sun';
  scene.add(sun, sun.target);
  let view: PerspectiveCamera | OrthographicCamera | null = null, dynamic: readonly Object3D[] = [];
  // The surfaces sample a set only after its first draw; until then they are held lit on its atlas.
  const startCascades = (set: ShadowCascadeSet, own: CarCamera['shadow']) => {
    const {shadows} = venue.shading, layout = shadowCascadeLayout(shadows, shadowCameraOf(shadows.cameras[set], own));
    const pass = createCascadeShadows(renderer, scene, shadows, layout, toLight.clone().negate());
    holdCascadeShadows(pass.state.atlas);
    return {set, own, layout, pass};
  };
  let cascades: {set: ShadowCascadeSet; own: CarCamera['shadow']; layout: ShadowCascadeLayout; pass: CascadeShadows} =
    startCascades(shadowSet, ownShadow), lit = false;
  scene.add(sky);
  /** The haze colour toward a view heading (and the sky's, just above the horizon), and the haze terms hazed materials read. */
  let haze: ReturnType<typeof hazeColour> = () => fog.color, applyHaze: () => void = () => {}, cloudLayer: ReturnType<typeof createCloudLayer> | null = null;
  /** The sheets the cloud layer draws, and where the cloud field's origin is in the scene (the LMU local origin, at the scene origin's height). */
  let shownSheets: CloudSheet[] | undefined;
  const fieldOrigin = new Vector3(-origin.x, 0, origin.z);
  const heading = new Vector3();
  const skyHaze = () => sky.material.uniforms.hazeColour.value as Color;
  /** Everything the sun and the weather set; the first environment is made again when `environments` (until the venue is captured). */
  const light = ({lighting, sunElevationDeg, clouds, weather, radiance}: SceneSun, environments = true) => {
    // The weather thickens the haze; the clouds toward the light dim it further.
    const clearSun = radiance.clone().multiplyScalar(GAME_LIGHT_UNIT), sunRgb = clearSun.clone().multiplyScalar(clouds.sunVisibility ?? 1);
    const turned = !toLight.equals(heading.copy(lighting.lightDirection).normalize());
    toLight.copy(lighting.lightDirection).normalize();
    const {night} = lighting, darkSky = nightSky(venue, {lighting});
    // One material (the environment's sky shares it): a new one would link its program again.
    if (lit) setSkyDome(sky.material, lighting.sunDirection, venue.sky, venue.daylight, weather, darkSky);
    // The haze takes its colour from the sky just above the horizon toward the view (update); the sun's light, the height term and
    // the distance shape are in the hazed materials' programs (haze.ts).
    haze = nightFog(hazeColour(venue.sky, lighting.sunDirection, weather, darkSky), night);
    haze(view ? Math.atan2(view.getWorldDirection(heading).z, heading.x) : 0, fog.color, skyHaze());
    fog.density = hazeDensity(venue.sky, venue.daylight, weather, sunElevationDeg);
    // The haze's glow toward the sun goes with the sun's direct light: none by the moon.
    applyHaze = createHaze({originY: origin.y, height: heightHaze(venue.sky, venue.daylight, weather), sunDirection: lighting.sunDirection.clone().normalize(),
      sunRadiance: night && night.sunShare === 0 ? new Color(0, 0, 0) : sunRgb.clone(), sunward: sunwardHaze(venue.sky, weather)}, fog);
    applyHaze();
    // Ground radiance is a lambertian ground of GROUND_ALBEDO under the sun: albedo · sun · sin(elevation) / π.
    reflectedGround.material.color.copy(sunRgb).multiplyScalar(GROUND_ALBEDO * Math.max(0, toLight.y) / Math.PI);
    sun.color.copy(sunRgb); sun.position.copy(toLight);
    // The game's day share is the ambient's (nightMoment.ts); the package's fit from the sun's green holds it at day where the twilight
    // table ends.
    setScene('lit_dayLight', Math.max(dayShare(venue.shading.ambient, night && night.sunShare === 0 ? 0 : radiance.g), night?.dayShare ?? 0));
    setScene('surface_crownSun', toLight.toArray()); // Foliage cards tilt their lighting normal up less as they come to face the sun.
    if (lit && turned) cascades.pass.setLight(toLight.clone().negate());
    // The clouds are lit by the sun before they dim it, by the sun and coverage of each moment (the daylight switched back to night
    // must not keep day-lit clouds). A moment's sheets replace the last ones' meshes only: a layer made again at each sun step linked
    // its program and uploaded its maps again in a frame (45-110 ms at Spa). The first environment and the venue capture are taken
    // without them.
    const cloudLight = {sunDirection: toLight.clone(), sunGreen: clearSun.g, cloudCover: weather.cloudCover};
    if (!clouds.sheets) {
      if (cloudLayer) { scene.remove(cloudLayer.group); cloudLayer.dispose(); cloudLayer = null; }
    } else if (!cloudLayer) {
      cloudLayer = createCloudLayer(venue.sky.clouds, clouds.sheets, cloudLight, fieldOrigin);
      scene.add(cloudLayer.group);
    } else {
      cloudLayer.light(cloudLight);
      if (clouds.sheets !== shownSheets) cloudLayer.place(clouds.sheets);
    }
    shownSheets = clouds.sheets;
    if (!venueProbe && environments) {
      firstEnvironment?.dispose();
      firstEnvironment = generator.fromScene(environmentScene, 0, 0.1, SKY_RADIUS_M, {size: ENVIRONMENT_FACE_PX});
      scene.environment = firstEnvironment.texture;
    }
    lit = true;
  };
  light(initial);
  // The composed programs read the haze and the light of the scene that rendered last (the scene and pass blocks): each scene writes
  // its own before it renders (the environment at zero intensity included, while the venue's first capture is taken).
  const applyLight = sceneLight(scene, sun);
  scene.onBeforeRender = () => { applyHaze(); applyLight(); };
  const [probeX, probeY, probeZ] = venue.environmentProbe.position;
  const probeAt = new Vector3(...nativeToScene({x: probeX, y: probeY, z: probeZ}, origin));
  const captureVenue = () => {
    // The cube keeps its mips: the reflection convolution reads them.
    const cube = new WebGLCubeRenderTarget(ENVIRONMENT_FACE_PX, {type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter}), camera = new CubeCamera(0.5, VENUE_PROBE_FAR_M, cube);
    if (camera.coordinateSystem !== renderer.coordinateSystem) { camera.coordinateSystem = renderer.coordinateSystem; camera.updateCoordinateSystem(); }
    camera.position.copy(probeAt); camera.updateMatrixWorld();
    // The scene's world matrices update once per frame, not per render (sceneShell), and the capture may come before the first
    // frame: without this, the sun's light has no direction yet and the probe sees the venue unlit by it.
    scene.updateMatrixWorld();
    const shown = dynamic.map(object => object.visible);
    try {
      dynamic.forEach(object => { object.visible = false; });
      if (cloudLayer) cloudLayer.group.visible = false;
      // The game's probe is an unlit G-buffer relit by the sun or the moon and its own bounce: no glow, no lamps (dayLight.ts).
      setPass({surface_emission: 0});
      // The first capture is lit by the sun alone; the second adds the light of the first. The environment stays set, at zero
      // intensity (a pass value of the composed programs, sceneLight.ts).
      scene.environmentIntensity = 0;
      // Nor the scenery's reflection of the last capture, as on a first load: a capture at night kept the day's light in it.
      setSceneryReflection(venue.shading, null, integration);
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
      setPass({surface_emission: 1});
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
    compileShadows: roots => cascades.pass.compile(roots),
    drawShadowsFirst: (root, view) => cascades.pass.drawFirst(root, view),
    captureVenue,
    setSun(next) {
      light(next);
      if (venueProbe) captureVenue();
    },
    setSunVisibility(next) { light(next, false); },
    get shadowsRedrawn() { return cascades.pass.redrewStatic; },
    update(casters = []) {
      if (!view) return false;
      cloudLayer?.order(view.getWorldPosition(heading));
      view.getWorldDirection(heading); haze(Math.atan2(heading.z, heading.x), fog.color, skyHaze());
      const set = cascades, drawing = set.pass.update(view, dynamic, casters);
      // The surfaces read the cascades as this update left them (into the scene block).
      sampleCascadeShadows(venue.shading.shadows, set.layout, set.pass.state);
      return drawing;
    },
    dispose() {
      holdCascadeShadows(null); cascades.pass.dispose();
      scene.remove(sun, sun.target); sun.dispose();
      // The composed programs' environment too: the next shell's warm-up would bind the disposed one.
      scene.environment = null; sceneEnvironmentMap.value = null; generator.dispose(); firstEnvironment?.dispose(); venueProbe?.dispose(); reflection?.dispose(); venueCube?.dispose();
      setSceneryReflection(venue.shading, null, integration); integration.dispose(); reflectedGround.geometry.dispose(); reflectedGround.material.dispose();
      sky.geometry.dispose(); sky.material.dispose();
      if (cloudLayer) { scene.remove(cloudLayer.group); cloudLayer.dispose(); }
    },
  };
}
