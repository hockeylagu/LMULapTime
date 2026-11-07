import { Color, ConstantColorFactor, CustomBlending, DirectionalLight, type Object3D, DoubleSide, FogExp2, MathUtils, Matrix4, Mesh, MeshBasicMaterial, NoToneMapping, PCFShadowMap, PlaneGeometry, PMREMGenerator, Scene, Vector3, ZeroFactor, type Camera, type OrthographicCamera, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { nativeToScene } from './sceneFrame.js';
import { createStaticShadow, NEAR_SHADOW, SHADOW_NEAR_M, shadowWindowCentre } from './sunShadows.js';
import type { SceneryDaylight } from '../../../../shared/types/scenes/scenery.js';

/**
 * Midday lighting, from the pipeline review viewer's daylight (pipeline/viewer/daylight.js) with one replay change: exponential
 * haze (about 1% at 300 m, 25% at 1.5 km, 70% at 3 km, matched by eye to the game's hills behind Fuji's main straight) instead
 * of a linear fog. The sun is stronger (4.0, viewer 3.2). The Sky shader's radiance is in its own units: `skyScale` brings it
 * into the sun's (calibrated as the viewer's sky fill), for the displayed sky and its reflection alike, so the sky reads about as
 * bright as a sunlit surface and the ground's bounce light keeps its sunlit value. Unscaled, the sky was ~35× a sunlit grey
 * ground: it showed white and pulled the metered exposure down, and scaling only the reflection left shaded faces a tenth of
 * their ground bounce. The metered exposure (autoExposure.ts) scales the displayed sky and scene together.
 * Neither is authored by the game data; a layout's daylight sets the sun direction and turbidity (`sceneLighting`).
 */
export const DAYLIGHT = Object.freeze({
  elevationDeg: 55, azimuthDeg: 45, sunIntensity: 4.0, skyScale: 0.112,
  turbidity: 2.5, rayleigh: 2.0, mieCoefficient: 0.005, mieDirectionalG: 0.8, horizonColor: '#c8d4e0', fogDensity: 0.00036, sunColor: '#fff8ea',
});
const SKY_RADIUS_M = 12000, ENVIRONMENT_GROUND_Y = -0.5;
/** Mean reflectance of the ground around a circuit (grass, asphalt, concrete) for the bounce light in the environment. */
const GROUND_ALBEDO = 0.2;
const sunToward = (elevationDeg: number) => {
  const a = MathUtils.degToRad(DAYLIGHT.azimuthDeg), e = MathUtils.degToRad(elevationDeg);
  return new Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
};
/** Unit vector toward the sun in scene space, without a layout's daylight. */
export const SUN_DIRECTION = sunToward(DAYLIGHT.elevationDeg);
/** The lowest sun the replay lights with: a session start after sunset is lit as late afternoon, not as night. */
const MIN_SUN_ELEVATION_DEG = 10;

export interface SceneLighting { sunDirection: Vector3; turbidity: number }

/**
 * The race start sets the sun's direction. Packages without a bearing use the default scene azimuth.
 * GDB air pollution sets sky turbidity using the review viewer's mapping. The GDB haze scale
 * is not applied: read as "larger is hazier" it cleared Fuji (0.55), which the game shows hazy. Without daylight, the default midday.
 */
export function sceneLighting(daylight?: SceneryDaylight): SceneLighting {
  if (!daylight) return {sunDirection: SUN_DIRECTION.clone(), turbidity: DAYLIGHT.turbidity};
  const race = daylight.sessions.find(session => session.id === 'race');
  if (!race) throw Error('Layout daylight has no race session');
  const elevationDeg = Math.max(MIN_SUN_ELEVATION_DEG, race.sunElevationDeg);
  let sunDirection = sunToward(elevationDeg);
  if (race.sunBearingDeg !== undefined) {
    const bearing = MathUtils.degToRad(race.sunBearingDeg), elevation = MathUtils.degToRad(elevationDeg);
    const horizontal = Math.cos(elevation);
    const native = {x: horizontal * Math.sin(bearing), y: Math.sin(elevation), z: horizontal * Math.cos(bearing)};
    sunDirection = new Vector3(...nativeToScene(native, {x: 0, y: 0, z: 0}));
  }
  return {
    sunDirection,
    turbidity: 2 + 1.5 * daylight.airPollution,
  };
}

export interface SceneEnvironment {
  /** The camera whose view direction leads the shadow window. */
  setCamera(camera: PerspectiveCamera | OrthographicCamera): void;
  /** Objects that move (the cars): the static shadow map is drawn without them. */
  setDynamic(objects: readonly Object3D[]): void;
  /** The resident scenery changed: redraw the static shadow map once the view has moved 100 m. */
  staticShadowStale(): void;
  /**
   * Moves the near shadow window to `focus` (scene coordinates, on the ground: the camera's look target) before a frame renders,
   * and draws the next quarter of the static map when one is due (sunShadows.ts). True while a static map is still being drawn:
   * the caller renders another frame.
   */
  update(focus: Vector3): boolean;
  dispose(): void;
}

/**
 * Sky dome, horizon fog, a shadow-casting sun and a sky image-based light, set up as the pipeline viewer does so scenery is
 * lit alike. The scenery supplies its own terrain, filler ground and horizon; nothing here draws ground.
 */
export function addSceneEnvironment(scene: Scene, renderer: WebGLRenderer, daylight?: SceneryDaylight): SceneEnvironment {
  const lighting = sceneLighting(daylight);
  const sky = new Sky();
  sky.scale.setScalar(SKY_RADIUS_M);
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = lighting.turbidity; uniforms.rayleigh.value = DAYLIGHT.rayleigh;
  uniforms.mieCoefficient.value = DAYLIGHT.mieCoefficient; uniforms.mieDirectionalG.value = DAYLIGHT.mieDirectionalG;
  uniforms.sunPosition.value = lighting.sunDirection.clone();
  uniforms.showSunDisc.value = false;
  // A constant blend factor scales the sky shader's output without changing it (standard material blending).
  Object.assign(sky.material, {blending: CustomBlending, blendSrc: ConstantColorFactor, blendDst: ZeroFactor});
  sky.material.blendColor.setScalar(DAYLIGHT.skyScale);
  sky.name = 'sky'; sky.frustumCulled = false;
  // The dome travels with the eye so its horizon stays at infinity at every zoom level.
  sky.onBeforeRender = (_renderer, _scene, camera: Camera) => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
  scene.background = null;
  scene.fog = new FogExp2(new Color(DAYLIGHT.horizonColor), DAYLIGHT.fogDensity);

  // The reflection environment: the sky over a sunlit ground plane, so faces out of the sun get the light the ground bounces up to
  // them. A near-black plane (about 2%) left shaded faces lit by blue sky alone: yellow boards turned olive, stands and bridge
  // undersides dark. Ground radiance is a lambertian ground of GROUND_ALBEDO under the sun: albedo * sun intensity * sin(elevation) / pi.
  const environmentScene = new Scene(), environmentSky = sky.clone();
  environmentSky.material = sky.material;
  const groundRadiance = GROUND_ALBEDO * DAYLIGHT.sunIntensity * Math.max(0, lighting.sunDirection.y) / Math.PI;
  const groundColour = new Color(DAYLIGHT.sunColor).multiplyScalar(groundRadiance);
  const reflectedGround = new Mesh(new PlaneGeometry(24000, 24000), new MeshBasicMaterial({color: groundColour, side: DoubleSide}));
  reflectedGround.rotation.x = -Math.PI / 2; reflectedGround.position.y = ENVIRONMENT_GROUND_Y;
  environmentScene.add(environmentSky, reflectedGround);
  const generator = new PMREMGenerator(renderer), reflection = generator.fromScene(environmentScene, 0, 0.1, SKY_RADIUS_M, {size: 256});
  generator.dispose();
  scene.environment = reflection.texture;
  // The exposure pass applies the game's own tone curve (autoExposure.ts): nothing else tone-maps.
  renderer.toneMapping = NoToneMapping;

  // The near sun shadow (sunShadows.ts); the static scenery map is drawn by its own pass.
  const sun = new DirectionalLight(new Color(DAYLIGHT.sunColor), DAYLIGHT.sunIntensity);
  sun.name = 'sun'; sun.castShadow = true;
  sun.shadow.mapSize.set(NEAR_SHADOW.mapPx, NEAR_SHADOW.mapPx);
  Object.assign(sun.shadow.camera, {left: -NEAR_SHADOW.halfExtentM, right: NEAR_SHADOW.halfExtentM, top: NEAR_SHADOW.halfExtentM,
    bottom: -NEAR_SHADOW.halfExtentM, near: SHADOW_NEAR_M, far: 2 * NEAR_SHADOW.lightDistanceM});
  sun.shadow.camera.updateProjectionMatrix();
  // Radius 0 is one hardware filtered compare tap, as the game samples its sun shadow (sample_c_lz): the noisy 5-tap disk at
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
  return {
    setCamera(camera) { view = camera; },
    setDynamic(objects) { dynamic = objects; },
    staticShadowStale() { staticShadow.stale(); },
    update(focus) {
      shadowWindowCentre(focus, view, NEAR_SHADOW, sunFrame, fromSunFrame, centre);
      sun.target.position.copy(centre); sun.position.copy(centre).addScaledVector(toSun, NEAR_SHADOW.lightDistanceM);
      sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
      return view ? staticShadow.update(view, focus, dynamic) : false;
    },
    dispose() {
      scene.remove(sun, sun.target); sun.dispose(); staticShadow.dispose();
      scene.environment = null; reflection.dispose(); reflectedGround.geometry.dispose(); reflectedGround.material.dispose();
    },
  };
}
