import { afterEach, expect, it, vi } from 'vitest';
import type { ReplayDaylightClock } from '../../../../../shared/types/replay.js';
import { DAYLIGHT_MINUTE, onSceneTimeOfDay, sceneTimeOfDay, setSceneTimeOfDay, shownDaylight } from '../../../../../src/components/replay/view3d/scene/timeOfDay.js';

afterEach(() => setSceneTimeOfDay('session'));

const clock = {session: 'race', startMinute: 20 * 60, sessionTimeSec: 3600, cloudCover: 0.4, scene: 'night'} as unknown as ReplayDaylightClock;

it('lights by the session clock, or at midday keeping the weather', () => {
  expect(sceneTimeOfDay()).toBe('session');
  expect(shownDaylight(clock)).toBe(clock);
  setSceneTimeOfDay('daylight');
  expect(shownDaylight(clock)).toEqual({...clock, startMinute: DAYLIGHT_MINUTE, sessionTimeSec: 0});
  // Without a session clock the scene keeps the session default.
  expect(shownDaylight(undefined)).toBeUndefined();
});

it('tells the scenes when the choice changes', () => {
  const listener = vi.fn(), stop = onSceneTimeOfDay(listener);
  setSceneTimeOfDay('daylight'); setSceneTimeOfDay('daylight');
  expect(listener).toHaveBeenCalledTimes(1);
  stop(); setSceneTimeOfDay('session');
  expect(listener).toHaveBeenCalledTimes(1);
});
