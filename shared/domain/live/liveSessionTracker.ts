import type { LiveSnapshot, LiveTiming } from '../../types/live.js';
import type { LiveStrategy } from '../../types/liveStrategy.js';
import { LiveLapTiming } from './liveLapTiming.js';
import { computeLapsLeft } from './liveLapsLeft.js';
import type { LiveOwnPace } from './liveLapsLeft.js';
import type { LiveScoringReading, LiveState } from './liveLifecycle.js';
import { LiveWeatherTracker } from './liveWeather.js';

/** The snapshot fields that come from following the scoring readings over time. */
export type LiveSessionDetails = Pick<LiveSnapshot, 'lapsLeft' | 'weather' | 'recentLaps' | 'sessionBest'>;

export const NO_SESSION_DETAILS: LiveSessionDetails = { lapsLeft: null, weather: null, recentLaps: [], sessionBest: null };

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Follows the player's laps, the weather and the race distance across scoring readings; no reading (offline) clears
 * them. The race distance counts the player's own pace and the planned stop: the pit lane's loss is measured at the
 * session's first stop (lane time less a racing lap's time over the same distance, less the service the game
 * estimated at the entry), then added to the next stop's service.
 */
export class LiveSessionTracker {
  private readonly laps = new LiveLapTiming();
  private readonly weather = new LiveWeatherTracker();
  private sessionKey: string | null = null;
  private lane: { et: number; dist: number; service: number } | null = null;
  private wasInPits: boolean | null = null;
  private laneLoss: number | null = null;

  /** `strategy`: the previous snapshot's, for the planned stop and the service estimated at the pit entry. */
  public apply(reading: LiveScoringReading | null, state: LiveState, strategy: LiveStrategy | null = null): LiveSessionDetails {
    if (!state.session) {
      if (state.lifecycle !== 'loading') { this.laps.reset(); this.weather.reset(); this.resetLane(null); }
      return NO_SESSION_DETAILS;
    }
    this.laps.update(reading);
    const weather = this.weather.update(reading);
    if (!reading || !state.session) return { ...NO_SESSION_DETAILS, weather };
    const pace = median(this.laps.recentLaps.filter(lap => lap.valid && lap.lapSeconds !== null).map(lap => lap.lapSeconds!));
    this.followLane(reading, strategy, pace);
    const race = strategy?.resource?.race;
    const pit = strategy?.pit;
    const stopAhead = race?.finishReachable === false && (pit?.state === 'none' || pit?.state === 'request');
    const player = reading.player;
    const own: LiveOwnPace = { lapSeconds: pace, stopSeconds: stopAhead ? (this.laneLoss ?? 0) + (pit?.serviceSeconds ?? 0) : 0,
      lapFraction: player && reading.trackLength > 0 ? player.lapDist / reading.trackLength : null };
    return {
      lapsLeft: computeLapsLeft(state.session, reading.player, reading.leader, reading.classLeader, own),
      weather,
      recentLaps: this.laps.recentLaps,
      sessionBest: this.laps.sessionBest,
    };
  }

  public timing(): LiveTiming | null { return this.laps.timing(); }

  private resetLane(key: string | null): void { this.sessionKey = key; this.lane = null; this.laneLoss = null; this.wasInPits = null; }

  private followLane(reading: LiveScoringReading, strategy: LiveStrategy | null, pace: number | null): void {
    const player = reading.player;
    const key = `${reading.sessionCode}|${reading.trackName}`;
    if (key !== this.sessionKey) this.resetLane(key);
    if (!player) return;
    const entered = player.inPits && this.wasInPits === false;
    this.wasInPits = player.inPits;
    // A start from the garage or the pit lane is no stop: only an entry seen from the track counts.
    if (entered) this.lane = { et: reading.currentEt, dist: player.lapDist, service: strategy?.pit?.serviceSeconds ?? 0 };
    if (player.inPits || !this.lane) return;
    const lane = this.lane;
    this.lane = null;
    if (this.laneLoss !== null || pace === null || !(reading.trackLength > 0)) return;
    const distance = (player.lapDist - lane.dist + reading.trackLength) % reading.trackLength;
    const loss = reading.currentEt - lane.et - (distance / reading.trackLength) * pace - lane.service;
    if (loss > 0) this.laneLoss = loss;
  }
}
