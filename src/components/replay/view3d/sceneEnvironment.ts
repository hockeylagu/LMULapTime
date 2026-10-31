import { ACESFilmicToneMapping, Color, DirectionalLight, Fog, Mesh, MeshStandardMaterial, PCFShadowMap, PlaneGeometry, PMREMGenerator, type Scene, Vector3, type Camera, type WebGLRenderer } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// Matched to LMU daytime: pale hazy horizon, natural clear zenith, authentic circuit turf.
const HORIZON = '#ccd4dc';
export const TERRAIN_COLOR = '#354829';
/** Beyond any layout; the ground fades into the horizon colour before the sky dome. */
const GROUND_HALF_SIZE_M = 16000, SKY_RADIUS_M = 13000, SUN_OFFSET = new Vector3(120, 260, 80);
/** Below the lowest scanned surface and the relief's 0.6 m edge, so it never z-fights or covers road. */
const GROUND_CLEARANCE_M = 1;

export interface SceneEnvironment {
  /** Scene-space height of the default ground plane. */
  groundY: number;
  /** Keep the sun's shadow frustum on the followed car. */
  follow(target: Vector3): void;
  dispose(): void;
}

/**
 * Sky dome, horizon fog, a flat default terrain and a shadow-casting sun, so no camera view shows
 * void and the car reads as standing on the road. The terrain is generic filler, not measured ground.
 */
export function addSceneEnvironment(scene: Scene, renderer: WebGLRenderer, lowestSurfaceY: number): SceneEnvironment {
  scene.background = new Color(HORIZON);
  scene.fog = new Fog(HORIZON, 3500, 11000);
  const sky = new Sky();
  sky.scale.setScalar(SKY_RADIUS_M);
  sky.material.uniforms.sunPosition.value = SUN_OFFSET.clone();
  sky.material.uniforms.turbidity.value = 3.5;
  sky.material.uniforms.rayleigh.value = 0.35;
  sky.material.uniforms.cloudCoverage.value = 0;
  sky.name = 'sky'; sky.frustumCulled = false;
  // The dome travels with the eye so its horizon stays at infinity at every zoom level.
  sky.onBeforeRender = (_renderer, _scene, camera: Camera) => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
  const groundY = lowestSurfaceY - GROUND_CLEARANCE_M;
  const ground = new Mesh(new PlaneGeometry(GROUND_HALF_SIZE_M * 2, GROUND_HALF_SIZE_M * 2), new MeshStandardMaterial({color: TERRAIN_COLOR, roughness: 1}));
  ground.name = 'default-terrain'; ground.rotation.x = -Math.PI / 2; ground.position.y = groundY; ground.receiveShadow = true;
  const sun = new DirectionalLight('#fffaf2', 2.3);
  sun.position.copy(SUN_OFFSET);
  scene.add(sky, ground, sun, sun.target);

  // Bake the sky and ground into one PMREM environment before track/car meshes are added.
  // Exclude the sun disc from IBL so the directional light supplies the direct sun once.
  sky.material.uniforms.showSunDisc.value = false;
  const generator = new PMREMGenerator(renderer);
  const reflection = generator.fromScene(scene, 0, 0.1, SKY_RADIUS_M * 2);
  generator.dispose();
  sky.material.uniforms.showSunDisc.value = true;
  scene.environment = reflection.texture;
  scene.environmentIntensity = 0.38;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0001; sun.shadow.normalBias = 0.02;
  // The frustum follows the car: wide enough for nearby walls and kerbs to shade the road,
  // tight enough (about 1.5 cm per texel) for smooth shadows on curved body panels.
  Object.assign(sun.shadow.camera, {left: -30, right: 30, top: 30, bottom: -30, near: 180, far: 420});
  sun.shadow.camera.updateProjectionMatrix();
  return {
    groundY,
    dispose() { scene.environment = null; reflection.dispose(); },
    follow(target) { sun.target.position.copy(target); sun.position.copy(target).add(SUN_OFFSET); sun.target.updateMatrixWorld(); },
  };
}
