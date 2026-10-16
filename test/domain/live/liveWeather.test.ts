import { describe, expect, it } from 'vitest';
import { LiveWeatherTracker } from '../../../shared/domain/live/liveWeather.js';
import { scoringReading } from '../../helpers/liveReadings.js';

const at = (currentEt: number, trackTempC: number, extra = {}) => scoringReading({ currentEt, trackTempC, ...extra });

describe('LiveWeatherTracker', () => {
  it('reports whole degrees, rain and wetness; null without a session', () => {
    const tracker = new LiveWeatherTracker();
    expect(tracker.update(at(0, 31.6, { raining: 0.42, avgPathWetness: 0.31 }))).toEqual({
      trackTempC: 32, trackTempTrend: 'steady', raining: 0.4, avgPathWetness: 0.3,
    });
    expect(tracker.update(null)).toBeNull();
    expect(tracker.update(scoringReading({ numVehicles: 0 }))).toBeNull();
  });

  it('compares with about five minutes earlier: rising, falling or steady within half a degree', () => {
    const rise = new LiveWeatherTracker();
    for (let et = 0; et <= 400; et += 5) rise.update(at(et, 30 + et / 400));
    // 401 s in: the reference is the sample at 100 s (30.25), so 0.75 up.
    expect(rise.update(at(400, 31))?.trackTempTrend).toBe('rising');

    const fall = new LiveWeatherTracker();
    for (let et = 0; et <= 400; et += 5) fall.update(at(et, 35 - et / 400));
    expect(fall.update(at(400, 34))?.trackTempTrend).toBe('falling');

    const steady = new LiveWeatherTracker();
    for (let et = 0; et <= 400; et += 5) steady.update(at(et, 35 + (et % 20 === 0 ? 0.3 : -0.3)));
    expect(steady.update(at(400, 35.3))?.trackTempTrend).toBe('steady');
  });

  it('is steady until a minute of history exists, and starts over when the clock goes back', () => {
    const tracker = new LiveWeatherTracker();
    tracker.update(at(0, 30));
    expect(tracker.update(at(30, 33))?.trackTempTrend).toBe('steady');
    expect(tracker.update(at(70, 33))?.trackTempTrend).toBe('rising');
    expect(tracker.update(at(5, 33))?.trackTempTrend).toBe('steady');
  });

  it('does not flicker at a threshold: the whole degree and the trend hold until a clear change', () => {
    const tracker = new LiveWeatherTracker();
    tracker.update(at(0, 30.4));
    const shown = [30.6, 30.4, 30.55, 30.45].map(temp => tracker.update(at(1, temp))?.trackTempC);
    expect(shown).toEqual([30, 30, 30, 30]);
    expect(tracker.update(at(2, 31.2))?.trackTempC).toBe(31);

    const trend = new LiveWeatherTracker();
    trend.update(at(0, 30));
    const states = [30.55, 30.45, 30.3, 30.2].map((temp, i) => trend.update(at(70 + i, temp))?.trackTempTrend);
    expect(states).toEqual(['rising', 'rising', 'rising', 'steady']);
  });

  it('moves rain and wetness in 0.05 steps, so slow drifts are not new weather', () => {
    const tracker = new LiveWeatherTracker();
    const a = tracker.update(at(0, 30, { raining: 0.101, avgPathWetness: 0.2 }));
    const b = tracker.update(at(1, 30, { raining: 0.112, avgPathWetness: 0.21 }));
    expect(b).toEqual(a);
    expect(tracker.update(at(2, 30, { raining: 0.2, avgPathWetness: 0.21 }))?.raining).toBe(0.2);
  });
});
