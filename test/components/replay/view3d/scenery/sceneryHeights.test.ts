// @vitest-environment happy-dom
import { Group } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createSceneryHeights } from '../../../../../src/components/replay/view3d/scenery/sceneryHeights.js';

const build = vi.hoisted(() => ({step: vi.fn<(deadline: number) => boolean>()}));
vi.mock('../../../../../src/components/replay/view3d/surfaceProjection.js', () => ({buildSurfaceHeight: () => ({step: build.step, lookup: () => null})}));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('indexes streaming surfaces once per animation frame within the playback budget', () => {
  const callbacks: FrameRequestCallback[] = [];
  const animation = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.push(callback); return callbacks.length; });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockReturnValue(100);
  build.step.mockReset().mockReturnValue(false);
  const heights = createSceneryHeights();
  heights.add('sector', new Group(), {min: [0, 0, 0], max: [10, 10, 10]});
  expect(animation).toHaveBeenCalledOnce();
  expect(build.step).not.toHaveBeenCalled();
  callbacks.shift()?.(100);
  expect(build.step).toHaveBeenCalledExactlyOnceWith(101);
  expect(animation).toHaveBeenCalledTimes(2);
  heights.dispose();
  expect(cancel).toHaveBeenCalledWith(1);
});

it('uses a larger loading budget while a caller awaits the initial index', async () => {
  vi.useFakeTimers();
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockReturnValue(100);
  build.step.mockReset().mockReturnValue(false);
  const heights = createSceneryHeights();
  heights.add('initial', new Group(), {min: [0, 0, 0], max: [10, 10, 10]});
  const ready = heights.whenReady();
  await vi.advanceTimersToNextTimerAsync();
  expect(build.step).toHaveBeenCalledExactlyOnceWith(112);
  build.step.mockReturnValue(true);
  await vi.runAllTimersAsync();
  await ready;
  heights.dispose();
});