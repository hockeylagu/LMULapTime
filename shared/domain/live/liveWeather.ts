import type { LiveWeather } from '../../types/live.js';
import type { LiveScoringReading } from './liveLifecycle.js';

/** The temperature trend compares against this long ago (session seconds). */
export const WEATHER_TREND_WINDOW_SECONDS = 300;
/** A change smaller than this (degrees) is steady. */
const TREND_THRESHOLD_C = 0.5;
/** A trend already showing holds until the change falls below this (degrees), so the edge does not flicker. */
const TREND_RELEASE_C = 0.25;
/** The whole-degree value holds until the reading is this far (degrees) from it, so x.5 does not flicker. */
const DEGREE_HOLD_C = 0.7;
/** Less history than this (seconds) is too short for a trend. */
const MIN_TREND_SPAN_SECONDS = 60;
/** One sample is kept per this many seconds. */
const SAMPLE_SPACING_SECONDS = 10;
/** Rain and wetness are reported in these steps, so slow drifts do not resend the snapshot every update. */
const LEVEL_STEP = 0.05;

interface Sample { et: number; trackTempC: number }

const quantize = (value: number): number => Math.round(value / LEVEL_STEP) * LEVEL_STEP;
const level = (value: number): number => Math.round(quantize(value) * 100) / 100;

/**
 * Weather for the page: whole-degree track temperature, its trend against about five minutes earlier
 * (up or down by at least 0.5 C; steady until a minute of history exists), rain and path wetness in
 * 0.05 steps. Fed one scoring reading at a time; the session clock drives the history, so a paused
 * game does not age it. Clears when the clock goes back (a new session).
 */
export class LiveWeatherTracker {
  private samples: Sample[] = [];
  private trend: LiveWeather['trackTempTrend'] = 'steady';
  private shownTemp: number | null = null;

  public reset(): void {
    this.samples = [];
    this.trend = 'steady';
    this.shownTemp = null;
  }

  public update(reading: LiveScoringReading | null): LiveWeather | null {
    if (!reading || reading.numVehicles <= 0 || !Number.isFinite(reading.trackTempC) || reading.trackTempC <= -100) {
      this.reset();
      return null;
    }
    const et = reading.currentEt;
    const last = this.samples[this.samples.length - 1];
    if (last && et < last.et) this.reset();
    if (!last || et < last.et || et - last.et >= SAMPLE_SPACING_SECONDS) this.samples.push({ et, trackTempC: reading.trackTempC });
    while (this.samples.length > 2 && this.samples[1].et <= et - WEATHER_TREND_WINDOW_SECONDS) this.samples.shift();
    const reference = this.samples[0];
    const change = et - reference.et < MIN_TREND_SPAN_SECONDS ? 0 : reading.trackTempC - reference.trackTempC;
    const holding = this.trend === 'rising' ? change > TREND_RELEASE_C : this.trend === 'falling' ? change < -TREND_RELEASE_C : false;
    if (!holding) this.trend = change >= TREND_THRESHOLD_C ? 'rising' : change <= -TREND_THRESHOLD_C ? 'falling' : 'steady';
    if (this.shownTemp === null || Math.abs(reading.trackTempC - this.shownTemp) >= DEGREE_HOLD_C) this.shownTemp = Math.round(reading.trackTempC);
    return {
      trackTempC: this.shownTemp,
      trackTempTrend: this.trend,
      raining: level(reading.raining),
      avgPathWetness: level(reading.avgPathWetness),
    };
  }
}
