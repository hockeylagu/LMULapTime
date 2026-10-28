import type { LiveSnapshot } from '../../types/live.js';
import type { LiveAccuracyComparison, LiveAuditRecord, LiveUsageObservation } from '../../types/liveAudit.js';
import type { LiveScoringReading } from './liveLifecycle.js';
import { liveTrackWet } from '../lapConditions.js';

/** Bump when the forecasting formulas change; history keeps the version that produced each estimate. */
export const LIVE_MODEL_VERSION = 12;
/** Uncorrected estimator recorded for training and used as the exact calibration compatibility version. */
export const LIVE_BASELINE_MODEL_VERSION = 5;
interface Baseline { snapshot: LiveSnapshot; regime: string; et: number }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const difference = (actual: number | null, predicted: number | null): number | null =>
  actual !== null && predicted !== null ? actual - predicted : null;

/**
 * Live strategy audit tracker: runs inside the capture controller.
 * Storage and inspection contract: docs/LIVE_CAPTURE_FORMAT.md#consolidated-strategy-audit
 */

/** Records event checkpoints (start, lap, settings, measurement, finish, end), never periodic ones; never learns from its own predictions. */
export class LiveAuditTracker {
  private runId: string | null = null;
  private key = '';
  private sequence = 0;
  private last: LiveSnapshot | null = null;
  private settings = '';
  private observationKey = '';
  private regime = '';
  private baselines = new Map<number, Baseline>();
  private compared = new Set<number>();

  public constructor(private readonly createId: () => string, private readonly save: (record: LiveAuditRecord) => void) {}

  public update(snapshot: LiveSnapshot, reading: LiveScoringReading | null, observation: LiveUsageObservation, now: number): string | null {
    const session = snapshot.session;
    const player = reading?.player;
    if (!session || !player || snapshot.lifecycle === 'menu' || snapshot.lifecycle === 'offline' || snapshot.lifecycle === 'loading') {
      this.end(now);
      return null;
    }
    const key = `${session.sessionCode}|${session.trackName}|${session.vehicleName}`;
    const changedLayout = this.last?.identity?.layoutKey != null && snapshot.identity?.layoutKey != null
      && this.last.identity.layoutKey !== snapshot.identity.layoutKey;
    if (!this.runId || key !== this.key || changedLayout || session.elapsedSeconds < (this.last?.session?.elapsedSeconds ?? 0) - 1) {
      this.end(now);
      this.runId = this.createId(); this.key = key; this.sequence = 0;
      this.settings = ''; this.observationKey = ''; this.baselines.clear(); this.compared.clear();
    }
    const strategy = snapshot.strategy;
    const compound = strategy?.tyres?.compound ?? strategy?.garage?.tyres?.compound ?? '';
    const regime = `${snapshot.identity?.layoutKey ?? ''}|${compound}|${liveTrackWet(reading.raining, reading.avgPathWetness) ? 'wet' : 'dry'}`;
    const lap = player.totalLaps;
    if (regime !== this.regime) this.baselines.clear();
    this.regime = regime;
    // Only a reading at the start of a lap is eligible; joining midway cannot create a retrospective forecast.
    if (!this.baselines.has(lap + 1) && !snapshot.result && (snapshot.lifecycle === 'starting'
      || (snapshot.lifecycle === 'driving' && reading.currentEt >= player.lapStartEt && reading.currentEt - player.lapStartEt <= 2))) {
      this.baselines.set(lap + 1, { snapshot: clone(snapshot), regime, et: reading.currentEt });
      for (const number of this.baselines.keys()) if (number < lap - 2) this.baselines.delete(number);
    }
    const settingKey = JSON.stringify([strategy?.garage?.setInGarage, strategy?.garage?.tyres,
      strategy?.fuelRatio?.garageSetting, strategy?.pit?.mfd, strategy?.pit?.state,
      strategy?.resource?.reserveLaps, strategy?.garage?.reserveLaps, strategy?.resource?.perLap,
      strategy?.garage?.needed, strategy?.fuelRatio?.recommended,
      strategy?.crossover?.action, strategy?.crossover?.compound, strategy?.crossover?.when, strategy?.crossover?.reason]);
    const observedKey = JSON.stringify([observation.fuel, observation.ve]);
    const measurement = observedKey !== this.observationKey && (observation.fuel !== null || observation.ve !== null);
    const completedLap = lap !== this.last?.session?.playerLapsCompleted;
    const finish = !!snapshot.result && !this.last?.result;
    const reason = !this.last ? 'start' : finish ? 'finish' : measurement ? 'measurement'
      : completedLap ? 'lap' : settingKey !== this.settings ? 'settings' : null;
    const comparison = measurement ? this.compare(observation, regime) : null;
    if (reason) {
      this.save({ runId: this.runId, sequence: ++this.sequence, recordedAt: now, modelVersion: LIVE_MODEL_VERSION,
        reason, snapshot: clone(snapshot), observation: clone(observation), comparison });
    }
    this.settings = settingKey; this.observationKey = observedKey;
    this.last = snapshot;
    return this.runId;
  }

  private compare(observation: LiveUsageObservation, regime: string): LiveAccuracyComparison | null {
    const use = [observation.ve, observation.fuel].filter(value => value !== null).sort((a, b) => b.et - a.et)[0];
    if (!use) return null;
    const baseline = this.baselines.get(use.lap);
    if (!baseline || baseline.regime !== regime || use.et <= baseline.et) return null;
    const resource = baseline.snapshot.strategy?.resource;
    if (!resource) return null;
    const actual = observation[resource.kind];
    const amount = actual?.lap === use.lap && actual.et === use.et ? actual.amount : null;
    const paired = observation.fuel && observation.ve && observation.fuel.lap === observation.ve.lap && observation.fuel.et === observation.ve.et;
    // VE cars wait for the paired fuel sample, preventing asynchronous answers counting the same lap twice.
    if (amount === null || (resource.kind === 've' && !paired) || this.compared.has(use.lap)) return null;
    this.compared.add(use.lap);
    for (const number of this.compared) if (number < use.lap - 3) this.compared.delete(number);
    const ratio = paired && observation.ve!.amount > 0 ? observation.fuel!.amount / observation.ve!.amount : null;
    const predicted = resource.perLap;
    const error = difference(amount, predicted);
    const fuelRatio = baseline.snapshot.strategy?.fuelRatio;
    return { lap: use.lap, forecastAtSeconds: baseline.et, resourceKind: resource.kind, source: resource.perLapSource,
      predictedPerLap: predicted, actualPerLap: amount, errorPerLap: error,
      errorPercent: error !== null && predicted !== null && predicted > 0 ? error / predicted * 100 : null,
      recommendedRatio: fuelRatio?.recommended ?? null, actualRatio: ratio,
      garageRatio: fuelRatio?.garageSetting ?? null, nextStopRatio: fuelRatio?.mfdSetting ?? null,
      ratioError: difference(ratio, fuelRatio?.recommended ?? null) };
  }

  public end(now: number): void {
    if (this.runId && this.last) this.save({ runId: this.runId, sequence: ++this.sequence, recordedAt: now,
      modelVersion: LIVE_MODEL_VERSION, reason: 'end', snapshot: clone(this.last), observation: { fuel: null, ve: null }, comparison: null });
    this.runId = null; this.last = null;
  }
}
