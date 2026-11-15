import { describe, expect, it, vi } from 'vitest';
import { createSceneSurface, SURFACE_STEP_S, type SurfaceStateFetch } from '../../../../../src/components/replay/view3d/scene/sceneSurface.js';
import type { RealRoadSurface } from '../../../../../src/components/replay/view3d/scenery/realRoad.js';

/** A surface that records what it draws, and fetches the test resolves by hand. */
function harness() {
  const drawn: Array<number | null> = [], dispose = vi.fn();
  const surface: RealRoadSurface = { elements: 1, setState: state => { drawn.push(state ? state[0] : null); }, dispose };
  const asked: Array<{sessionId: string; timeSec: number; resolve: (state: Uint8Array) => void; reject: (error: Error) => void}> = [];
  const fetchState: SurfaceStateFetch = (sessionId, _elements, timeSec) => new Promise((resolve, reject) => { asked.push({sessionId, timeSec, resolve, reject}); });
  const redraw = vi.fn();
  return {drawn, asked, redraw, dispose, scene: createSceneSurface(surface, fetchState, redraw)};
}
const flush = () => new Promise(resolve => { setTimeout(resolve, 0); });

describe('scene surface', () => {
  it('fetches the state of the time asked and draws it, again only once the time moved a step', async () => {
    const {drawn, asked, redraw, scene} = harness();
    scene.follow('s1', 100);
    asked[0].resolve(Uint8Array.of(7, 0, 0, 0));
    await scene.settled();
    expect(drawn).toEqual([7]); expect(redraw).toHaveBeenCalledTimes(1);
    scene.follow('s1', 100 + SURFACE_STEP_S - 0.1);
    expect(asked).toHaveLength(1);
    scene.follow('s1', 100 + SURFACE_STEP_S);
    expect(asked.map(request => request.timeSec)).toEqual([100, 100 + SURFACE_STEP_S]);
  });
  it('keeps one fetch at a time and fetches the newest time asked meanwhile', async () => {
    const {drawn, asked, scene} = harness();
    scene.follow('s1', 10); scene.follow('s1', 20); scene.follow('s1', 30);
    expect(asked).toHaveLength(1);
    const settled = scene.settled();
    asked[0].resolve(Uint8Array.of(1, 0, 0, 0)); await flush();
    expect(asked.map(request => request.timeSec)).toEqual([10, 30]);
    asked[1].resolve(Uint8Array.of(3, 0, 0, 0)); await settled;
    expect(drawn).toEqual([1, 3]);
  });
  it('draws the assumed state for a session whose state fails, and does not ask it again', async () => {
    const {drawn, asked, scene} = harness();
    scene.follow('gone', 5);
    asked[0].reject(new Error('Session replay is unavailable')); await scene.settled();
    expect(drawn).toEqual([null]);
    scene.follow('gone', 500);
    expect(asked).toHaveLength(1);
    scene.follow('s2', 5);
    expect(asked.map(request => request.sessionId)).toEqual(['gone', 's2']);
  });
  it('stops fetching and frees the surface on dispose', async () => {
    const {drawn, asked, dispose, scene} = harness();
    scene.follow('s1', 1);
    const settled = scene.settled();
    scene.dispose(); await settled;
    asked[0].resolve(Uint8Array.of(9, 0, 0, 0)); await flush();
    expect(drawn).toEqual([]); expect(dispose).toHaveBeenCalled();
    scene.follow('s1', 100);
    expect(asked).toHaveLength(1);
  });
});
