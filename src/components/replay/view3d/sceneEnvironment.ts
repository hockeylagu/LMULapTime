import { Color, DoubleSide, FogExp2, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial, NeutralToneMapping, PCFShadowMap, PlaneGeometry, PMREMGenerator, Scene, ShaderChunk, Vector3, type Camera, type Material, type Object3D, type OrthographicCamera, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSM } from 'three/addons/csm/CSM.js';
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
const SHADOW_MAX_DISTANCE_M = 150, SHADOW_CASCADES = 3, SHADOW_MAP_PX = 2048;
let activeCsmCount = 0;
let originalLightingChunks: {begin: string; pars: string} | null = null;

function acquireCsmShaderChunks(): void {
  if (activeCsmCount === 0) originalLightingChunks = {begin: ShaderChunk.lights_fragment_begin, pars: ShaderChunk.lights_pars_begin};
  activeCsmCount++;
}

function releaseCsmShaderChunks(): void {
  if (--activeCsmCount !== 0 || !originalLightingChunks) return;
  ShaderChunk.lights_fragment_begin = originalLightingChunks.begin;
  ShaderChunk.lights_pars_begin = originalLightingChunks.pars;
  originalLightingChunks = null;
}
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
  /** The camera followed by the directional shadow window. */
  setCamera(camera: PerspectiveCamera | OrthographicCamera): void;
  /** Applies cascaded shadows to newly loaded receivers before their first compile. */
  prepareObject(object: Object3D): void;
  update(): void;
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

  let cascades: CSM | null = null;
  let ownsCsmShaderChunks = false;
  const originalCompile = new Map<Material, Material['onBeforeCompile']>();
  const prepareMaterial = (material: Material) => {
    if (!cascades || !(material instanceof MeshStandardMaterial) || originalCompile.has(material)) return;
    const compile = material.onBeforeCompile.bind(material);
    cascades.setupMaterial(material);
    const compileCsm = material.onBeforeCompile.bind(material);
    material.onBeforeCompile = (shader, compileRenderer) => { compile(shader, compileRenderer); compileCsm(shader, compileRenderer); };
    originalCompile.set(material, compile);
  };
  const prepareObject = (object: Object3D) => {
    object.traverse(child => {
      if (!(child instanceof Mesh) || !child.receiveShadow) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(prepareMaterial);
    });
  };
  let view: PerspectiveCamera | OrthographicCamera | null = null;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
  scene.add(sky);
  return {
    setCamera(camera) {
      view = camera;
      if (cascades) {
        cascades.camera = camera;
        cascades.updateFrustums();
        return;
      }
      acquireCsmShaderChunks(); ownsCsmShaderChunks = true;
      cascades = new CSM({camera, parent: scene, cascades: SHADOW_CASCADES, maxFar: SHADOW_MAX_DISTANCE_M, shadowMapSize: SHADOW_MAP_PX,
        shadowBias: 0.000001, lightDirection: lighting.sunDirection.clone().negate(), lightIntensity: DAYLIGHT.sunIntensity, lightNear: 1, lightFar: 500});
      for (const light of cascades.lights) {
        light.color.set(DAYLIGHT.sunColor);
        light.shadow.intensity = 1; light.shadow.radius = 1; light.shadow.normalBias = 0.01;
      }
      prepareObject(scene);
    },
    prepareObject,
    update() {
      if (!view) return;
      view.updateMatrixWorld();
      cascades?.update();
    },
    dispose() {
      if (cascades) {
        const lights = [...cascades.lights];
        cascades.remove(); cascades.dispose();
        for (const [material, compile] of originalCompile) material.onBeforeCompile = compile;
        lights.forEach(light => light.dispose());
        cascades = null;
      }
      if (ownsCsmShaderChunks) releaseCsmShaderChunks();
      scene.environment = null; reflection.dispose(); reflectedGround.geometry.dispose(); reflectedGround.material.dispose();
    },
  };
}
