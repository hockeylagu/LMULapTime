import { BackSide, Color, DirectionalLight, Fog, HemisphereLight, Mesh, MeshStandardMaterial, PCFSoftShadowMap, PlaneGeometry, ShaderMaterial, SphereGeometry, Vector3, type Camera, type Scene, type WebGLRenderer } from 'three';

// Matched to LMU daytime: pale hazy horizon, soft blue zenith, dry olive ground (reads at Portimao and Spa alike).
const ZENITH = '#6a97c8', HORIZON = '#dfe3e4';
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
}

/**
 * Sky dome, horizon fog, a flat default terrain and a shadow-casting sun, so no camera view shows
 * void and the car reads as standing on the road. The terrain is generic filler, not measured ground.
 */
export function addSceneEnvironment(scene: Scene, renderer: WebGLRenderer, lowestSurfaceY: number): SceneEnvironment {
  scene.background = new Color(HORIZON);
  scene.fog = new Fog(HORIZON, 4000, 12000);
  const sky = new Mesh(new SphereGeometry(SKY_RADIUS_M, 32, 16), new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: {zenith: {value: new Color(ZENITH)}, horizon: {value: new Color(HORIZON)}},
    vertexShader: 'varying vec3 direction; void main() { direction = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 zenith; uniform vec3 horizon; varying vec3 direction; void main() { gl_FragColor = vec4(mix(horizon, zenith, pow(max(direction.y, 0.0), 0.6)), 1.0); }',
  }));
  sky.name = 'sky'; sky.renderOrder = -2; sky.frustumCulled = false;
  // The dome travels with the eye so its horizon stays at infinity at every zoom level.
  sky.onBeforeRender = (_renderer, _scene, camera: Camera) => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
  const groundY = lowestSurfaceY - GROUND_CLEARANCE_M;
  const ground = new Mesh(new PlaneGeometry(GROUND_HALF_SIZE_M * 2, GROUND_HALF_SIZE_M * 2), new MeshStandardMaterial({color: TERRAIN_COLOR, roughness: 1}));
  ground.name = 'default-terrain'; ground.rotation.x = -Math.PI / 2; ground.position.y = groundY; ground.receiveShadow = true;
  scene.add(sky, ground, new HemisphereLight('#ffffff', '#4f543c', 1.6));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
  const sun = new DirectionalLight('#fff6e8', 2.4);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  // The frustum follows the car: wide enough for nearby walls and kerbs to shade the road,
  // tight enough (about 3 cm per texel) to keep the car's contact shadow crisp.
  Object.assign(sun.shadow.camera, {left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 800});
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  return {
    groundY,
    follow(target) { sun.target.position.copy(target); sun.position.copy(target).add(SUN_OFFSET); sun.target.updateMatrixWorld(); },
  };
}
