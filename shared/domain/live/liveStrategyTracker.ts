import type { LiveLapsLeft, LiveLapRecord, LiveSessionKind } from '../../types/live.js';
import type { LiveGarageTyres, LivePitInfo, LivePitMenu, LivePitState, LiveResourceKind, LiveResourcePlan, LiveStrategy } from '../../types/liveStrategy.js';
import { LiveDamageTracker, LiveTyreTracker, worstTread } from './liveCarCondition.js';
import type { LiveCarReading, LiveVehicleCondition } from './liveCarCondition.js';
import { nextForecastChange } from './liveForecast.js';
import type { LiveForecastNode } from './liveForecast.js';
import type { LiveScoringReading, LiveState } from './liveLifecycle.js';
import { liveResourceKind, planGarage, planRace, resourceUnit } from './liveResourcePlan.js';
import { LiveUsageMeter } from './liveUsage.js';

/** One parsed answer of LMU's local REST API (server/live/lmuPitRest.ts). */
/** The garage's selected tyre set, as `TireManagement` reports it. */
export type LiveSelectedTyres = Omit<LiveGarageTyres, 'newSets'>;

export type LiveRestUpdate =
  | { type: 'standings'; veFraction: number | null; fuelFraction: number | null; pitState: LivePitState; penalties: number }
  | { type: 'estimate'; total: number; damage: number; penalties: number; fuel: number; ve: number; tires: number }
  | { type: 'pitStopTimes'; fixRandom: number; fuelRandom: number; tireRandom: number; veRandom: number }
  | { type: 'pitMenu'; menu: LivePitMenu }
  | { type: 'condition'; condition: LiveVehicleCondition }
  | { type: 'tireManagement'; vePerLap: number | null; fuelPerLap: number | null; newSets: number | null; selected: LiveSelectedTyres | null }
  | { type: 'garage'; veStart: number | null; fuelStart: number | null }
  | { type: 'forecast'; sessions: Record<string, LiveForecastNode[]> };

/** What the strategy needs besides the reading: the session details already derived for the snapshot. */
export interface LiveStrategyContext {
  carClass: string | null;
  lapsLeft: LiveLapsLeft | null;
  /** The newest completed lap of the session (it changes once per lap). */
  latestLap: LiveLapRecord | null;
  reserveLaps: number;
}

/** `sessions/weather` keys by session kind. */
const FORECAST_SESSION: Record<LiveSessionKind, string | null> = {
  practice: 'PRACTICE', qualifying: 'QUALIFY', warmup: 'WARMUP', race: 'RACE', unknown: null,
};
/** Valid laps kept per event for the garage plan's lap time. */
const EVENT_LAPS = 20;
const GREEN = 5;

const round = (value: number, digits: number): number => Math.round(value * 10 ** digits) / 10 ** digits;
const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Builds the `strategy` part of the snapshot from the scoring readings, the player's telemetry (fuel, damage,
 * tyres) and LMU's REST answers. Per-lap use and lap times are kept for the event (same track and car) across its
 * sessions; damage, tyres and pit data belong to one session. Deterministic: no clock of its own.
 */
export class LiveStrategyTracker {
  private eventKey: string | null = null;
  private sessionKey: string | null = null;
  private readonly meters: Record<LiveResourceKind, LiveUsageMeter> = { ve: new LiveUsageMeter(), fuel: new LiveUsageMeter() };
  private eventLaps: number[] = [];
  private readonly damage = new LiveDamageTracker();
  private readonly tyres = new LiveTyreTracker();
  private et = 0;
  private completedLaps: number | null = null;
  private lapExcluded = false;
  private lastLapSeen: number | null = null;
  private car: LiveCarReading | null = null;
  private ve: number | null = null;
  private pitState: LivePitState = 'none';
  private penalties = 0;
  private estimate: Extract<LiveRestUpdate, { type: 'estimate' }> | null = null;
  private delays: Extract<LiveRestUpdate, { type: 'pitStopTimes' }> | null = null;
  private menu: LivePitMenu | null = null;
  private condition: LiveVehicleCondition | null = null;
  private usage: Extract<LiveRestUpdate, { type: 'tireManagement' }> | null = null;
  private garage: Extract<LiveRestUpdate, { type: 'garage' }> | null = null;
  private forecast: Record<string, LiveForecastNode[]> | null = null;

  /** Forgets everything (the game closed). */
  public reset(): void {
    this.eventKey = null;
    this.meters.ve.clear();
    this.meters.fuel.clear();
    this.eventLaps = [];
    this.resetSession();
    this.sessionKey = null;
  }

  private resetSession(): void {
    this.damage.reset();
    this.tyres.reset();
    this.completedLaps = null;
    this.lapExcluded = false;
    this.lastLapSeen = null;
    this.car = null;
    this.ve = null;
    this.pitState = 'none';
    this.penalties = 0;
    this.estimate = null;
    this.menu = null;
    this.condition = null;
    this.usage = null;
    this.garage = null;
  }

  public applyCar(car: LiveCarReading): void {
    this.car = car;
    if (car.fuelCapacityLiters > 0) this.meters.fuel.addSample(this.et, car.fuelLiters);
    this.damage.updateCar(car, (this.completedLaps ?? 0) + 1);
  }

  public applyRest(update: LiveRestUpdate): void {
    switch (update.type) {
      case 'standings':
        this.pitState = update.pitState;
        this.penalties = update.penalties;
        if (update.veFraction !== null) {
          this.ve = update.veFraction * 100;
          this.meters.ve.addSample(this.et, this.ve);
        }
        return;
      case 'estimate':
        this.estimate = update;
        this.damage.updateEstimate(update.damage, update.penalties);
        return;
      case 'pitStopTimes': this.delays = update; return;
      case 'pitMenu': this.menu = update.menu; return;
      case 'condition':
        this.condition = update.condition;
        this.damage.updateCondition(update.condition);
        return;
      case 'tireManagement': this.usage = update; return;
      case 'garage': this.garage = update; return;
      case 'forecast': this.forecast = update.sessions; return;
    }
  }

  /** Follows one scoring reading; returns the strategy for the snapshot, null while no session is loaded. */
  public update(reading: LiveScoringReading | null, state: LiveState, context: LiveStrategyContext): LiveStrategy | null {
    const player = reading?.player;
    if (!reading || !player || !state.session || state.lifecycle === 'menu' || state.lifecycle === 'offline') return null;
    const eventKey = `${reading.trackName}|${player.vehicleName}`;
    // REST answers can come before the first reading of a session: only a change of event or session clears them.
    if (eventKey !== this.eventKey) {
      if (this.eventKey !== null) this.reset();
      this.eventKey = eventKey;
    }
    const sessionKey = `${reading.sessionCode}|${reading.trackName}`;
    if (sessionKey !== this.sessionKey || reading.currentEt < this.et - 1) {
      if (this.sessionKey !== null) this.resetSession();
      this.sessionKey = sessionKey;
    }
    this.et = reading.currentEt;
    this.followLaps(reading, context.latestLap);
    const kind = liveResourceKind(context.carClass);
    const resource = this.resource(kind, reading, state, context);
    const lapsLeft = context.lapsLeft?.laps ?? null;
    return {
      resource: state.lifecycle === 'garage' ? null : resource,
      pit: state.lifecycle === 'garage' ? null : this.pit(),
      damage: this.damage.damage(player.totalLaps, state.session.kind === 'race' ? lapsLeft : null),
      tyres: this.tyres.tyres(this.car?.compound ?? null, this.condition, this.usage?.newSets ?? null),
      forecast: this.nextForecast(reading, state.session.kind),
      garage: state.lifecycle === 'garage' ? this.garagePlan(kind, reading, resource, context.reserveLaps) : null,
    };
  }

  private followLaps(reading: LiveScoringReading, latestLap: LiveLapRecord | null): void {
    const player = reading.player;
    if (!player) return;
    if (player.inPits || (reading.gamePhase !== GREEN && reading.gamePhase !== 9)) this.lapExcluded = true;
    if (this.completedLaps === null) {
      this.completedLaps = player.totalLaps;
      this.lapExcluded = player.inPits;
    } else if (player.totalLaps > this.completedLaps) {
      const excluded = this.lapExcluded || player.inPits;
      for (const meter of Object.values(this.meters)) meter.addCrossing(player.totalLaps, player.lapStartEt, excluded);
      this.tyres.lapCompleted(worstTread(this.condition));
      this.completedLaps = player.totalLaps;
      this.lapExcluded = player.inPits;
    }
    if (latestLap && latestLap.lapNumber !== this.lastLapSeen) {
      this.lastLapSeen = latestLap.lapNumber;
      this.damage.lapCompleted(latestLap);
      if (latestLap.valid && latestLap.lapSeconds !== null) this.eventLaps = [...this.eventLaps, latestLap.lapSeconds].slice(-EVENT_LAPS);
    }
  }

  private amount(kind: LiveResourceKind): number | null {
    if (kind === 've') return this.ve === null ? null : round(this.ve, 1);
    return this.car && this.car.fuelCapacityLiters > 0 ? round(this.car.fuelLiters, 1) : null;
  }

  private capacity(kind: LiveResourceKind): number | null {
    if (kind === 've') return 100;
    return this.car && this.car.fuelCapacityLiters > 0 ? this.car.fuelCapacityLiters : null;
  }

  private perLap(kind: LiveResourceKind): Pick<LiveResourcePlan, 'perLap' | 'perLapSource' | 'lapsMeasured'> {
    const meter = this.meters[kind];
    const measured = meter.perLap();
    if (measured !== null) return { perLap: round(measured, 2), perLapSource: 'measured', lapsMeasured: meter.laps.length };
    const game = kind === 've' ? this.usage?.vePerLap ?? null : this.usage?.fuelPerLap ?? null;
    return { perLap: game !== null && game > 0 ? round(game, 2) : null, perLapSource: game !== null && game > 0 ? 'game' : null, lapsMeasured: 0 };
  }

  private resource(kind: LiveResourceKind, reading: LiveScoringReading, state: LiveState, context: LiveStrategyContext): LiveResourcePlan {
    const player = reading.player;
    const amount = this.amount(kind);
    const capacity = this.capacity(kind);
    const usage = this.perLap(kind);
    const reserveLaps = context.reserveLaps;
    const perLap = usage.perLap;
    const lapFraction = player && reading.trackLength > 0 ? Math.min(Math.max(player.lapDist / reading.trackLength, 0), 1) : 0;
    const lapsLeft = context.lapsLeft?.laps ?? null;
    const race = state.session?.kind === 'race' && amount !== null && perLap !== null && perLap > 0 && lapsLeft !== null && player
      ? planRace({ amount, perLap, reserveLaps, capacity, lapsLeft, lapFraction, lapNumber: player.totalLaps + 1 })
      : null;
    return {
      kind,
      unit: resourceUnit(kind),
      amount,
      capacity,
      ...usage,
      reserveLaps,
      lapsInTank: amount !== null && perLap !== null && perLap > 0 ? round(Math.max(0, amount / perLap - reserveLaps), 1) : null,
      race,
    };
  }

  private pit(): LivePitInfo {
    const estimate = this.estimate;
    const penalties = Math.max(this.penalties, estimate?.penalties ? 1 : 0);
    const service = estimate && penalties === 0 ? estimate.total : null;
    const delays = this.delays;
    const random = estimate && delays
      ? (estimate.damage > 0 ? delays.fixRandom : 0)
        + (estimate.fuel > 0 || estimate.ve > 0 ? Math.max(delays.fuelRandom, delays.veRandom) : 0)
        + (estimate.tires > 0 ? delays.tireRandom : 0)
      : 0;
    return {
      state: this.pitState,
      penalties,
      serviceSeconds: service === null ? null : round(service, 0),
      serviceMaxSeconds: service === null ? null : round(service + random, 0),
      penaltySeconds: estimate && penalties > 0 ? round(estimate.penalties, 0) : null,
      mfd: this.menu,
    };
  }

  private nextForecast(reading: LiveScoringReading, kind: LiveSessionKind) {
    const name = FORECAST_SESSION[kind];
    const nodes = name ? this.forecast?.[name] : undefined;
    const player = reading.player;
    if (!nodes || !player || !(reading.endEt > 0) || reading.endEt > 1_000_000) return null;
    return nextForecastChange({
      nodes,
      sessionSeconds: reading.endEt,
      elapsedSeconds: reading.currentEt,
      raining: reading.raining,
      lapSeconds: player.estimatedLapTime > 0 ? player.estimatedLapTime : null,
      lapNumber: player.totalLaps + 1,
      lapFraction: reading.trackLength > 0 ? player.lapDist / reading.trackLength : 0,
    });
  }

  private garagePlan(kind: LiveResourceKind, reading: LiveScoringReading, resource: LiveResourcePlan, reserveLaps: number) {
    const sessionSeconds = reading.endEt > 0 && reading.endEt < 1_000_000 ? reading.endEt : null;
    const estimated = reading.player && reading.player.estimatedLapTime > 0 ? reading.player.estimatedLapTime : null;
    const lapSeconds = median(this.eventLaps) ?? estimated;
    const plan = planGarage({
      kind,
      sessionSeconds,
      lapSeconds: lapSeconds === null ? null : round(lapSeconds, 3),
      perLap: resource.perLap,
      perLapSource: resource.perLapSource,
      lapsMeasured: resource.lapsMeasured,
      reserveLaps,
      capacity: resource.capacity,
      setInGarage: kind === 've' ? this.garage?.veStart ?? null : this.garage?.fuelStart ?? null,
    });
    return { ...plan, tyres: this.garageTyres() };
  }

  private garageTyres(): LiveGarageTyres | null {
    const selected = this.usage?.selected ?? null;
    return selected ? { ...selected, newSets: this.usage?.newSets ?? null } : null;
  }
}
