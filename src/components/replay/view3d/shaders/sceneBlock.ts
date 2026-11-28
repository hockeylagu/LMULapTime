import { DynamicDrawUsage, Uniform, UniformsGroup, type Matrix3 } from 'three';
import { ASSUMED_RUBBER } from '../scenery/realRoad.js';

/**
 * The scene-wide values every composed program reads, in two std140 uniform blocks shared by all of them (three's `UniformsGroup`,
 * `material.uniformsGroups`): the scene block, constant over a frame, and the pass block, the few values that differ between the
 * renders of one frame. Each template declares both blocks, the same text in both of its stages (`SCENE_BLOCKS_GLSL`), so every
 * composed program binds them at the same points and no program key splits on them; a part reads a member by its name (a block
 * without an instance name puts its members in the global scope), never declares it. Textures stay ordinary uniforms: a block holds
 * no sampler.
 *
 * How three uploads them (r187 `WebGLUniformsGroups`): a group is updated at its first draw in each `render()` call (`info.render.frame`
 * counts render calls, not animation frames), so a value written between two renders reaches the second; one written during a render
 * waits for the next. A typed array member is uploaded at every such update, never compared; a vector is compared and uploaded only
 * when it changed. Hence the shapes:
 * - **Scene block: one `Float32Array`** written here by named offsets. Most of it (the cascade matrices, the near track lights, the
 *   car spots) changes every frame anyway, so comparing members would cost more than one upload of its few kilobytes per render; and
 *   one array is one `bufferSubData`, where members are one call each.
 * - **Pass block: one `Float32Array`** of four floats, written in place and so uploaded at every update (16 bytes). Not a vector:
 *   three keeps a member's last uploaded value on the group itself, shared by every renderer that draws it (the main view's and the
 *   car probe's), so a renderer could skip an upload the other had already made.
 * Blocks hold no integers or structs (three writes floats only): counts are floats, compared in GLSL as floats.
 */

/** What the surface shaders are compiled for: a package with more cascades or filter taps throws. */
export const MAX_SHADOW_CASCADES = 8;
export const MAX_SHADOW_TAPS = 16;
/** The lights a car's vertices sum: the nearest the camera (ours; the game's per-draw list holds 20). */
export const NEAR_TRACK_LIGHTS = 32;
/** The car spots drawn at once: the game's 20 per scene object. */
export const CAR_SPOTS = 20;

/** A member of a std140 block: a float, vector or matrix, or an array of vec4 or mat4 (`count`; a float or vec3 array is a vec4 array). */
export interface BlockMember {
  readonly name: string;
  readonly type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat3' | 'mat4';
  readonly count?: number;
}

/** A block's layout: each member's offset in floats, the block's size in floats (whole vec4s) and its GLSL declaration. */
export interface BlockLayout<Name extends string> {
  readonly name: string;
  readonly offsets: Readonly<Record<Name, number>>;
  readonly floats: number;
  readonly glsl: string;
}

/** std140 base alignment and size, in floats: a vec3 aligns as a vec4 (a float may follow in its last lane), a mat3 is three vec4 columns. */
const ALIGN = {float: 1, vec2: 2, vec3: 4, vec4: 4, mat3: 4, mat4: 4} as const;
const SIZE = {float: 1, vec2: 2, vec3: 3, vec4: 4, mat3: 12, mat4: 16} as const;

/**
 * The std140 layout of `members` in order. Arrays are of vec4 or mat4 only, whose stride is their size, so no member needs the rule
 * for rounding a smaller element up. Members are declared `highp`: a block's members must agree between the stages.
 */
export function blockLayout<const M extends readonly BlockMember[]>(name: string, members: M): BlockLayout<M[number]['name']> {
  const offsets: Record<string, number> = {}, lines: string[] = [];
  let at = 0;
  for (const {name: member, type, count} of members) {
    if (Object.hasOwn(offsets, member)) throw Error(`Block ${name} declares ${member} twice`);
    if (count !== undefined && (type !== 'vec4' && type !== 'mat4')) throw Error(`Block ${name}: ${member} is an array of ${type}; declare it as vec4`);
    if (count !== undefined && !(Number.isInteger(count) && count > 0)) throw Error(`Block ${name}: ${member} has ${count} elements`);
    at = Math.ceil(at / ALIGN[type]) * ALIGN[type];
    offsets[member] = at;
    at += SIZE[type] * (count ?? 1);
    lines.push(`  highp ${type} ${member}${count === undefined ? '' : `[ ${count} ]`};`);
  }
  return {name, offsets: offsets as Record<M[number]['name'], number>, floats: Math.ceil(at / 4) * 4,
    glsl: `layout(std140) uniform ${name} {\n${lines.join('\n')}\n};`};
}

/** Writes `matrix` at `at` of `block` as std140 lays out a mat3: three columns of a vec4 each. */
export function writeMatrix3(block: Float32Array, at: number, matrix: Matrix3): void {
  const e = matrix.elements;
  for (let column = 0; column < 3; column++) block.set([e[3 * column], e[3 * column + 1], e[3 * column + 2]], at + 4 * column);
}

/** The scene block's layout (names as the parts read them; each written by the module named). */
export const SCENE_BLOCK = blockLayout('LmuScene', [
  // The sun's shadow cascades (shadows/cascadeSampling.ts): per cascade its matrix, tile and card depth (x), and the filter taps
  // (offset xy, weight z).
  {name: 'surface_cascadeMatrices', type: 'mat4', count: MAX_SHADOW_CASCADES},
  {name: 'surface_cascadeTiles', type: 'vec4', count: MAX_SHADOW_CASCADES},
  {name: 'surface_cascadeCardDepth', type: 'vec4', count: MAX_SHADOW_CASCADES},
  {name: 'surface_cascadeTaps', type: 'vec4', count: MAX_SHADOW_TAPS},
  {name: 'surface_cascadeTexel', type: 'vec2'}, {name: 'surface_cascadeFilter', type: 'vec2'},
  {name: 'surface_cascadeFade', type: 'vec2'}, {name: 'surface_cascadeCount', type: 'float'}, {name: 'surface_cascadeTapCount', type: 'float'},
  {name: 'surface_cascadeNormalOffset', type: 'float'},
  // The track lights nearest the camera, the car spots and the cockpit light (night/).
  {name: 'trackLight_near', type: 'vec4', count: 2 * NEAR_TRACK_LIGHTS},
  {name: 'carSpot_spots', type: 'vec4', count: 4 * CAR_SPOTS},
  {name: 'carSpot_owners', type: 'vec4', count: 2 * CAR_SPOTS},
  {name: 'cockpitLight_frame', type: 'mat4'},
  {name: 'trackLight_scale', type: 'float'}, {name: 'trackLight_nearCount', type: 'float'},
  {name: 'carSpot_count', type: 'float'}, {name: 'cockpitLight_scale', type: 'float'},
  // The sun (or the moon) and the environment's turn and last level (shaders/sceneLight.ts); the day share (scene/dayLight.ts,
  // written by sceneEnvironment.ts).
  {name: 'lit_environmentRotation', type: 'mat3'},
  {name: 'lit_sunDirection', type: 'vec3'}, {name: 'lit_environmentMaxLod', type: 'float'},
  {name: 'lit_sunColour', type: 'vec3'}, {name: 'lit_dayLight', type: 'float'},
  // The haze (atmosphere/haze.ts).
  {name: 'haze_colour', type: 'vec3'}, {name: 'haze_density', type: 'float'},
  {name: 'HAZE_SUN_DIRECTION', type: 'vec3'}, {name: 'HAZE_SUNWARD', type: 'float'},
  {name: 'HAZE_SUN_RADIANCE', type: 'vec3'}, {name: 'HAZE_ORIGIN_Y', type: 'float'},
  {name: 'HAZE_HEIGHT_AMOUNT', type: 'float'}, {name: 'HAZE_HEIGHT_RATE', type: 'float'}, {name: 'HAZE_HEIGHT_EXPONENT', type: 'float'},
  // The reflected car's paint box (car/carPaint.ts), and a pixel in clip space (`setViewPixel`).
  {name: 'paint_boxLow', type: 'vec4'},
  {name: 'paint_boxHigh', type: 'vec3'}, {name: 'surface_time', type: 'float'},
  {name: 'paint_boxCentre', type: 'vec3'}, {name: 'view_pixel', type: 'float'},
  // The scenery: the cards' turn and shadow eye (billboardCard.ts) and crown sun (sceneEnvironment.ts), the clock (surfaceAnimation.ts), the
  // track's median rubber (realRoad.ts) and the reflection's scalars (sceneryReflection.ts).
  {name: 'surface_cardFacing', type: 'vec4'},
  {name: 'surface_crownSun', type: 'vec3'}, {name: 'surface_realRoadMedian', type: 'float'},
  {name: 'surface_shadowEye', type: 'vec3'}, {name: 'surface_reflectionLodScale', type: 'float'},
  {name: 'surface_dielectricF0', type: 'float'},
] as const);

export type SceneMember = keyof typeof SCENE_BLOCK.offsets;

/** The scene block's values, as its programs read them. */
export const sceneBlock = new Float32Array(SCENE_BLOCK.floats);

/** Writes a member of the scene block: a number, or the components of a vector (`toArray` order) at the member's offset. */
export function setScene(member: SceneMember, value: number | ArrayLike<number>): void {
  if (typeof value === 'number') sceneBlock[SCENE_BLOCK.offsets[member]] = value;
  else sceneBlock.set(value, SCENE_BLOCK.offsets[member]);
}

/**
 * Sets two over the drawing height in pixels, a pixel in clip space (`view_pixel`): the shell, each frame. A vertex program's metres
 * per pixel at a view-space point is `(perspective ? -z : 1) * view_pixel / projectionMatrix[1][1]` (lamps, the trace curtains' edges).
 */
export function setViewPixel(heightPx: number): void { setScene('view_pixel', heightPx > 0 ? 2 / heightPx : 0); }

/** A float member of the scene block, as written. */
export const sceneValue = (member: SceneMember): number => sceneBlock[SCENE_BLOCK.offsets[member]];

// Before anything writes them: the sun overhead (a direction normalizes), day, a haze height term of exponent 1, the environment
// unturned and the assumed rubber, which never changes while the state drawn is the assumed one.
setScene('lit_sunDirection', [0, 1, 0]); setScene('surface_crownSun', [0, 1, 0]); setScene('lit_dayLight', 1);
setScene('HAZE_HEIGHT_EXPONENT', 1); setScene('surface_realRoadMedian', ASSUMED_RUBBER / 255);
for (let column = 0; column < 3; column++) sceneBlock[SCENE_BLOCK.offsets.lit_environmentRotation + 5 * column] = 1;

/** The pass block's layout: four floats in member order. */
export const PASS_BLOCK = blockLayout('LmuScenePass', [
  /** Scales every cut-out's alpha test: 1 cuts at the material's threshold; 0, around the multisampled main pass, leaves it to coverage. */
  {name: 'surface_alphaCut', type: 'float'},
  /** The scene environment's share: 0 while the venue's first capture is taken (the scene's `environmentIntensity`). */
  {name: 'lit_environmentIntensity', type: 'float'},
  /** Whether the scene's own light (glow, screens, lamps, track lights, beams) draws: 0 while the venue is captured. */
  {name: 'surface_emission', type: 'float'},
  /** Whether the car spots light the pass: 0 in the car's reflection probe. */
  {name: 'carSpot_shown', type: 'float'},
] as const);

export type PassValues = Record<keyof typeof PASS_BLOCK.offsets, number>;
type PassMember = keyof PassValues;
const pass = new Float32Array(PASS_BLOCK.floats).fill(1);

/** Writes pass values: each lasts until written again, so a pass that changes one restores it after (`withPass`). */
export function setPass(values: Partial<PassValues>): void {
  for (const [member, value] of Object.entries(values) as [PassMember, number][]) pass[PASS_BLOCK.offsets[member]] = value;
}

/** The pass values as written. */
export function passValues(): PassValues {
  const {offsets} = PASS_BLOCK;
  return {surface_alphaCut: pass[offsets.surface_alphaCut], lit_environmentIntensity: pass[offsets.lit_environmentIntensity],
    surface_emission: pass[offsets.surface_emission], carSpot_shown: pass[offsets.carSpot_shown]};
}

/** Renders `draw` with `values`, then puts back the ones it set (only those: a value `draw` writes to another member stays). */
export function withPass(values: Partial<PassValues>, draw: () => void): void {
  const members = Object.keys(values) as PassMember[];
  const before = members.map(member => pass[PASS_BLOCK.offsets[member]]);
  setPass(values);
  try { draw(); } finally { members.forEach((member, i) => { pass[PASS_BLOCK.offsets[member]] = before[i]; }); }
}

/** Both blocks are rewritten for every render, so their buffers are dynamic. */
const group = (name: string, value: Float32Array) => {
  const uniformsGroup = new UniformsGroup();
  uniformsGroup.setName(name);
  uniformsGroup.setUsage(DynamicDrawUsage);
  uniformsGroup.add(new Uniform(value));
  return uniformsGroup;
};

/** The two blocks every composed program binds, in the order each template declares them. */
export const SCENE_BLOCK_GROUPS: readonly UniformsGroup[] = [group(SCENE_BLOCK.name, sceneBlock), group(PASS_BLOCK.name, pass)];

/** Both blocks' declarations, which every template places first in both of its stages. */
export const SCENE_BLOCKS_GLSL = `${SCENE_BLOCK.glsl}\n${PASS_BLOCK.glsl}\n`;
