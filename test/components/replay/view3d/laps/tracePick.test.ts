import { expect, it } from 'vitest';
import { Group, Ray, Vector3 } from 'three';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { curtainFillIndexCount, CURTAIN_HEIGHT_M, CURTAIN_ORDER, makeTraceCurtain } from '../../../../../src/components/replay/view3d/laps/traceCurtain.js';
import { makeRacingLine } from '../../../../../src/components/replay/view3d/laps/racingLine.js';
import { clearSpan, HIT_CLEARANCE_M, pickStrip, pickStripFoot } from '../../../../../src/components/replay/view3d/laps/tracePick.js';
import { traceReadout } from '../../../../../src/components/replay/view3d/laps/traceReadout.js';

const display = {toneCurve: {a: 2.5, b: 0.6}, outputGamma: 1};
// A straight 300 m lap along x, a sample every 10 m: the pick crosses several 50 m cells.
const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 31, bounds: {minX: 0, maxX: 300, minZ: 0, maxZ: 0, spanX: 300, spanZ: 0},
  points: Array.from({length: 31}, (_, i) => ({x: i * 10, y: 0, z: 5, timeSec: i}))};

it('picks the sample whose foot is nearest a ray from straight above, where the sheet stands edge-on', () => {
  const world = new Group(); world.scale.z = -1;
  const curtain = makeTraceCurtain(lap, new Vector3(), {edges: [lap.points.map(() => 1)], edgeColours: ['#ff0000'], fillColours: [], edgeOpacity: 1},
    () => 0, () => display, CURTAIN_ORDER.primary);
  world.add(curtain);
  const down = (x: number, z: number) => new Ray(new Vector3(x, 500, z), new Vector3(0, -1, 0));
  // Native z 5 sits at scene z -5; straight down at x 123, a metre off the line: never on the sheet, but by its foot.
  expect(pickStrip(curtain, curtainFillIndexCount(curtain), down(123, -4))).toBeNull();
  const hit = pickStripFoot(curtain, curtainFillIndexCount(curtain), down(123, -4), {fixedM: 5, perMetreM: 0})!;
  expect(hit.index).toBe(12); expect(hit.point.y).toBeCloseTo(0, 1); expect(hit.distance).toBeCloseTo(500, 0);
  expect(pickStripFoot(curtain, curtainFillIndexCount(curtain), down(123, 10), {fixedM: 5, perMetreM: 0})).toBeNull(); // 15 m off: out of reach.
  // A perspective reach widens with the distance: 15 m off from 500 m up is within 0.04 m a metre (20 m there).
  expect(pickStripFoot(curtain, curtainFillIndexCount(curtain), down(123, 10), {fixedM: 0, perMetreM: 0.04})?.index).toBe(12);
  // Faded out near a driver camera: a foot nearer the eye than that does not pick.
  expect(pickStripFoot(curtain, curtainFillIndexCount(curtain), down(123, -4), {fixedM: 5, perMetreM: 0, fromM: 600})).toBeNull();
});

it('picks the curtain sample under the ray through the mirrored world, the nearest hit first', () => {
  const world = new Group(); world.scale.z = -1;
  const curtain = makeTraceCurtain(lap, new Vector3(), {edges: [lap.points.map(() => 1)], edgeColours: ['#ff0000'], fillColours: [], edgeOpacity: 1},
    () => 0, () => display, CURTAIN_ORDER.primary);
  world.add(curtain);
  // Native z 5 sits at scene z -5: a ray from scene z +20 looking down -z crosses the sheet near x 123, 1 m up.
  const ray = new Ray(new Vector3(123, 1, 20), new Vector3(0, 0, -1));
  const hit = pickStrip(curtain, curtainFillIndexCount(curtain), ray)!;
  expect(hit.index).toBe(12); expect(hit.point.z).toBeCloseTo(-5); expect(hit.distance).toBeCloseTo(25);
  // Above the sheet, or off the lap's end: nothing.
  expect(pickStrip(curtain, curtainFillIndexCount(curtain), new Ray(new Vector3(123, CURTAIN_HEIGHT_M + 1, 20), new Vector3(0, 0, -1)))).toBeNull();
  expect(pickStrip(curtain, curtainFillIndexCount(curtain), new Ray(new Vector3(400, 1, 20), new Vector3(0, 0, -1)))).toBeNull();
  // Zoomed out, the sheet stands taller (its scale): the ray above the 3 m sheet hits the 6 m one.
  expect(pickStrip(curtain, curtainFillIndexCount(curtain), new Ray(new Vector3(123, CURTAIN_HEIGHT_M + 1, 20), new Vector3(0, 0, -1)), {scale: 2, shownFromM: 0})?.index).toBe(12);
  // Faded out within 30 m of a chase or driver camera: the sheet 25 m away is not under the pointer.
  expect(pickStrip(curtain, curtainFillIndexCount(curtain), ray, {scale: 1, shownFromM: 30})).toBeNull();
  const [from, to] = clearSpan(ray, hit.point);
  expect(from).toEqual(ray.origin); expect(to.distanceTo(hit.point)).toBeCloseTo(HIT_CLEARANCE_M);
});

it('picks the flat racing ribbon from above', () => {
  const ribbon = makeRacingLine(lap, new Vector3(), lap.points.map(() => '#ffffff'), () => 0, () => display);
  const hit = pickStrip(ribbon, ribbon.geometry.index!.count, new Ray(new Vector3(201, 50, 5), new Vector3(0, -1, 0)));
  expect(hit?.index).toBe(20);
});

it('reads the trace value in the chart unit, keeping the sign of a centred channel', () => {
  expect(traceReadout('throttle', {from: 'bottom', min: 0, max: 100}, {throttle: 72})).toBe('72 %');
  expect(traceReadout('pedals', {from: 'bottom', min: 0, max: 100}, {throttle: 72, brake: 0})).toBe('THR 72 % · BRK 0 %');
  expect(traceReadout('under-over-steer', {from: 'centre', limit: 8}, {understeerDeg: -2.34})).toBe('-2.3 ° oversteer');
  expect(traceReadout('accel-lat', {from: 'centre', limit: 3}, {accelLatG: 1.234})).toBe('+1.23 G');
  expect(traceReadout('tire-temps', {from: 'bottom', min: 40, max: 120}, {tireTemps: [80, 81, 90, 91]})).toBe('FL 80 · FR 81 · RL 90 · RR 91 °C');
  expect(traceReadout('delta', {from: 'centre', limit: 1}, {}, 0.25)).toBe('+0.25 s');
  expect(traceReadout('steer-force', {from: 'centre', limit: 100}, {})).toBeNull();
});
