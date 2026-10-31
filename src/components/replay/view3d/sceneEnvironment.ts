import { ACESFilmicToneMapping, Color, DirectionalLight, Fog, Mesh, MeshStandardMaterial, PCFShadowMap, PlaneGeometry, PMREMGenerator, Scene, Vector3, type Camera, type WebGLRenderer } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// Matched to LMU daytime: pale hazy horizon, soft blue zenith, dry olive ground (reads at Portimao and Spa alike).
const HORIZON = '#dfe3e4';
export const TERRAIN_COLOR = '#76734f';
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
  scene.fog = new Fog(HORIZON, 4000, 12000);
  const sky = new Sky();
  sky.scale.setScalar(SKY_RADIUS_M);
  sky.material.uniforms.sunPosition.value = SUN_OFFSET.clone();
  sky.material.uniforms.turbidity.value = 6;
  sky.material.uniforms.rayleigh.value = 1;
  sky.material.uniforms.cloudCoverage.value = 0;
  sky.name = 'sky'; sky.renderOrder = -2; sky.frustumCulled = false;
  // The dome travels with the eye so its horizon stays at infinity at every zoom level.
  sky.onBeforeRender = (_renderer, _scene, camera: Camera) => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
  const groundY = lowestSurfaceY - GROUND_CLEARANCE_M;
  const ground = new Mesh(new PlaneGeometry(GROUND_HALF_SIZE_M * 2, GROUND_HALF_SIZE_M * 2), new MeshStandardMaterial({color: TERRAIN_COLOR, roughness: 1}));
  ground.name = 'default-terrain'; ground.rotation.x = -Math.PI / 2; ground.position.y = groundY; ground.receiveShadow = true;
  scene.add(sky, ground);
  const sun = new DirectionalLight('#fff6e8', 2.4);
  sun.position.copy(SUN_OFFSET);
  // One daylight environment drives both the visible sky and every PBR material.
  // Exclude the sun disc from IBL; the directional light supplies the direct sun once.
  const probe = new Scene();
  const probeGround = ground.clone(); probeGround.position.y = -1;
  probe.add(sky.clone(), probeGround, sun.clone());
  sky.material.uniforms.showSunDisc.value = false;
  const generator = new PMREMGenerator(renderer);
  const reflection = generator.fromScene(probe, 0, 0.1, SKY_RADIUS_M * 2);
  generator.dispose();
  sky.material.uniforms.showSunDisc.value = true;
  scene.environment = reflection.texture;
  scene.environmentIntensity = 0.6;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
  // A small depth offset plus normal offset prevents thin, smooth body panels from
  // shadowing themselves without the large separation that leaks light into wheel arches.
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.00005; sun.shadow.normalBias = 0.03;
  // The frustum follows the car: wide enough for nearby walls and kerbs to shade the road,
  // tight enough (about 1.5 cm per texel) for smooth self-shadows on curved body panels.
  Object.assign(sun.shadow.camera, {left: -30, right: 30, top: 30, bottom: -30, near: 180, far: 420});
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  return {
    groundY,
    dispose() { scene.environment = null; reflection.dispose(); },
    follow(target) { sun.target.position.copy(target); sun.position.copy(target).add(SUN_OFFSET); sun.target.updateMatrixWorld(); },
  };
}
