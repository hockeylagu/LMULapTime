import { Color, DirectionalLight, DoubleSide, FogExp2, MathUtils, Matrix4, Mesh, MeshBasicMaterial, NeutralToneMapping, PCFShadowMap, PlaneGeometry, PMREMGenerator, Scene, Vector3, type Camera, type OrthographicCamera, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { nativeToScene } from './sceneFrame.js';
import type { SceneryDaylight } from '../../../../shared/types/scenes/scenery.js';

/**
 * Midday lighting, from the pipeline review viewer's daylight (pipeline/viewer/daylight.js) with two replay changes: neutral
 * tone mapping instead of ACES filmic, which desaturated the game's colours, and exponential haze (about 1% at 300 m, 25% at
 * 1.5 km, 70% at 3 km, matched by eye to the game's hills behind Fuji's main straight) instead of a linear fog. The sun is
 * stronger (4.0, viewer 3.2). Sky fill is calibrated for the unmodified Sky shader through environmentIntensity;
 * exposure controls the displayed sky and scene together, without rewriting the sky shader's radiance.
 * Neither is authored by the game data; a layout's daylight sets the sun direction and turbidity (`sceneLighting`).
 */
export const DAYLIGHT = Object.freeze({
  elevationDeg: 55, azimuthDeg: 45, sunIntensity: 4.0, environmentIntensity: 0.112, exposure: 0.90,
  turbidity: 2.5, rayleigh: 2.0, mieCoefficient: 0.005, mieDirectionalG: 0.8, horizonColor: '#c8d4e0', fogDensity: 0.00036, sunColor: '#fff8ea',
});
const SKY_RADIUS_M = 12000, ENVIRONMENT_GROUND_Y = -0.5;
/** Mean reflectance of the ground around a circuit (grass, asphalt, concrete) for the bounce light in the environment. */
const GROUND_ALBEDO = 0.2;
/**
 * One sun shadow map over a square around the camera's focus (the car), shifted ahead along the view so the road the camera
 * looks at is covered: 4096 px over 160 m is ~4 cm per texel. Every shadow pass re-draws each caster it meets, and that per-draw
 * CPU work is the frame's main cost (docs/plans/proposed/REPLAY_3D_PERFORMANCE.md), so one map replaces the three cascades the
 * frame used to draw. Nothing beyond the square is shadowed.
 */
const SHADOW_HALF_EXTENT_M = 80, SHADOW_LEAD_M = 50, SHADOW_MAP_PX = 4096, SHADOW_LIGHT_DISTANCE_M = 400;
const SHADOW_TEXEL_M = 2 * SHADOW_HALF_EXTENT_M / SHADOW_MAP_PX;
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
  /** Moves the shadow window to `focus` (scene coordinates, on the ground: the camera's look target) before a frame renders. */
  update(focus: Vector3): void;
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
  scene.environmentIntensity = DAYLIGHT.environmentIntensity;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = DAYLIGHT.exposure;

  const sun = new DirectionalLight(new Color(DAYLIGHT.sunColor), DAYLIGHT.sunIntensity);
  sun.name = 'sun'; sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_PX, SHADOW_MAP_PX);
  Object.assign(sun.shadow.camera, {left: -SHADOW_HALF_EXTENT_M, right: SHADOW_HALF_EXTENT_M, top: SHADOW_HALF_EXTENT_M, bottom: -SHADOW_HALF_EXTENT_M,
    near: 1, far: 2 * SHADOW_LIGHT_DISTANCE_M});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = 0.000001; sun.shadow.normalBias = 0.01; sun.shadow.intensity = 1; sun.shadow.radius = 1;
  scene.add(sun, sun.target);
  // The window's centre is snapped to whole texels in the sun's frame: a window sliding by fractions of a texel makes shadow edges shimmer.
  const toSun = lighting.sunDirection.clone().normalize();
  const sunFrame = new Matrix4().lookAt(new Vector3(), toSun.clone().negate(), Math.abs(toSun.y) > 0.99 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0));
  const fromSunFrame = sunFrame.clone().invert(), centre = new Vector3(), ahead = new Vector3();
  let view: PerspectiveCamera | OrthographicCamera | null = null;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
  scene.add(sky);
  return {
    setCamera(camera) { view = camera; },
    update(focus) {
      centre.copy(focus);
      if (view) {
        view.updateMatrixWorld();
        view.getWorldDirection(ahead); ahead.y = 0;
        if (ahead.lengthSq() > 1e-6) centre.addScaledVector(ahead.normalize(), SHADOW_LEAD_M);
      }
      centre.applyMatrix4(fromSunFrame);
      centre.x = Math.round(centre.x / SHADOW_TEXEL_M) * SHADOW_TEXEL_M; centre.y = Math.round(centre.y / SHADOW_TEXEL_M) * SHADOW_TEXEL_M;
      centre.applyMatrix4(sunFrame);
      sun.target.position.copy(centre); sun.position.copy(centre).addScaledVector(toSun, SHADOW_LIGHT_DISTANCE_M);
      sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    },
    dispose() {
      scene.remove(sun, sun.target); sun.dispose();
      scene.environment = null; reflection.dispose(); reflectedGround.geometry.dispose(); reflectedGround.material.dispose();
    },
  };
}
