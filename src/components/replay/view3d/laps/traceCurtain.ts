import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, MathUtils, Mesh, Vector3, type OrthographicCamera, type PerspectiveCamera, type ShaderMaterial,
} from 'three';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import type { SurfaceHeight } from '../scenery/sceneryGround.js';
import type { DisplayTransform } from '../autoExposure.js';
import { composedMaterial, type ShaderPart } from '../shaders/composer.js';
import { sceneValue } from '../shaders/sceneBlock.js';
import { unlitTemplate } from '../shaders/unlitTemplate.js';
import { colourBaker, exposureDivide, fillHeights, joinedToPrevious } from './racingLine.js';
import type { CameraMode } from '../camera/cameraModes.js';

/** A channel's full chart range stands this tall over the road: a car height and a half, readable from a high chase view. */
export const CURTAIN_HEIGHT_M = 3;
/** The fill's opacity at the top edge; it fades to nothing at the road. */
export const CURTAIN_FILL_OPACITY = 0.5;
/**
 * The top edge: a band standing up and one lying flat, so it reads from the side and from above (WebGL lines are 1 px), this many
 * pixels each side of its line however far it is: a hairline as the chart's, never a thick band over the scenery (driver, 2026-11-28).
 */
const EDGE_HALF_PX = 1;
/** The foot sits just over the road, as the racing line. */
const FOOT_LIFT_M = 0.02;
/**
 * The curtain's full heights (m): its own beside the car, taller in steps from a far free camera. The height is the value, so it never
 * follows the camera smoothly (driver, 2026-11-28: a height that grew with the distance read as the value changing, and one fixed
 * height was either unreadable from the air or towering close by); a step changes rarely and the legend names it.
 */
export const CURTAIN_STEPS_M = [CURTAIN_HEIGHT_M, 10, 30, 100] as const;
/** The height a free camera wants: this share of the height it sees at the lap's nearest point; it stands at the nearest step. */
const VIEW_SHARE = 0.08; // 5.5 % stepped up too late (driver, 2026-11-28).
/**
 * Slack: a step is reached at the (geometric) midpoint to the one before it, and left downward only under this share of that
 * midpoint, so the curtain never flickers between two steps.
 */
const STEP_DOWN_SHARE = 0.75;
/** Where the step at `index` begins: half way (geometrically) from the step below. */
const stepFrom = (index: number) => Math.sqrt(CURTAIN_STEPS_M[index - 1] * CURTAIN_STEPS_M[index]);
/** The attribute holding each vertex's offset from its foot on the road at scale 1 (the fill's top, an edge's height). */
export const CURTAIN_RISE_ATTRIBUTE = 'curtainRise';
/** The attribute holding an edge band's corner offset from its edge line, in pixels (`EDGE_HALF_PX`); 0 on the fill. */
const CURTAIN_WIDEN_ATTRIBUTE = 'curtainWiden';

/**
 * The curtain's step (an index into `CURTAIN_STEPS_M`) for a camera `lapReach()` metres from the lap's nearest point (read only for a
 * free perspective camera, so turning it keeps the step), from the step it stands
 * at: the first beside the car (the car cameras and trackside, which frame it); from the free cameras (orbit and overhead), the step
 * nearest `VIEW_SHARE` of the height seen there (an orthographic camera sees its frame's height everywhere), with slack going down.
 */
export function curtainStep(mode: CameraMode, camera: PerspectiveCamera | OrthographicCamera, lapReach: () => number, current: number): number {
  if (mode !== 'orbit' && mode !== 'top') return 0;
  const seen = 'isPerspectiveCamera' in camera ? 2 * Math.tan(MathUtils.degToRad(camera.fov) / 2) * lapReach() : camera.top - camera.bottom;
  const wanted = seen / camera.zoom * VIEW_SHARE;
  let step = Math.min(current, CURTAIN_STEPS_M.length - 1);
  while (step + 1 < CURTAIN_STEPS_M.length && wanted >= stepFrom(step + 1)) step++;
  while (step > 0 && wanted < stepFrom(step) * STEP_DOWN_SHARE) step--;
  return step;
}

const viewPoint = new Vector3();
/** Metres a pixel covers at a scene point (the curtain shader's, `setViewPixel`): the cursor lines' width and the overhead pick's reach. */
export function metresPerPixel(camera: PerspectiveCamera | OrthographicCamera, point: Vector3): number {
  const depth = 'isPerspectiveCamera' in camera ? -viewPoint.copy(point).applyMatrix4(camera.matrixWorldInverse).z : 1;
  return depth * sceneValue('view_pixel') / camera.projectionMatrix.elements[5];
}

/**
 * Draw order (`renderOrder`): after the racing lines (2, 3) and the driving marks (4), the baseline curtain before the lap's, and both
 * before the see-through ghost's parts (from `GHOST_FIRST_ORDER`, carObject.ts).
 */
export const CURTAIN_ORDER = {baseline: 4.5, primary: 4.6} as const;

/** One lap's curtain: per sample its height share (0 at the road, 1 at full height, NaN without a value) for each top edge. */
export interface CurtainValues {
  /** One array per top edge (one for a single value, four for a per-wheel channel), one share per lap sample. */
  edges: number[][];
  /** Each edge's colour (the chart's: the channel's colour, or a wheel's). */
  edgeColours: string[];
  /** The fill's colour per sample (balance: understeer or oversteer by sign), under the highest edge. */
  fillColours: string[];
  /** Each edge's opacity: 1, or half for the baseline lap's per-wheel edges. */
  edgeOpacity: number;
}

/**
 * How far the curtains fade in front of the camera (m, from fully gone to fully shown): a 3 m sheet on the lap's own line stands in
 * front of the driver cameras, so they see the road ahead and the trace a few car lengths down it (from 30 m it read as too far off:
 * driver, 2026-11-28). Chase sits 7.8 m behind the car, so it fades closer still. Tuned in the look check.
 */
export function curtainFade(mode: CameraMode): [number, number] {
  if (mode === 'cockpit' || mode === 'hood' || mode === 'roof') return [8, 12];
  if (mode === 'chase') return [6, 10];
  return [-2, -1];
}

const FADE_VERTEX_PARS = `  varying float vCurtainDistance;\n  attribute vec3 ${CURTAIN_RISE_ATTRIBUTE};\n  attribute vec3 ${CURTAIN_WIDEN_ATTRIBUTE};\n  uniform float CURTAIN_SCALE;\n`;
// The edge bands widen by the metres a pixel covers where they stand (`setViewPixel`).
const RISE_POSITION = `  transformed += ${CURTAIN_RISE_ATTRIBUTE} * CURTAIN_SCALE;
  {
    vec4 curtainView = modelViewMatrix * vec4( transformed, 1.0 );
    float curtainPixelM = ( isPerspectiveMatrix( projectionMatrix ) ? -curtainView.z : 1.0 ) * view_pixel / projectionMatrix[ 1 ][ 1 ];
    transformed += ${CURTAIN_WIDEN_ATTRIBUTE} * curtainPixelM;
  }
`;
const FADE_VERTEX = '  vCurtainDistance = length( mvPosition.xyz );\n';
const FADE_FRAGMENT_PARS = '  varying float vCurtainDistance;\n  uniform vec2 CURTAIN_FADE;\n';
const FADE_FRAGMENT = '  diffuseColor.a *= smoothstep( CURTAIN_FADE.x, CURTAIN_FADE.y, vCurtainDistance );\n';

/**
 * Stands each vertex up from its foot by its rise at its step's scale (`CURTAIN_SCALE`, `curtainStep`), widens the edge bands to
 * their pixels, and fades a curtain per fragment by its distance to the camera (`curtainFade`): the material's own `CURTAIN_FADE`.
 */
const curtainPart: ShaderPart = {
  name: 'curtain',
  slots: {
    vertexPars: {at: 20, glsl: FADE_VERTEX_PARS},
    vertexPosition: {at: 20, glsl: RISE_POSITION},
    vertexOutputs: {at: 20, glsl: FADE_VERTEX},
    fragmentPars: {at: 20, glsl: FADE_FRAGMENT_PARS},
    fragmentColour: {at: 20, glsl: FADE_FRAGMENT},
  },
  uniforms: () => ({CURTAIN_FADE: {value: [-2, -1]}, CURTAIN_SCALE: {value: 1}}),
};

/** A sample's highest edge with a value (NaN when no edge has one): the fill's top. */
function topShare(values: CurtainValues, index: number): number {
  let top = NaN;
  for (const edge of values.edges) if (Number.isFinite(edge[index]) && !(edge[index] <= top)) top = edge[index];
  return top;
}

interface CurtainState {
  lap: ReplayTrajectoryData;
  origin: Vector3;
  heights: Array<number | null>;
  values: CurtainValues;
  display: () => DisplayTransform;
  baked: DisplayTransform | null;
  /** How many times its own height it stands, as last set (`viewTraceCurtain`): the cursor line's and the pick's. */
  scale: number;
  /** The camera-distance fade last set (`fadeTraceCurtain`): the pick leaves out what it hides. */
  fade: [number, number];
}
const curtains = new WeakMap<Mesh, CurtainState>();
/** Each curtain geometry's fill indices (the strip of two vertices per sample, before the top edges): the hover pick's. */
const fillIndexCounts = new WeakMap<BufferGeometry, number>();

/** The index count of the curtain's fill strip, which the hover pick tests (`tracePick.ts`). */
export const curtainFillIndexCount = (mesh: Mesh): number => fillIndexCounts.get(mesh.geometry) ?? 0;

/**
 * The fill (a strip from the road to the highest edge, two vertices per sample, alpha fading to the road) then each top edge as a
 * standing and a lying band (four vertices per sample each). Gaps break the curtain as they break the ribbon; a sample without a value
 * breaks it too. Positions are each vertex's foot on the road, in scene space under the mirrored world as the ribbon's; the rise
 * attribute stands it up (`curtainPart`).
 */
function curtainGeometry(state: CurtainState): BufferGeometry {
  const {lap: {points}, origin, heights, values} = state, n = points.length;
  const edgeCount = values.edges.length;
  const vertexCount = n * (2 + edgeCount * 4);
  const positions = new Float32Array(vertexCount * 3), rises = new Float32Array(vertexCount * 3), widens = new Float32Array(vertexCount * 3);
  const indices: number[] = [];
  const top = (i: number) => topShare(values, i);
  const has = (i: number) => Number.isFinite(top(i));
  const joined = (i: number) => joinedToPrevious(points, heights, i) && has(i) && has(i - 1);
  const edgeBase = n * 2;
  for (let i = 0; i < n; i++) {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(n - 1, i + 1)];
    let dx = after.x - before.x, dz = after.z - before.z;
    const length = Math.hypot(dx, dz) || 1; dx /= length; dz /= length;
    const x = points[i].x - origin.x, z = points[i].z - origin.z, foot = (heights[i] ?? points[i].y) - origin.y + FOOT_LIFT_M;
    const share = has(i) ? Math.max(0, Math.min(1, top(i))) : 0;
    positions.set([x, foot, z, x, foot, z], i * 6);
    rises[i * 6 + 4] = share * CURTAIN_HEIGHT_M;
    values.edges.forEach((edge, e) => {
      const y = (Number.isFinite(edge[i]) ? Math.max(0, Math.min(1, edge[i])) : 0) * CURTAIN_HEIGHT_M;
      const at = (edgeBase + (e * n + i) * 4) * 3;
      for (let k = 0; k < 4; k++) positions.set([x, foot, z], at + k * 3);
      rises.set([0, y, 0, 0, y, 0, 0, y, 0, 0, y, 0], at);
      const w = EDGE_HALF_PX;
      widens.set([0, -w, 0, 0, w, 0, -dz * w, 0, dx * w, dz * w, 0, -dx * w], at);
    });
    if (i === 0 || !joined(i)) continue;
    const a = (i - 1) * 2, b = i * 2;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const fillIndexCount = indices.length;
  // Edges after the fill, so within the one draw they blend over it.
  for (let e = 0; e < edgeCount; e++) {
    for (let i = 1; i < n; i++) {
      if (!joined(i) || !Number.isFinite(values.edges[e][i]) || !Number.isFinite(values.edges[e][i - 1])) continue;
      const a = edgeBase + (e * n + i - 1) * 4, b = a + 4;
      indices.push(a, a + 1, b, a + 1, b + 1, b, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(CURTAIN_RISE_ATTRIBUTE, new Float32BufferAttribute(rises, 3));
  geometry.setAttribute(CURTAIN_WIDEN_ATTRIBUTE, new Float32BufferAttribute(widens, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(vertexCount * 4), 4));
  geometry.setIndex(indices);
  fillIndexCounts.set(geometry, fillIndexCount);
  return geometry;
}

/** Bakes every vertex colour for the display transform (as the racing line's), with the fill's fade and the edges' opacity in alpha. */
function bakeCurtain(mesh: Mesh<BufferGeometry, ShaderMaterial>, state: CurtainState): void {
  const display = state.display(), bake = colourBaker(display), colour = new Color();
  const attribute = mesh.geometry.getAttribute('color') as Float32BufferAttribute, n = state.lap.points.length;
  for (let i = 0; i < n; i++) {
    const {r, g, b} = bake(state.values.fillColours[i] ?? state.values.edgeColours[0], colour);
    attribute.setXYZW(i * 2, r, g, b, 0);
    attribute.setXYZW(i * 2 + 1, r, g, b, CURTAIN_FILL_OPACITY);
  }
  state.values.edgeColours.forEach((hex, e) => {
    const {r, g, b} = bake(hex, colour);
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) attribute.setXYZW(n * 2 + (e * n + i) * 4 + k, r, g, b, state.values.edgeOpacity);
  });
  attribute.needsUpdate = true;
  state.baked = display;
}

/** A lap's curtain over its racing line, draped on the road now resident (`surfaceHeight`). */
export function makeTraceCurtain(
  lap: ReplayTrajectoryData, origin: Vector3, values: CurtainValues, surfaceHeight: SurfaceHeight, display: () => DisplayTransform, renderOrder: number,
): Mesh<BufferGeometry, ShaderMaterial> {
  const heights: Array<number | null> = lap.points.map(() => null);
  fillHeights(heights, lap, surfaceHeight);
  const state: CurtainState = {lap, origin, heights, values, display, baked: null, scale: 1, fade: curtainFade('orbit')};
  // Unlit data like the racing line, standing: no offset toward the camera, depth tested but not written so both laps' sheets show
  // through each other and the marks on the road read through the fill.
  // No haze: the curtain is data, as readable across the whole circuit from the air as next to the car.
  const material = composedMaterial(unlitTemplate, [exposureDivide, curtainPart],
    {vertexColors: true, side: DoubleSide, transparent: true, depthWrite: false});
  const mesh = new Mesh(curtainGeometry(state), material);
  mesh.name = 'trace-curtain'; mesh.renderOrder = renderOrder; mesh.castShadow = false; mesh.receiveShadow = false;
  // The bounds are the feet's: the sheet standing over them would be culled at the frame's edge. One mesh spans the lap anyway.
  mesh.frustumCulled = false;
  curtains.set(mesh, state);
  bakeCurtain(mesh, state);
  return mesh;
}

const stateOf = (mesh: Mesh): CurtainState => {
  const state = curtains.get(mesh);
  if (!state) throw Error('Trace curtain was not built by makeTraceCurtain');
  return state;
};

/** Re-bakes the colours when the display transform changed (another camera type); call before the frame renders. */
export function syncTraceCurtain(mesh: Mesh<BufferGeometry, ShaderMaterial>): void {
  const state = stateOf(mesh);
  if (state.baked !== state.display()) bakeCurtain(mesh, state);
}

/** Re-drapes the curtain on the road now resident, keeping its values. */
export function refreshTraceCurtain(mesh: Mesh<BufferGeometry, ShaderMaterial>, surfaceHeight: SurfaceHeight): void {
  const state = stateOf(mesh);
  if (!fillHeights(state.heights, state.lap, surfaceHeight)) return;
  mesh.geometry.dispose();
  mesh.geometry = curtainGeometry(state);
  bakeCurtain(mesh, state);
}

/** Sets the camera-distance fade for the camera mode (`curtainFade`). */
export function fadeTraceCurtain(mesh: Mesh<BufferGeometry, ShaderMaterial>, mode: CameraMode): void {
  const fade = (mesh.material.uniforms.CURTAIN_FADE as {value: number[]}).value, [near, far] = curtainFade(mode);
  fade[0] = near; fade[1] = far; stateOf(mesh).fade = [near, far];
}

/** Sets how many times its own height the curtain stands (its step over `CURTAIN_HEIGHT_M`). */
export function viewTraceCurtain(mesh: Mesh<BufferGeometry, ShaderMaterial>, scale: number): void {
  stateOf(mesh).scale = scale;
  (mesh.material.uniforms.CURTAIN_SCALE as {value: number}).value = scale;
}

/**
 * How a curtain's vertices stand as last set, for the pick (`tracePick.ts`): how many times its own height it stands (its step's
 * scale), and the distance from the eye it shows from (half way through its fade: nearer, the sheet is faded out, so the pointer is
 * not on it).
 */
export interface CurtainLift {
  scale: number;
  shownFromM: number;
}

export function curtainLift(mesh: Mesh): CurtainLift {
  const {scale, fade: [near, far]} = stateOf(mesh);
  return {scale, shownFromM: (near + far) / 2};
}

/** The sample's curtain height above the road in metres at its scale (the highest edge), for the cursor line. */
export function curtainTopM(mesh: Mesh, index: number): number {
  const top = topShare(stateOf(mesh).values, index);
  return Number.isFinite(top) ? Math.max(0, Math.min(1, top)) * CURTAIN_HEIGHT_M * stateOf(mesh).scale : 0;
}

/** The fill's colour at a sample (the pressed pedal, the balance's sign, the channel's or the lap's colour): the cursor line's. */
export function curtainColourAt(mesh: Mesh, index: number): string {
  const {values} = stateOf(mesh);
  return values.fillColours[index] ?? values.edgeColours[0];
}
