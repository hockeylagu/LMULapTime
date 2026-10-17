import type { LiveSnapshot, LiveTiming } from '../../types/live.js';
import { LiveLapTiming } from './liveLapTiming.js';
import { computeLapsLeft } from './liveLapsLeft.js';
import type { LiveScoringReading, LiveState } from './liveLifecycle.js';
import { LiveWeatherTracker } from './liveWeather.js';

/** The snapshot fields that come from following the scoring readings over time. */
export type LiveSessionDetails = Pick<LiveSnapshot, 'lapsLeft' | 'weather' | 'recentLaps' | 'sessionBest'>;

export const NO_SESSION_DETAILS: LiveSessionDetails = { lapsLeft: null, weather: null, recentLaps: [], sessionBest: null };

/** Follows the player's laps, the weather and the race distance across scoring readings; no reading (offline) clears them. */
export class LiveSessionTracker {
  private readonly laps = new LiveLapTiming();
  private readonly weather = new LiveWeatherTracker();

  public apply(reading: LiveScoringReading | null, state: LiveState): LiveSessionDetails {
    if (!state.session) {
      if (state.lifecycle !== 'loading') { this.laps.reset(); this.weather.reset(); }
      return NO_SESSION_DETAILS;
    }
    this.laps.update(reading);
    const weather = this.weather.update(reading);
    if (!reading || !state.session) return { ...NO_SESSION_DETAILS, weather };
    return {
      lapsLeft: computeLapsLeft(state.session, reading.player, reading.leader, reading.classLeader),
      weather,
      recentLaps: this.laps.recentLaps,
      sessionBest: this.laps.sessionBest,
    };
  }

  public timing(): LiveTiming | null { return this.laps.timing(); }
}
