import { expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createTracksideCameras } from '../../../../../src/components/replay/view3d/camera/tracksideCameras.js';
import { createTracksideSight, type TracksideState } from '../../../../../src/components/replay/view3d/camera/tracksideSight.js';

// Driving native -Z (forward) for 1 km: the car's left is native +X, which the scene keeps as +X.
const points = Array.from({length: 101}, (_, i) => ({x: 0, y: 0, z: -i * 10}));
const spots = createTracksideCameras(points, points.map((_, i) => i * 10), new Vector3());

it('places fixed spots ahead of the stretch each one covers, raised on one side, the other side only after it', () => {
  const first = spots.candidates(spots.indexAt(0))[0];
  expect(first.x).toBeCloseTo(30); expect(first.y).toBeCloseTo(9);
  expect(first.z).toBeCloseTo(200); // Scene Z mirrors native Z: 200 m down the road.
  expect(spots.indexAt(310)).toBe(0); // One spot watches the whole stretch...
  expect(spots.candidates(spots.indexAt(330))[0].z).toBeCloseTo(520); // ...then the next one takes over.
  // The same side higher, further and closer first; then the other side.
  const places = spots.candidates(0);
  expect(places.slice(0, 4).every(place => place.x > 0)).toBe(true);
  expect(places[1].y).toBeGreaterThan(first.y);
  expect(places[4].x).toBeCloseTo(-30);
  // The stretch to see: the car's height along the 320 m it covers.
  expect(spots.stretch(0).map(point => Math.round(point.z))).toEqual([10, 50, 100, 150, 200, 240, 290, 320]);
  expect(spots.stretch(0)[0].y).toBeCloseTo(0.8);
  expect(createTracksideCameras([], [], new Vector3()).indexAt(0)).toBe(-1);
});

it('stands on the outside of the lap: the right of travel round a loop turning left', () => {
  // Counter-clockwise in native x, z: the left of travel is the loop's inside.
  const loop = Array.from({length: 200}, (_, i) => ({x: 500 * Math.cos(i / 200 * 2 * Math.PI), y: 0, z: 500 * Math.sin(i / 200 * 2 * Math.PI)}));
  const around = createTracksideCameras(loop, loop.map((_, i) => i * 500 * 2 * Math.PI / 200), new Vector3());
  const eye = around.candidates(0)[0], at = loop[Math.round(200 / (500 * 2 * Math.PI / 200))];
  expect(Math.hypot(eye.x, eye.z)).toBeGreaterThan(Math.hypot(at.x, at.z) + 20);
});

/** A rig's trackside state over `spots`, recording the places chosen. */
function stateAt(spot: number) {
  const places: number[] = [];
  const choose = vi.fn((at: number, place: number) => { places[at] = place; });
  const state: TracksideState & {spot: number; choose: typeof choose} = {spots, spot, placeOf: at => places[at] ?? 0, choose};
  return state;
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

it('picks the first place that sees the car all along the stretch, the shown spot and the next', async () => {
  // The left places are blocked by a wood: any sight line from x > 0 is hidden.
  const query = vi.fn(async (view: PerspectiveCamera) => (view.position.x > 0 ? 0 : -1));
  const sight = createTracksideSight(query), state = stateAt(0), camera = new PerspectiveCamera();
  const frame = async () => { sight.update(state, camera, new Vector3(), 0); for (let i = 0; i < 5; i++) await flush(); };
  for (let i = 0; i < 4; i++) await frame();
  expect(state.choose).not.toHaveBeenCalled(); // A place per frame: the four on the left are hidden...
  await frame(); expect(state.choose).toHaveBeenLastCalledWith(0, 4); // ...the first on the right is clear.
  for (let i = 0; i < 5; i++) await frame();
  expect(state.choose).toHaveBeenLastCalledWith(1, 4);
});

it('cuts to another place when the shown view hides the car twice in a row, never back to a hidden one', async () => {
  const query = vi.fn(async () => -1);
  const sight = createTracksideSight(query), state = stateAt(0), camera = new PerspectiveCamera();
  const run = async (now: number) => { sight.update(state, camera, new Vector3(0, 0.8, 30), now); for (let i = 0; i < 20; i++) await flush(); };
  camera.position.set(18, 6, 70);
  await run(0); await run(0); // Both spots assessed: clear, the first place.
  expect(state.choose).toHaveBeenLastCalledWith(1, 0);
  query.mockImplementation(async () => 0); // Now a lorry parks in the way.
  await run(1000); expect(state.choose).toHaveBeenCalledTimes(2);
  await run(1100); expect(state.choose).toHaveBeenCalledTimes(2); // Too soon after the last check.
  await run(1200); expect(state.choose).toHaveBeenLastCalledWith(0, 1);
  state.choose.mockClear();
  await run(1400); await run(1600);
  expect(state.choose).toHaveBeenLastCalledWith(0, 2); // Not back to place 0, and on the same side.
});
