import { BufferAttribute, Mesh, type Material, type Object3D } from 'three';
import type { ShaderPart } from '../shaders/composer.js';
import { setScene } from '../shaders/sceneBlock.js';
import { glslNumber } from './materials/shaderContext.js';
import type { SurfaceConfig } from './materials/surfaceConfig.js';

/**
 * Lamps far away keep a size on screen. A trackside bulb is a few centimetres of bright glow: a kilometre off it covers a tenth of a
 * pixel, so the raster caught it on some frames and missed it on others, and it blinked at full strength as the camera moved. A
 * lamp smaller than LAMP_MIN_PX in radius on screen is drawn grown about its centre to that radius and dimmed by the square of the
 * growth, so it gives the same light as a steady dot. Each glowing part's vertices carry the centre and radius of their lamp
 * (`prepareLampSizes`, before the chunk is batched); the vertex program grows it (`LAMP_VERTEX_*`) and the emission takes the
 * share (`vSurfaceLampShare`). By day the lamps keep their size: a grown dim dot over a sunlit background would draw dark.
 */
export const LAMP_MIN_PX = 1.5;
export const LAMP_ATTRIBUTE = '_lmu_lamp';
/** Sets two over the drawing height in pixels, a pixel in clip space (the scene block's `surface_lampPixel`): the shell, each frame. */
export function trackLampPixel(heightPx: number): void { setScene('surface_lampPixel', heightPx > 0 ? 2 / heightPx : 0); }

/** The glowing kinds, whose emission is the whole of what they draw. */
export const isLampKind = (kind: SurfaceConfig['kind']): boolean => kind === 'lowLumEmissive' || kind === 'highLumTrackside' || kind === 'highLumSun';

/** Lamp points this close (metres) are one point: a bulb's faces split their vertices by normal. */
const WELD_M = 0.001;

/**
 * Each vertex's lamp: the centre (xyz) and negated radius (w) of the connected part it belongs to, its faces joined where they share a vertex
 * or a point. `index` is null for a plain triangle list.
 */
export function lampCentres(positions: ArrayLike<number>, index: ArrayLike<number> | null): Float32Array {
  const count = positions.length / 3, parent = Int32Array.from({length: count}, (_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const points = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(positions[3 * i] / WELD_M)},${Math.round(positions[3 * i + 1] / WELD_M)},${Math.round(positions[3 * i + 2] / WELD_M)}`;
    const first = points.get(key);
    if (first === undefined) points.set(key, i); else join(first, i);
  }
  const corners = index ? index.length : count;
  for (let t = 0; t + 2 < corners; t += 3) {
    const a = index ? index[t] : t, b = index ? index[t + 1] : t + 1, c = index ? index[t + 2] : t + 2;
    join(a, b); join(a, c);
  }
  const sums = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < count; i++) {
    const root = find(i), sum = sums.get(root) ?? [0, 0, 0, 0];
    sum[0] += positions[3 * i]; sum[1] += positions[3 * i + 1]; sum[2] += positions[3 * i + 2]; sum[3]++;
    sums.set(root, sum);
  }
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const sum = sums.get(find(i))!;
    out.set([sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]], 4 * i);
  }
  for (let i = 0; i < count; i++) {
    const at = 4 * find(i);
    const d = Math.hypot(positions[3 * i] - out[4 * i], positions[3 * i + 1] - out[4 * i + 1], positions[3 * i + 2] - out[4 * i + 2]);
    out[at + 3] = Math.max(out[at + 3], d);
  }
  // Stored negated: a part without the attribute reads WebGL's default w of 1 and is never grown.
  for (let i = 0; i < count; i++) if (find(i) !== i) out[4 * i + 3] = out[4 * find(i) + 3];
  for (let i = 0; i < count; i++) out[4 * i + 3] = -out[4 * i + 3];
  return out;
}

const surfaceKind = (material: Material): SurfaceConfig['kind'] | undefined => (material.userData.lmuSurface as {kind?: SurfaceConfig['kind']} | undefined)?.kind;

/** Gives each glowing mesh under `root` its lamps (`LAMP_ATTRIBUTE`). Before the chunk is batched. */
export function prepareLampSizes(root: Object3D): void {
  root.traverse(child => {
    if (!(child instanceof Mesh)) return;
    const mesh = child as Mesh, material = mesh.material, geometry = mesh.geometry;
    if (Array.isArray(material) || !isLampKind(surfaceKind(material) ?? 'standard') || geometry.getAttribute(LAMP_ATTRIBUTE)) return;
    const position = geometry.getAttribute('position');
    if (!(position instanceof BufferAttribute)) return;
    geometry.setAttribute(LAMP_ATTRIBUTE, new BufferAttribute(lampCentres(position.array, geometry.index?.array ?? null), 4));
  });
}

/** The vertex program's declarations for a glowing kind. */
const LAMP_VERTEX_DECLARATIONS = `
    attribute vec4 ${LAMP_ATTRIBUTE};
    varying float vSurfaceLampShare;`;

/** After `project_vertex`: grows a lamp under LAMP_MIN_PX to that radius on screen, at night, and passes the share of its light. */
const LAMP_VERTEX_MAIN = `
    {
      vec4 lampCentre = vec4(${LAMP_ATTRIBUTE}.xyz, 1.0);
      #ifdef USE_BATCHING
        lampCentre = batchingMatrix * lampCentre;
      #endif
      lampCentre = modelViewMatrix * lampCentre;
      float metresPerPixel = (isPerspectiveMatrix(projectionMatrix) ? -lampCentre.z : 1.0) * surface_lampPixel / projectionMatrix[1][1];
      float radius = -${LAMP_ATTRIBUTE}.w;
      float growth = radius > 0.0 ? max(1.0, ${glslNumber(LAMP_MIN_PX)} * metresPerPixel / radius) : 1.0;
      growth = mix(growth, 1.0, clamp(lit_dayLight, 0.0, 1.0));
      mvPosition.xyz = lampCentre.xyz + (mvPosition.xyz - lampCentre.xyz) * growth;
      gl_Position = projectionMatrix * mvPosition;
      vSurfaceLampShare = 1.0 / (growth * growth);
    }`;

/**
 * A glowing kind's size on screen in a lit composed program: it moves the drawn position (grown about the lamp's centre, by night)
 * and passes its light's share to the emission (`vSurfaceLampShare`, declared by the surface for its fragment stage). The pixel and
 * the day share are the scene block's.
 */
export const lampSizePart: ShaderPart = {
  name: 'lampSize',
  slots: {vertexPars: {at: 40, glsl: LAMP_VERTEX_DECLARATIONS}, vertexView: {at: 0, glsl: LAMP_VERTEX_MAIN}},
};
