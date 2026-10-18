import { LIVE_BASELINE_MODEL_VERSION } from '../live/liveAudit.js';
import { RAIN_WET_MIN } from '../lapConditions.js';
import type { LiveScoringReading } from '../live/liveLifecycle.js';
import type { LiveSnapshot } from '../../types/live.js';
import type { LiveUsageObservation } from '../../types/liveAudit.js';
import type { LivePerLapSource } from '../../types/liveStrategy.js';
import { LIVE_LEARNING_VERSION } from '../../types/liveLearning.js';
import type { LiveLearningEvent } from '../../types/liveLearning.js';

export interface ResourceForecast { perLap: number | null; perLapSource: LivePerLapSource | null }
/** Freeze before outcomes arrive; separate observations for both fuel and VE, independent of any dashboard. */
export class LiveLearningCapture {
  private recording = '';
  private lastEt = -Infinity;
  private readonly forecasts = new Set<string>();
  private readonly outcomes = new Set<string>();
  private readonly regimes = new Map<number, string>();
  private readonly excluded = new Map<number, Set<string>>();
  private lastAmounts: LiveUsageObservation | null = null;

  public update(recordingId: string, snapshot: LiveSnapshot, reading: LiveScoringReading,
    predictions: Record<'fuel' | 've', ResourceForecast>, observations: LiveUsageObservation): LiveLearningEvent[] {
    if (recordingId !== this.recording || reading.currentEt < this.lastEt - 1) {
      this.forecasts.clear(); this.outcomes.clear(); this.regimes.clear(); this.excluded.clear();
      this.recording = recordingId;
      this.lastAmounts = null;
      this.lastEt = -Infinity;
    }
    const gap = reading.currentEt - this.lastEt;
    this.lastEt = reading.currentEt;
    const player = reading.player;
    if (!player || !Number.isFinite(reading.currentEt)) return [];
    const lap = player.totalLaps + 1;
    const condition = Math.max(reading.raining, reading.avgPathWetness) * 255 >= RAIN_WET_MIN ? 'wet' : 'dry';
    const compound = snapshot.strategy?.tyres?.compound ?? null;
    const regime = JSON.stringify([condition, compound, player.driverName, player.vehicleName, snapshot.identity?.layoutKey]);
    const reasons = this.excluded.get(lap) ?? new Set<string>();
    this.excluded.set(lap, reasons);
    if (gap > 2 && Number.isFinite(gap)) {
      reasons.add('capture-gap');
      this.excluded.get(lap - 1)?.add('capture-gap');
    }
    if ((observations.fuelNowLitres != null && this.lastAmounts?.fuelNowLitres != null
      && observations.fuelNowLitres > this.lastAmounts.fuelNowLitres + 0.01)
      || (observations.veNowPercent != null && this.lastAmounts?.veNowPercent != null
        && observations.veNowPercent > this.lastAmounts.veNowPercent + 0.01)) {
      reasons.add('resource-increased');
      this.excluded.get(lap - 1)?.add('resource-increased');
    }
    this.lastAmounts = { ...observations };
    if (this.regimes.has(lap) && this.regimes.get(lap) !== regime) reasons.add('context-changed');
    else this.regimes.set(lap, regime);
    if (this.regimes.has(lap - 1) && this.regimes.get(lap - 1) !== regime) this.excluded.get(lap - 1)?.add('context-changed-at-crossing');
    if (player.inPits) reasons.add('pit-lap');
    if (player.countLapFlag !== 2) reasons.add('invalid-live-lap');
    if (reading.gamePhase !== 5 && reading.gamePhase !== 9) reasons.add('caution-or-start');
    if (snapshot.strategy?.damage?.significant) reasons.add('damage');
    const events: LiveLearningEvent[] = [];
    for (const kind of ['fuel', 've'] as const) {
      const key = `${lap}:${kind}`;
      if (!this.forecasts.has(key) && snapshot.lifecycle === 'driving' && !snapshot.result
        && Number.isFinite(player.lapStartEt) && reading.currentEt >= player.lapStartEt
        && reading.currentEt - player.lapStartEt <= 2) {
        this.forecasts.add(key);
        events.push({ kind: 'learning-forecast', data: { version: LIVE_LEARNING_VERSION,
          lapNumber: lap, lapStartSeconds: player.lapStartEt, forecastSeconds: reading.currentEt, kind,
          predicted: predictions[kind].perLap, predictionSource: predictions[kind].perLapSource,
          modelVersion: LIVE_BASELINE_MODEL_VERSION, condition, compound } });
      }
      const use = observations[kind];
      const outcomeKey = use ? `${use.lap}:${kind}` : '';
      if (use && use.lap >= lap - 2 && use.lap < lap && use.et <= reading.currentEt && Number.isFinite(use.amount) && use.amount > 0
        && !this.outcomes.has(outcomeKey)) {
        this.outcomes.add(outcomeKey);
        events.push({ kind: 'learning-outcome', data: { version: LIVE_LEARNING_VERSION, lapNumber: use.lap,
          crossingSeconds: use.et, kind, actual: use.amount, measurementSource: 'live-usage-meter',
          exclusions: [...(this.excluded.get(use.lap) ?? new Set(['unobserved-lap']))] } });
      }
    }
    // Only recent lap context is needed; asynchronous outcomes older than two laps are ignored above.
    for (const number of this.regimes.keys()) if (number < lap - 3) { this.regimes.delete(number); this.excluded.delete(number); }
    for (const key of this.forecasts) if (Number(key.split(':')[0]) < lap - 3) this.forecasts.delete(key);
    for (const key of this.outcomes) if (Number(key.split(':')[0]) < lap - 3) this.outcomes.delete(key);
    return events;
  }
}
