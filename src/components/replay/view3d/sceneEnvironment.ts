import { BoxGeometry, Color, CubeCamera, DirectionalLight, DoubleSide, FogExp2, HalfFloatType, MathUtils, Matrix4, Mesh, MeshBasicMaterial, NoToneMapping, PCFShadowMap, PlaneGeometry, PMREMGenerator, Scene, Vector3, WebGLCubeRenderTarget, type Camera, type Object3D, type OrthographicCamera, type PerspectiveCamera, type WebGLRenderTarget, type WebGLRenderer } from 'three';
import { nativeToScene } from './sceneFrame.js';
import { createStaticShadow, NEAR_SHADOW, SHADOW_NEAR_M, shadowWindowCentre } from './sunShadows.js';
import type { SceneryDaylight, SceneryLayout } from '../../../../shared/types/scenes/scenery.js';
import type { ReplayDaylightClock } from '../../../../shared/types/replay.js';
import { solarPosition } from './solarPosition.js';
import { createPerezSkyMaterial, hazeColour, hazeDensity, heightHaze, skyConditions, sunwardHaze } from './atmosphere/perezSky.js';
import { createHaze } from './atmosphere/haze.js';

/**
 * Midday lighting, from the pipeline review viewer's daylight (pipeline/viewer/daylight.js): the sun direction without a layout's
 * daylight, its strength (4.0, viewer 3.2) and colour. The sky is the package's analytic sky (perezSky.ts).
 */
export const DAYLIGHT = Object.freeze({elevationDeg: 55, azimuthDeg: 45, sunIntensity: 4.0, sunColor: '#fff8ea'});
const SKY_RADIUS_M = 12000, ENVIRONMENT_GROUND_Y = -0.5;
/** Mean reflectance of the ground around a circuit (grass, asphalt, concrete) for the bounce light of the first environment. */
const GROUND_ALBEDO = 0.2;
/** The venue capture: cube face size and how far it sees. */
const VENUE_PROBE_PX = 256, VENUE_PROBE_FAR_M = 3000;
const sunToward = (elevationDeg: number) => {
  const a = MathUtils.degToRad(DAYLIGHT.azimuthDeg), e = MathUtils.degToRad(elevationDeg);
  return new Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
};
/** Unit vector toward the sun in scene space, without a layout's daylight. */
export const SUN_DIRECTION = sunToward(DAYLIGHT.elevationDeg);
/** The lowest sun the replay lights with: a session start after sunset is lit as late afternoon, not as night. */
const MIN_SUN_ELEVATION_DEG = 10;

export interface SceneLighting {
  sunDirection: Vector3;
  /** The sunlight's colour and strength reaching the ground, relative to the calibrated midday sun (`sunTransmittance`). */
  sunTransmittance: Color;
}

/** Optical depth of a clear sky at the zenith for red, green and blue light (molecular plus a light aerosol load). */
const OPTICAL_DEPTH = [0.10, 0.16, 0.28] as const;
/** Kasten and Young's relative air mass: how many atmospheres the sun's ray crosses at an elevation. */
const airMass = (elevationDeg: number) => 1 / (Math.sin(MathUtils.degToRad(elevationDeg)) + 0.50572 * (elevationDeg + 6.07995) ** -1.6364);

/**
 * The direct sunlight reaching the ground, relative to the calibrated sun at the default midday elevation: the atmosphere dims and
 * reddens it along the ray's air mass (Beer-Lambert per colour). Never brighter than the calibrated sun. Cloud cover does not dim
 * it: the sky stays clear.
 */
export function sunTransmittance(elevationDeg: number): Color {
  const path = airMass(elevationDeg), reference = airMass(DAYLIGHT.elevationDeg);
  const [r, g, b] = OPTICAL_DEPTH.map(depth => Math.min(1, Math.exp(-depth * (path - reference))));
  return new Color(r, g, b);
}

/**
 * The replay's clock sets the sun: its session start (the track's default time for the session when the replay does not carry
 * one) plus the lap's session time, at the layout's location. Without a clock, the race session's published sun. Packages without
 * a bearing use the default scene azimuth. Without daylight, the default midday.
 */
export function sceneLighting(daylight?: SceneryDaylight, clock?: ReplayDaylightClock): SceneLighting {
  if (!daylight) return {sunDirection: SUN_DIRECTION.clone(), sunTransmittance: sunTransmittance(DAYLIGHT.elevationDeg)};
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
  return {sunDirection, sunTransmittance: sunTransmittance(elevationDeg)};
}

export interface SceneEnvironment {
  /** The camera whose view direction leads the shadow window and turns the haze toward its horizon colour. */
  setCamera(camera: PerspectiveCamera | OrthographicCamera): void;
  /** Objects that move (the cars): the static shadow map and the venue capture are drawn without them. */
  setDynamic(objects: readonly Object3D[]): void;
  /** The resident scenery changed: redraw the static shadow map once the view has moved 100 m. */
  staticShadowStale(): void;
  /**
   * Captures the loaded scenery at the venue's probe (cars hidden) as the scene's environment: a first capture lit by the sun,
   * then one lit by the first, so shaded faces get the light the venue bounces. Call once the scenery around it is resident.
   */
  captureVenue(): void;
  /** Writes this scene's haze into the shader chunks: call before compiling its materials outside a render. */
  applyHaze(): void;
  /**
   * Moves the near shadow window to `focus` (scene coordinates, on the ground: the camera's look target) before a frame renders,
   * colours the haze toward the view, and draws the next quarter of the static map when one is due (sunShadows.ts). True while a
   * static map is still being drawn: the caller renders another frame.
   */
  update(focus: Vector3): boolean;
  dispose(): void;
}

/** The layout values the environment reads: its daylight, the package's sky and where the venue's environment is captured. */
export type SceneVenue = Pick<SceneryLayout, 'daylight' | 'sky' | 'environmentProbe'>;

/**
 * Sky dome, horizon haze, a shadow-casting sun and an image-based light: first the sky over a sunlit ground, then the venue's own
 * capture. The scenery supplies its own terrain, filler ground and horizon; nothing here draws ground. `origin` is the scene
 * origin in LMU local metres.
 */
export function addSceneEnvironment(scene: Scene, renderer: WebGLRenderer, venue: SceneVenue, origin: Vector3, clock?: ReplayDaylightClock): SceneEnvironment {
  const lighting = sceneLighting(venue.daylight, clock);
  // The replay's cloud cover at the lap sets the weather; the sun stays undimmed by it.
  const weather = skyConditions(venue.daylight, clock?.cloudCover ?? 0);
  const sky = new Mesh(new BoxGeometry(1, 1, 1), createPerezSkyMaterial(lighting.sunDirection, venue.sky, weather));
  sky.scale.setScalar(SKY_RADIUS_M);
  sky.name = 'sky'; sky.frustumCulled = false;
  // The dome travels with the eye so its horizon stays at infinity at every zoom level.
  sky.onBeforeRender = (_renderer, _scene, camera: Camera) => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
  scene.background = null;
  // The haze takes its colour from the sky just above the horizon toward the view (update); the sun's light, the height term and
  // the distance shape are in the fog chunks (haze.ts).
  const haze = hazeColour(venue.sky, lighting.sunDirection, weather), heading = new Vector3();
  const fog = new FogExp2(haze(0, new Color()), hazeDensity(venue.sky, venue.daylight));
  scene.fog = fog;

  // The first environment: the sky over a sunlit ground plane, so faces out of the sun get the light the ground bounces up to them
  // until the venue is captured. Ground radiance is a lambertian ground of GROUND_ALBEDO under the sun: albedo · sun · sin(elevation) / π.
  const environmentScene = new Scene(), environmentSky = sky.clone();
  const groundRadiance = GROUND_ALBEDO * DAYLIGHT.sunIntensity * Math.max(0, lighting.sunDirection.y) / Math.PI;
  const sunColour = new Color(DAYLIGHT.sunColor).multiply(lighting.sunTransmittance);
  const applyHaze = createHaze({originY: origin.y, height: heightHaze(venue.sky, venue.daylight, weather), sunDirection: lighting.sunDirection.clone().normalize(),
    sunRadiance: sunColour.clone().multiplyScalar(DAYLIGHT.sunIntensity), sunward: sunwardHaze(venue.sky, weather)});
  // Programs compile on a scene's render (and the warm-up's compile, `applyHaze`): each writes this scene's haze terms back first.
  applyHaze(); scene.onBeforeRender = applyHaze;
  const reflectedGround = new Mesh(new PlaneGeometry(24000, 24000), new MeshBasicMaterial({color: sunColour.clone().multiplyScalar(groundRadiance), side: DoubleSide}));
  reflectedGround.rotation.x = -Math.PI / 2; reflectedGround.position.y = ENVIRONMENT_GROUND_Y;
  environmentScene.add(environmentSky, reflectedGround);
  const generator = new PMREMGenerator(renderer), reflection = generator.fromScene(environmentScene, 0, 0.1, SKY_RADIUS_M, {size: 256});
  generator.dispose();
  scene.environment = reflection.texture;
  let venueProbe: WebGLRenderTarget | null = null;
  // The exposure pass applies the camera profile's tone curve (autoExposure.ts): nothing else tone-maps.
  renderer.toneMapping = NoToneMapping;

  // The near sun shadow (sunShadows.ts); the static scenery map is drawn by its own pass.
  const sun = new DirectionalLight(sunColour, DAYLIGHT.sunIntensity);
  sun.name = 'sun'; sun.castShadow = true;
  sun.shadow.mapSize.set(NEAR_SHADOW.mapPx, NEAR_SHADOW.mapPx);
  Object.assign(sun.shadow.camera, {left: -NEAR_SHADOW.halfExtentM, right: NEAR_SHADOW.halfExtentM, top: NEAR_SHADOW.halfExtentM,
    bottom: -NEAR_SHADOW.halfExtentM, near: SHADOW_NEAR_M, far: 2 * NEAR_SHADOW.lightDistanceM});
  sun.shadow.camera.updateProjectionMatrix();
  // Radius 0 is one hardware filtered compare tap: the noisy 5-tap disk at
  // radius 1 blurred the edges. normalBias 5 cm (~1.3 texels): at 0.01 the road lines and car bodies speckled with self-shadow acne.
  sun.shadow.bias = 0.000001; sun.shadow.normalBias = 0.05; sun.shadow.intensity = 1; sun.shadow.radius = 0;
  scene.add(sun, sun.target);
  const toSun = lighting.sunDirection.clone().normalize();
  const sunFrame = new Matrix4().lookAt(new Vector3(), toSun.clone().negate(), Math.abs(toSun.y) > 0.99 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0));
  const fromSunFrame = sunFrame.clone().invert(), centre = new Vector3();
  const staticShadow = createStaticShadow(renderer, scene, toSun, sunFrame, fromSunFrame);
  let view: PerspectiveCamera | OrthographicCamera | null = null, dynamic: readonly Object3D[] = [];
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
  scene.add(sky);
  const [probeX, probeY, probeZ] = venue.environmentProbe.position;
  const probeAt = new Vector3(...nativeToScene({x: probeX, y: probeY, z: probeZ}, origin));
  return {
    setCamera(camera) { view = camera; },
    setDynamic(objects) { dynamic = objects; },
    staticShadowStale() { staticShadow.stale(); },
    applyHaze,
    captureVenue() {
      const cube = new WebGLCubeRenderTarget(VENUE_PROBE_PX, {type: HalfFloatType, generateMipmaps: false}), camera = new CubeCamera(0.5, VENUE_PROBE_FAR_M, cube);
      if (camera.coordinateSystem !== renderer.coordinateSystem) { camera.coordinateSystem = renderer.coordinateSystem; camera.updateCoordinateSystem(); }
      camera.position.copy(probeAt); camera.updateMatrixWorld();
      const shown = dynamic.map(object => object.visible), autoShadow = renderer.shadowMap.autoUpdate, prefilter = new PMREMGenerator(renderer);
      try {
        dynamic.forEach(object => { object.visible = false; }); renderer.shadowMap.autoUpdate = false;
        // The first capture is lit by the sun alone; the second adds the light of the first.
        scene.environment = null;
        for (let pass = 0; pass < 2; pass++) {
          camera.update(renderer, scene);
          const next = prefilter.fromCubemap(cube.texture);
          scene.environment = next.texture; venueProbe?.dispose(); venueProbe = next;
        }
      } finally {
        dynamic.forEach((object, i) => { object.visible = shown[i]; }); renderer.shadowMap.autoUpdate = autoShadow;
        cube.dispose(); prefilter.dispose();
      }
    },
    update(focus) {
      shadowWindowCentre(focus, view, NEAR_SHADOW, sunFrame, fromSunFrame, centre);
      sun.target.position.copy(centre); sun.position.copy(centre).addScaledVector(toSun, NEAR_SHADOW.lightDistanceM);
      sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
      if (view) { view.getWorldDirection(heading); haze(Math.atan2(heading.z, heading.x), fog.color); }
      return view ? staticShadow.update(view, focus, dynamic) : false;
    },
    dispose() {
      scene.remove(sun, sun.target); sun.dispose(); staticShadow.dispose();
      scene.environment = null; reflection.dispose(); venueProbe?.dispose(); reflectedGround.geometry.dispose(); reflectedGround.material.dispose();
      sky.geometry.dispose(); sky.material.dispose();
    },
  };
}
