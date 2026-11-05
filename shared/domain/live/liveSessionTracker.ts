import type { LiveSnapshot, LiveTiming } from '../../types/live.js';
import type { LiveStrategy } from '../../types/liveStrategy.js';
import { LiveLapTiming } from './liveLapTiming.js';
import { computeLapsLeft } from './liveLapsLeft.js';
import type { LiveOwnPace } from './liveLapsLeft.js';
import type { LiveScoringReading, LiveState } from './liveLifecycle.js';
import { LivePitLaneMeter } from './livePitLane.js';
import type { PitLaneMeasurement } from './livePitLane.js';
import { LiveWeatherTracker } from './liveWeather.js';

/** The snapshot fields that come from following the scoring readings over time. */
export type LiveSessionDetails = Pick<LiveSnapshot, 'lapsLeft' | 'weather' | 'recentLaps' | 'sessionBest'>;

export const NO_SESSION_DETAILS: LiveSessionDetails = { lapsLeft: null, weather: null, recentLaps: [], sessionBest: null };

/**
 * Follows the player's laps, the weather and the race distance across scoring readings; no reading (offline) clears
 * them. The race distance counts the player's own pace and the planned stop: its pit lane loss (the stored median of
 * the layout and class, else this session's measured stop) plus its planned service: the refuel to the plan's need
 * after the stop (not whatever the MFD holds) and the game's other service. That cost is
 * kept past the player's stop for the leader's, still to make.
 */
export class LiveSessionTracker {
  private readonly laps = new LiveLapTiming();
  private readonly weather = new LiveWeatherTracker();
  private readonly lane = new LivePitLaneMeter();
  private sessionKey: string | null = null;
  private storedLaneLoss: number | null = null;
  private sessionLaneLoss: number | null = null;
  private measured: PitLaneMeasurement | null = null;
  private stopCost: number | null = null;
  /** Clock and lap share at the pit lane entry of the stop in progress; null outside the lane. */
  private laneEntry: { et: number; fraction: number } | null = null;

  /** The stored pit lane loss of the loaded layout and class (median of the newest stops); null when none. */
  public setStoredLaneLoss(seconds: number | null): void { this.storedLaneLoss = seconds; }

  /** A stop measured since the last call (`LivePitLaneMeter`), to be stored for the layout and class. */
  public takeLaneLoss(): PitLaneMeasurement | null {
    const measured = this.measured;
    this.measured = null;
    return measured;
  }

  /** `strategy`: the previous snapshot's, for the planned stop and the damage at a pit entry. */
  public apply(reading: LiveScoringReading | null, state: LiveState, strategy: LiveStrategy | null = null): LiveSessionDetails {
    if (!state.session) {
      if (state.lifecycle !== 'loading') { this.laps.reset(); this.weather.reset(); this.resetLane(null); }
      return NO_SESSION_DETAILS;
    }
    this.laps.update(reading);
    const weather = this.weather.update(reading);
    if (!reading || !state.session) return { ...NO_SESSION_DETAILS, weather };
    const key = `${reading.sessionCode}|${reading.trackName}`;
    if (key !== this.sessionKey) this.resetLane(key);
    const player = reading.player;
    if (player && state.session.kind === 'race') {
      const loss = this.lane.update(player, reading.currentEt, this.laps.recentLaps, strategy?.damage?.impactLap ?? null);
      if (loss !== null) { this.sessionLaneLoss = loss.seconds; this.measured = loss; }
    }
    const race = strategy?.resource?.race;
    const pit = strategy?.pit;
    const stopAhead = race?.finishReachable === false && (pit?.state === 'none' || pit?.state === 'request');
    const laneLoss = this.storedLaneLoss ?? this.sessionLaneLoss ?? 0;
    if (stopAhead) this.stopCost = laneLoss + (pit?.plannedServiceSeconds ?? pit?.serviceSeconds ?? 0);
    const lapFraction = player && reading.trackLength > 0 ? player.lapDist / reading.trackLength : null;
    const lapSeconds = this.lane.pace();
    const own: LiveOwnPace = {
      lapSeconds,
      stopSeconds: stopAhead ? this.stopCost ?? 0 : this.stopLeft(pit?.state, reading.currentEt, lapFraction, lapSeconds ?? player?.estimatedLapTime ?? null),
      stopCostSeconds: this.stopCost ?? laneLoss,
      lapFraction,
    };
    return {
      lapsLeft: computeLapsLeft(state.session, player, reading.leader, reading.classLeader, own),
      weather,
      recentLaps: this.laps.recentLaps,
      sessionBest: this.laps.sessionBest,
    };
  }

  public timing(): LiveTiming | null { return this.laps.timing(); }

  /**
   * What the stop in progress still costs: its cost less the time lost so far, the time since the lane entry beyond
   * driving that distance at pace. Without it the race distance gained a lap in the lane (Daytona 2026-11-05: 18 laps
   * read in the box, 17 before and after, so the stop showed 81 % needed for 76 %).
   */
  private stopLeft(state: NonNullable<LiveStrategy['pit']>['state'] | undefined, et: number, fraction: number | null, pace: number | null): number {
    const inLane = state === 'entering' || state === 'stopped' || state === 'exiting';
    if (!inLane || fraction === null) { this.laneEntry = null; return 0; }
    this.laneEntry ??= { et, fraction };
    if (this.stopCost === null || pace === null || !(pace > 0)) return 0;
    const driven = fraction >= this.laneEntry.fraction ? fraction - this.laneEntry.fraction : fraction + 1 - this.laneEntry.fraction;
    return Math.max(0, this.stopCost - Math.max(0, et - this.laneEntry.et - driven * pace));
  }

  private resetLane(key: string | null): void { this.sessionKey = key; this.lane.reset(); this.sessionLaneLoss = null; this.measured = null; this.stopCost = null; this.laneEntry = null; }
}
