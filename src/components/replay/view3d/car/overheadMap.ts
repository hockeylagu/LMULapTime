import { DepthTexture, LessEqualCompare, LinearFilter, Matrix4, OrthographicCamera, RedFormat, UnsignedIntType, Vector3, Vector4, WebGLRenderTarget, type IUniform, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { createShadowCasterPass } from '../shadows/shadowCasterPass.js';

/**
 * The scenery around a car seen from straight above and from straight below, as depth: the top and the underside of what stands over
 * each point of the ground (a bridge's deck, a gantry, a tree's crown). Casters draw only their visible side (shadowCasterPass.ts),
 * so from below the ground and roofs do not show, only undersides: a deck's soffit, a gantry's beam, leaves. Car paint tests its reflected rays against it (carPaint.ts) to tell where its reflection probe is stale: the probe
 * renews every few frames, and between renewals a car driving under a bridge kept the sky the probe last saw overhead, then darkened
 * at once at the next probe (as at 2 fps, 2026-11-16). The scenery does not move, so the map is drawn again only once the car has
 * left its middle, or the scenery changed.
 */
export interface OverheadMap {
  /** World position → (u, v, depth), the depth plain (0 at the camera above, 1 at its far end) as the map stores it. */
  matrix: Matrix4;
  /** The tops, seen from above, null until first drawn. */
  depth: DepthTexture | null;
  /** The same from below (0 at the camera below), for `below`. */
  belowMatrix: Matrix4;
  /** The undersides, seen from below, null until first drawn. */
  below: DepthTexture | null;
  /** Metres of world height per unit of either map's depth. */
  depthM: number;
}

/** What stands over the scenery around a probe's car (`map`), and where each face of the shown probe was drawn from. */
export interface CarOverhead {
  map: OverheadMap;
  /** Each face's eye in scene coordinates, xyz in the GL face order (+x, −x, +y, −y, +z, −z). */
  eyes: Float32Array<ArrayBuffer>;
}

/**
 * How far a car's reflected ray is tested against the scenery overhead: up to this high over its start (gantries, bridges, trees),
 * at most this far along, in this many steps.
 */
const RISE_M = '20.0', REACH_M = '40.0', STEPS = 32;

/**
 * The overhead test for a car material's fragment program (after three's common chunk; it reads `vViewPosition`). `overheadFix(r)`
 * tells how a probe read along the world direction r is stale where the fragment is: w < 0, a rising ray the scenery blocked
 * where the probe's face was drawn but not here, so by −w it sees the sky; w > 0, one the scenery blocks here but did not there,
 * so by w it sees that scenery, as the probe saw it along xyz (from the face's eye toward where the ray meets it); 0, the probe
 * read stands.
 */
export const OVERHEAD_GLSL = `
  uniform sampler2DShadow overhead_top, overhead_below; uniform mat4 overhead_topMatrix, overhead_belowMatrix;
  uniform vec3 overhead_eyes[6]; uniform float overhead_ready;
  // How far along a ray rising from p along d meets the scenery over the road, within reach (0: it does not): the first step mostly
  // between an underside and its top, as the maps from below and above hold them. The maps are read compared and filtered: x is the
  // most of a step's texels the ray passed through that way (0 to 1, smooth across a deck's edge), y how far along that step lies.
  vec2 overheadHit(vec3 p, vec3 d) {
    float reach = min(${REACH_M}, ${RISE_M} / d.y);
    vec2 hit = vec2(0.0);
    for (int i = 1; i <= ${STEPS}; i++) {
      float t = reach * float(i) / ${STEPS}.0;
      vec4 q = overhead_topMatrix * vec4(p + d * t, 1.0), b = overhead_belowMatrix * vec4(p + d * t, 1.0);
      if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) break;
      // The share of texels the point lies under the top in (each map compared at the point's depth), and over the underside in.
      float inside = min(1.0 - texture(overhead_top, q.xyz), 1.0 - texture(overhead_below, b.xyz));
      if (inside > hit.x) hit = vec2(inside, t);
      if (hit.x >= 1.0) break;
    }
    return hit;
  }
  // The eye of the probe face a direction reads.
  vec3 overheadEye(vec3 d) {
    vec3 a = abs(d);
    if (a.x >= a.y && a.x >= a.z) return d.x >= 0.0 ? overhead_eyes[0] : overhead_eyes[1];
    if (a.y >= a.z) return d.y >= 0.0 ? overhead_eyes[2] : overhead_eyes[3];
    return d.z >= 0.0 ? overhead_eyes[4] : overhead_eyes[5];
  }
  vec4 overheadFix(vec3 r) {
    if (overhead_ready < 0.5 || r.y <= 0.0) return vec4(r, 0.0);
    vec3 x = cameraPosition + inverseTransformDirection(-vViewPosition, viewMatrix) * length(vViewPosition);
    vec2 here = overheadHit(x, r);
    float change = here.x - overheadHit(overheadEye(r), r).x;
    if (change <= 0.0) return vec4(r, change);
    vec3 met = x + r * here.y;
    return vec4(normalize(met - overheadEye(met - overhead_eyes[0])), change);
  }
`;

const NO_MATRIX = new Matrix4(), NO_EYES = new Float32Array(18);

/** The overhead test's uniforms, reading `current` each frame: the test is off while it gives null or its map is not drawn yet. */
export function overheadUniforms(current: () => CarOverhead | null): Record<string, IUniform> {
  const drawn = () => { const overhead = current(); return overhead?.map.depth ? overhead : null; };
  return {
    overhead_top: {get value() { return drawn()?.map.depth ?? null; }},
    overhead_below: {get value() { return drawn()?.map.below ?? null; }},
    overhead_topMatrix: {get value() { return drawn()?.map.matrix ?? NO_MATRIX; }},
    overhead_belowMatrix: {get value() { return drawn()?.map.belowMatrix ?? NO_MATRIX; }},
    overhead_eyes: {get value() { return drawn()?.eyes ?? NO_EYES; }},
    overhead_ready: {get value() { return drawn() ? 1 : 0; }},
  };
}

/** The map's side and texels: 0.25 m texels over 256 m, so a car's rays reach 80 m and more before they leave it. */
const SIDE_M = 256, SIZE_PX = 1024;
/** It is drawn again once the car is this far from its middle (horizontally). */
const RECENTRE_M = 48;
/** Each camera sits this far over (or under) the car, and sees this far down (or up). */
const ABOVE_M = 300, DEPTH_M = 600;
/** The scenery streams in and out in steps: a change waits this many updates after the last drawing, so a burst draws it once or twice. */
const STALE_WAIT_UPDATES = 30;
/** Casters under this size across are left out (signs and posts, which a car's reflection does not pass under). */
const MIN_CASTER_M = 1;

const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

/** A depth map drawn by an orthographic camera looking straight down or up, read compared and filtered. */
function createLayer(renderer: WebGLRenderer) {
  const depth = new DepthTexture(SIZE_PX, SIZE_PX, UnsignedIntType);
  // Read compared and filtered: a ray's test against it is a share of the texels around, smooth across a deck's edge.
  depth.compareFunction = LessEqualCompare; depth.minFilter = LinearFilter; depth.magFilter = LinearFilter;
  const target = new WebGLRenderTarget(SIZE_PX, SIZE_PX, {format: RedFormat, depthTexture: depth, generateMipmaps: false});
  renderer.initRenderTarget(target); // A sampler needs its depth texture to exist before the first draw.
  const camera = new OrthographicCamera(-SIDE_M / 2, SIDE_M / 2, SIDE_M / 2, -SIDE_M / 2, 0, DEPTH_M);
  camera.up.set(0, 0, -1);
  return {depth, target, camera};
}

export function createOverheadMap(renderer: WebGLRenderer, scene: Scene): OverheadMap & {
  /**
   * Draws the map again around `car` if the car left its middle or the scenery changed; true when it drew. `cars` are left out. On a
   * `busy` frame a due drawing waits for the next one, never two in a row (at speed the cached shadow cascades redraw every frame).
   */
  update(car: Vector3, cars: readonly Object3D[], busy?: boolean): boolean;
  /** The scenery changed: the next update draws the map again. */
  stale(): void;
  dispose(): void;
} {
  const above = createLayer(renderer), under = createLayer(renderer);
  const casters = createShadowCasterPass(renderer, scene), viewport = new Vector4(0, 0, SIZE_PX, SIZE_PX), centre = new Vector3();
  let drawn = false, stale = false, since = 0, waited = false;
  const map = {
    matrix: new Matrix4(), depth: null as DepthTexture | null, belowMatrix: new Matrix4(), below: null as DepthTexture | null, depthM: DEPTH_M,
    update(car: Vector3, cars: readonly Object3D[], busy = false) {
      since++;
      if (drawn && Math.hypot(car.x - centre.x, car.z - centre.z) < RECENTRE_M && !(stale && since >= STALE_WAIT_UPDATES)) return false;
      if (busy && drawn && !waited) { waited = true; return false; }
      centre.copy(car); stale = false; since = 0; waited = false;
      for (const [layer, side, matrix] of [[above, 1, map.matrix], [under, -1, map.belowMatrix]] as const) {
        const {camera, target} = layer;
        camera.position.set(car.x, car.y + side * ABOVE_M, car.z); camera.lookAt(car.x, car.y, car.z); camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();
        casters.draw(target, [{viewport, light: camera, depthBias: {slope: 0, units: 0}}], camera, cars, MIN_CASTER_M);
        matrix.multiplyMatrices(BIAS, camera.projectionMatrix).multiply(camera.matrixWorldInverse);
      }
      map.depth = above.depth; map.below = under.depth; drawn = true;
      return true;
    },
    stale() { stale = true; },
    dispose() {
      casters.dispose();
      for (const layer of [above, under]) { layer.depth.dispose(); layer.target.dispose(); }
    },
  };
  return map;
}
