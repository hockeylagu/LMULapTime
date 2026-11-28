import { expect, it } from 'vitest';
import { type BufferGeometry, Group, Mesh, OrthographicCamera, type ShaderMaterial, PerspectiveCamera, Vector3 } from 'three';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { composedParts } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import {
  CURTAIN_FILL_OPACITY, CURTAIN_HEIGHT_M, CURTAIN_ORDER, CURTAIN_RISE_ATTRIBUTE, curtainFade, curtainLift, CURTAIN_STEPS_M, curtainStep, curtainTopM,
  fadeTraceCurtain, makeTraceCurtain, metresPerPixel, refreshTraceCurtain, viewTraceCurtain,
} from '../../../../../src/components/replay/view3d/laps/traceCurtain.js';
import { setViewPixel } from '../../../../../src/components/replay/view3d/shaders/sceneBlock.js';
import { createCurtainLayer } from '../../../../../src/components/replay/view3d/laps/curtainLayer.js';

const display = {toneCurve: {a: 2.5, b: 0.6}, outputGamma: 1};
const lapOf = (count: number): ReplayTrajectoryData => ({
  replayName: 'test', pointsCount: count, bounds: {minX: 0, maxX: count, minZ: 0, maxZ: 1, spanX: count, spanZ: 1},
  points: Array.from({length: count}, (_, i) => ({x: i, y: 1, z: 0, timeSec: i / 10})),
});
const values = (edges: number[][]) => ({edges, edgeColours: edges.map(() => '#ff0000'), fillColours: edges[0].map(() => '#00ff00'), edgeOpacity: 1});

it('stands the fill from the road to the highest edge and breaks it where a sample has no value or no road', () => {
  const lap = lapOf(5), road = (point: {x: number}) => (point.x <= 3 ? 1 : null);
  const curtain = makeTraceCurtain(lap, new Vector3(0, 1, 0), values([[0, 0.5, NaN, 1, 1], [0.2, 0.25, 0.3, 0.1, 1]]), road, () => display, CURTAIN_ORDER.primary);
  const positions = curtain.geometry.getAttribute('position'), rises = curtain.geometry.getAttribute(CURTAIN_RISE_ATTRIBUTE);
  // Both fill vertices stand on the road; the top rises by the higher edge's share: half the full height.
  expect(positions.getY(3)).toBe(positions.getY(2));
  expect([rises.getY(2), rises.getY(3)]).toEqual([0, Math.fround(0.5 * CURTAIN_HEIGHT_M)]);
  // Fill: 0→1→2→3 joins (sample 2 stands to the edge with a value), 4 has no road: 3 quads. Edges: edge 0 joins 0→1 only (2 has no
  // value), edge 1 joins 0→1, 1→2 and 2→3: four segments of two bands each.
  expect(curtain.geometry.index?.count).toBe(3 * 6 + 4 * 12);
  const colours = curtain.geometry.getAttribute('color');
  expect(colours.itemSize).toBe(4);
  expect([colours.getW(0), colours.getW(1)]).toEqual([0, CURTAIN_FILL_OPACITY].map(Math.fround));
  expect(colours.getW(5 * 2)).toBe(1); // The first edge vertex at the edges' opacity.
  expect(curtainTopM(curtain, 1)).toBeCloseTo(0.5 * CURTAIN_HEIGHT_M);
  expect(curtainTopM(curtain, 2)).toBeCloseTo(0.3 * CURTAIN_HEIGHT_M); // The edge with a value still stands.
  expect(curtain.renderOrder).toBe(CURTAIN_ORDER.primary);
  expect(composedParts(curtain.material)?.map(part => part.name)).toEqual(['exposureDivide', 'curtain']); // No haze: data reads from afar.
  expect(curtain.material.depthWrite).toBe(false);
});

it('fades in front of the driver cameras, closer for chase, and not at all from the free cameras', () => {
  const curtain = makeTraceCurtain(lapOf(2), new Vector3(), values([[0.5, 0.5]]), () => 0, () => display, CURTAIN_ORDER.baseline);
  fadeTraceCurtain(curtain, 'cockpit');
  expect((curtain.material.uniforms.CURTAIN_FADE as {value: number[]}).value).toEqual([8, 12]);
  expect(curtainFade('chase')).toEqual([6, 10]);
  for (const mode of ['orbit', 'top', 'follow'] as const) expect(curtainFade(mode)[1]).toBeLessThan(0);
});

it('re-drapes on scenery streamed in later', () => {
  let resident = false;
  const road = () => (resident ? 2 : null);
  const curtain = makeTraceCurtain(lapOf(3), new Vector3(), values([[0.5, 0.5, 0.5]]), road, () => display, CURTAIN_ORDER.primary);
  expect(curtain.geometry.index?.count).toBe(0);
  resident = true;
  refreshTraceCurtain(curtain, road);
  expect(curtain.geometry.index?.count).toBe(2 * 6 + 2 * 12);
  expect(curtain.geometry.getAttribute('position').getY(0)).toBeCloseTo(2.02);
});

it('stands the cursor line where the car is between samples, as tall as the curtain there, and follows the line fades', () => {
  const root = new Group(), lap = lapOf(4), baseline = lapOf(4);
  const layer = createCurtainLayer(root, new Vector3(), () => 0, () => display, lap, baseline);
  layer.show({primary: {...values([[0.25, 0.5, 1, 1]]), fillColours: ['#00ff00', '#00ff00', '#ff0000', '#ff0000']}, baseline: values([[0.1, 0.1, 0.1, 0.1]])});
  expect(layer.shown).toBe(true);
  layer.cursor({index: 1, fraction: 0}, null);
  const cursor = root.getObjectByName('trace-curtains')!.children.find(child => child.name === 'curtain-cursor')!;
  expect(cursor.visible).toBe(true);
  expect(cursor.position.x).toBe(1); expect(cursor.scale.y).toBeCloseTo(0.5 * CURTAIN_HEIGHT_M);
  // Its width in pixels: 0.2 m a pixel 100 m from a 90° view 1000 px tall.
  setViewPixel(1000);
  const eye = new PerspectiveCamera(90, 1, 0.1, 1000); eye.position.set(1, 0, 100); eye.updateMatrixWorld();
  layer.camera('chase', eye, () => 100); layer.cursor({index: 1, fraction: 0}, null);
  expect(cursor.scale.x).toBeCloseTo(0.2); expect(cursor.scale.z).toBeCloseTo(0.2);
  // Halfway to the next sample, as the car is: halfway there, halfway between the two heights.
  layer.cursor({index: 1, fraction: 0.5}, null);
  expect(cursor.position.x).toBeCloseTo(1.5); expect(cursor.scale.y).toBeCloseTo(0.75 * CURTAIN_HEIGHT_M);
  // In the trace's colour at the nearer sample: the fill's (the pressed pedal's), red from sample 2, green before.
  const redness = () => (cursor as Mesh).geometry.getAttribute('color').getX(0), nearRed = redness();
  layer.cursor({index: 1, fraction: 0.2}, null);
  expect(nearRed).toBeGreaterThan(redness());
  // The hover line: on the hovered sample, as tall as the curtain there, half see-through; gone when the pointer leaves.
  const hover = root.getObjectByName('curtain-hover') as Mesh<BufferGeometry, ShaderMaterial>;
  expect(hover.visible).toBe(false);
  layer.hover({lap: 'primary', index: 2});
  expect(hover.visible).toBe(true); expect(hover.position.x).toBe(2); expect(hover.scale.y).toBeCloseTo(CURTAIN_HEIGHT_M);
  expect(hover.material.opacity).toBe(0.5);
  // Its bar lies across the lap (along x here): its local x turned onto z, so overhead it shows.
  expect(new Vector3(1, 0, 0).applyEuler(hover.rotation).x).toBeCloseTo(0);
  layer.hover(null); expect(hover.visible).toBe(false);
  layer.fade(1, 0);
  expect(layer.pickable().baseline?.visible).toBe(false);
  layer.show(null);
  expect(layer.shown).toBe(false); expect(root.children).toHaveLength(0);
  layer.dispose();
  expect(root.children).toHaveLength(0);
});

it('steps its height from a far free camera, with slack going down, and keeps its own beside the car', () => {
  const camera = new PerspectiveCamera(50), wantedAt = (d: number) => 0.08 * 2 * d * Math.tan(Math.PI * 25 / 180);
  // Beside the car: its own height, without walking the lap for the distance.
  const unread = () => { throw Error('read the lap distance'); };
  for (const mode of ['chase', 'cockpit', 'trackside'] as const) expect(curtainStep(mode, camera, unread, 3)).toBe(0);
  // Orbit: the step nearest 8 % of the height seen where it looks at the lap; 500 m off wants ~37 m: 30 m (100 from 55 m).
  expect(CURTAIN_STEPS_M[curtainStep('orbit', camera, () => 500, 0)]).toBe(30);
  expect(wantedAt(500)).toBeCloseTo(37.3, 1);
  // Coming back to ~15 m wanted stays at 30 (slack); only under 13 m does it step down.
  expect(curtainStep('orbit', camera, () => 200, 2)).toBe(2);
  expect(CURTAIN_STEPS_M[curtainStep('orbit', camera, () => 150, 2)]).toBe(10);
  expect(curtainStep('orbit', camera, () => 20, 3)).toBe(0); // Close by: its own height.
  // Overhead: from the frame, 600 m tall wants 48 m.
  expect(CURTAIN_STEPS_M[curtainStep('top', new OrthographicCamera(-300, 300, 300, -300), () => 0, 0)]).toBe(30);
  // A step stands the whole curtain, near parts and far parts alike.
  const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 3, bounds: {minX: 0, maxX: 2000, minZ: 0, maxZ: 0, spanX: 2000, spanZ: 0},
    points: [0, 1000, 2000].map((x, i) => ({x, y: 0, z: 0, timeSec: i}))};
  const curtain = makeTraceCurtain(lap, new Vector3(), values([[1, 1, 1]]), () => 0, () => display, CURTAIN_ORDER.primary);
  expect(curtainTopM(curtain, 0)).toBeCloseTo(CURTAIN_HEIGHT_M); // Before any camera: its own height.
  viewTraceCurtain(curtain, 10);
  expect(curtainTopM(curtain, 0)).toBeCloseTo(30); expect(curtainTopM(curtain, 2)).toBeCloseTo(30); expect(curtainLift(curtain).scale).toBe(10);
  expect(composedParts(curtain.material)?.map(part => part.name)).toEqual(['exposureDivide', 'curtain']); // No haze: data reads from afar.
});

it('measures the metres a pixel covers at the depth seen: the width of the curtain edges and the cursor lines', () => {
  setViewPixel(1000);
  const camera = new PerspectiveCamera(90, 1, 0.1, 1000); camera.updateMatrixWorld();
  // A 90° view 1000 px tall sees 2 m at 1 m: 2 mm a pixel, 0.2 m at 100 m.
  expect(metresPerPixel(camera, new Vector3(0, 0, -100))).toBeCloseTo(0.2);
  const top = new OrthographicCamera(-500, 500, 500, -500); top.zoom = 2; top.updateProjectionMatrix(); top.updateMatrixWorld();
  expect(metresPerPixel(top, new Vector3(0, -800, 0))).toBeCloseTo(0.5); // 500 m on 1000 px, anywhere.
});

