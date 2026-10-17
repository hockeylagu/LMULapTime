import type { LiveLapsLeft, LiveLapRecord, LiveSessionKind } from '../../types/live.js';
import type { LiveGaragePlan, LiveGarageTyres, LivePitInfo, LivePitMenu, LivePitState, LiveResourceKind, LiveResourcePlan, LiveStrategy } from '../../types/liveStrategy.js';
import { LiveDamageTracker, LiveTyreTracker, worstTread } from './liveCarCondition.js';
import type { LiveCarReading, LiveVehicleCondition } from './liveCarCondition.js';
import { nextForecastChange } from './liveForecast.js';
import type { LiveForecastNode } from './liveForecast.js';
import { liveSessionKind } from './liveLifecycle.js';
import type { LiveScoringReading, LiveState } from './liveLifecycle.js';
import { liveResourceKind, planGarage, planRace, resourceUnit } from './liveResourcePlan.js';
import { LiveUsageMeter } from './liveUsage.js';
import { planFuelRatio, savingToFinish, tyreCoverage } from './liveInsights.js';
import { RAIN_WET_MIN } from '../lapConditions.js';
import type { LiveUsageObservation } from '../../types/liveAudit.js';
import { classLeaderLapSeconds } from './liveLapsLeft.js';

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
  | { type: 'garage'; veStart: number | null; fuelStart: number | null; fuelRatio?: number | null }
  | { type: 'forecast'; sessions: Record<string, LiveForecastNode[]> };

/** What the strategy needs besides the reading: the session details already derived for the snapshot. */
export interface LiveStrategyContext {
  carClass: string | null;
  /**
   * The exact layout (`LiveIdentity.layoutKey`): null until the game's navigation state names it when the track
   * name fits several layouts of one facility, and never a guess.
   */
  layoutKey: string | null;
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
/** Raw 0-255 rain or path wetness below which a wet track counts as dry again (wet from RAIN_WET_MIN). */
const DRY_AGAIN_MAX = 7;

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
 * sessions; damage, tyres and pit data belong to one session. The game's track name can be the same for the layouts
 * of one facility (Bahrain GP and Outer): an event resolved to one layout is forgotten when another loads, so
 * no use or lap time crosses layouts (AGENTS.md section 3A). Deterministic: no clock of its own.
 */
export class LiveStrategyTracker {
  /** Raw clean-lap measurements; separate from the rolling estimate used by the planner. */
  public observations(): LiveUsageObservation {
    return { fuel: this.meters.fuel.latestUse, ve: this.meters.ve.latestUse,
      fuelNowLitres: this.car && this.car.fuelCapacityLiters > 0 ? this.car.fuelLiters : null, veNowPercent: this.ve };
  }
  private eventKey: string | null = null;
  private eventLayout: string | null = null;
  private sessionKey: string | null = null;
  private readonly meters: Record<LiveResourceKind, LiveUsageMeter> = { ve: new LiveUsageMeter(), fuel: new LiveUsageMeter() };
  private eventLaps: number[] = [];
  private ratios: number[] = [];
  private lastPair: string | null = null;
  /** Wet or dry, with hysteresis (null before the first reading). */
  private wet: boolean | null = null;
  private eventTyreWear: number | null = null;
  private eventCompound = '';
  private ratioOptions: number[] = [];
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
    this.eventLayout = null;
    this.meters.ve.clear();
    this.meters.fuel.clear();
    this.eventLaps = [];
    this.ratios = []; this.wet = null; this.eventTyreWear = null; this.eventCompound = ''; this.ratioOptions = [];
    this.resetSession();
    this.sessionKey = null;
  }

  private resetSession(): void {
    this.meters.fuel.restart(); this.meters.ve.restart(); this.lastPair = null;
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
      case 'pitMenu':
        this.menu = update.menu;
        if (update.menu.fuelRatioOptions) this.ratioOptions = update.menu.fuelRatioOptions;
        return;
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
    if (state.lifecycle === 'menu' || state.lifecycle === 'offline') { this.reset(); return null; }
    const player = reading?.player;
    if (!reading || !player || !state.session) return null;
    const eventKey = `${reading.trackName}|${player.vehicleName}`;
    // REST answers can come before the first reading of a session: only a change of event or session clears them.
    if (eventKey !== this.eventKey) {
      if (this.eventKey !== null) this.reset();
      this.eventKey = eventKey;
    }
    // An unresolved layout (null) neither starts nor ends an event: only two known layouts that differ do.
    if (context.layoutKey !== null) {
      if (this.eventLayout !== null && this.eventLayout !== context.layoutKey) {
        this.reset();
        this.eventKey = eventKey;
      }
      this.eventLayout = context.layoutKey;
    }
    const sessionKey = `${reading.sessionCode}|${reading.trackName}`;
    if (sessionKey !== this.sessionKey || reading.currentEt < this.et - 1) {
      if (this.sessionKey !== null) this.resetSession();
      this.sessionKey = sessionKey;
    }
    this.et = reading.currentEt;
    // Another compound wears differently but barely changes VE or fuel use: only the tyre wear starts again.
    const compound = this.car?.compound || this.usage?.selected?.compound || this.eventCompound;
    if (this.eventCompound && compound !== this.eventCompound) { this.eventTyreWear = null; this.tyres.reset(); }
    this.eventCompound = compound;
    // Wet from RAIN_WET_MIN, dry again only below DRY_AGAIN_MAX, so a track drying near the line does not flip back and forth.
    const level = Math.max(reading.raining, reading.avgPathWetness) * 255;
    const wet = this.wet === true ? level >= DRY_AGAIN_MAX : level >= RAIN_WET_MIN;
    if (this.wet !== null && wet !== this.wet) {
      this.meters.fuel.clear(); this.meters.ve.clear(); this.ratios = []; this.eventLaps = []; this.lastPair = null; this.lapExcluded = true; this.eventTyreWear = null;
      this.tyres.reset();
    }
    this.wet = wet;
    this.followLaps(reading, context.latestLap);
    const fuelUse = this.meters.fuel.latestUse;
    const veUse = this.meters.ve.latestUse;
    if (fuelUse && veUse && fuelUse.lap === veUse.lap && fuelUse.et === veUse.et) {
      const pair = `${veUse.lap}|${veUse.et}`;
      if (pair !== this.lastPair) { this.ratios = [...this.ratios, fuelUse.amount / veUse.amount].slice(-30); this.lastPair = pair; }
    }
    const kind = liveResourceKind(context.carClass);
    const resource = this.resource(kind, reading, state, context);
    const lapsLeft = context.lapsLeft?.laps ?? null;
    const tyres = this.tyres.tyres(this.car?.compound ?? null, this.condition, this.usage?.newSets ?? null);
    if (tyres.wearPerLap !== null && tyres.wearPerLap > 0) this.eventTyreWear = tyres.wearPerLap;
    const fraction = reading.trackLength > 0 ? Math.min(1, Math.max(0, player.lapDist / reading.trackLength)) : 0;
    if (lapsLeft !== null) {
      const race = resource.race;
      const toPit = race?.pitInLaps != null ? race.pitInLaps + 1 - fraction : lapsLeft - fraction;
      tyres.coverage = tyreCoverage(tyres.worst, tyres.wearPerLap, toPit, lapsLeft - fraction, race?.finishReachable ? 'finish' : 'pit', tyres.newSets);
    }
    const garage = state.lifecycle === 'garage' ? this.garagePlan(kind, reading, resource, context.reserveLaps) : null;
    if (garage?.tyres && garage.laps !== null) garage.tyreCoverage = tyreCoverage(garage.tyres.wear, this.eventTyreWear, garage.laps, garage.laps, 'finish', garage.tyres.newSets);
    const fuelRatio = kind === 've' ? planFuelRatio({ ratios: this.ratios,
      fuelPerLap: this.ratios.length >= 3 ? this.perLap('fuel').perLap : this.usage?.fuelPerLap ?? null,
      vePerLap: this.ratios.length >= 3 ? this.perLap('ve').perLap : this.usage?.vePerLap ?? null,
      garageSetting: this.garage?.fuelRatio ?? null, mfdSetting: state.lifecycle === 'garage' ? null : this.menu?.fuelRatio ?? null,
      options: this.ratioOptions, veTarget: garage?.needed ?? resource.race?.neededAfterStop ?? null,
      fuelNow: state.lifecycle === 'garage' ? null : this.car?.fuelLiters ?? null, veNow: state.lifecycle === 'garage' ? null : this.ve,
    }) : null;
    return {
      resource: state.lifecycle === 'garage' ? null : resource,
      pit: state.lifecycle === 'garage' ? null : this.pit(),
      damage: this.damage.damage(player.totalLaps, state.session.kind === 'race' ? lapsLeft : null),
      tyres,
      forecast: this.nextForecast(reading, state.session.kind),
      garage, fuelRatio,
    };
  }

  private followLaps(reading: LiveScoringReading, latestLap: LiveLapRecord | null): void {
    const player = reading.player;
    if (!player) return;
    if (player.inPits || (reading.gamePhase !== GREEN && reading.gamePhase !== 9)) this.lapExcluded = true;
    if (player.countLapFlag !== 2) this.lapExcluded = true;
    if (this.completedLaps === null) {
      this.completedLaps = player.totalLaps;
      this.lapExcluded = player.inPits || player.countLapFlag !== 2;
    } else if (player.totalLaps > this.completedLaps) {
      const excluded = this.lapExcluded || player.inPits || (latestLap !== null && !latestLap.valid);
      for (const meter of Object.values(this.meters)) meter.addCrossing(player.totalLaps, player.lapStartEt, excluded);
      this.tyres.lapCompleted(worstTread(this.condition));
      this.completedLaps = player.totalLaps;
      this.lapExcluded = player.inPits || player.countLapFlag !== 2;
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
      saving: state.session?.kind === 'race' && amount !== null && perLap !== null && lapsLeft !== null && usage.perLapSource !== null
        ? savingToFinish(amount, perLap, Math.max(0, lapsLeft - lapFraction), reserveLaps, usage.perLapSource) : null,
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

  private garagePlan(kind: LiveResourceKind, reading: LiveScoringReading, resource: LiveResourcePlan, reserveLaps: number): LiveGaragePlan {
    const race = liveSessionKind(reading.sessionCode) === 'race';
    // `endEt` is a session time, not a length: what is left is the time to it. Before a race's green flag it is the
    // countdown to the start, not the race (seen live 2026-10-16: 64 s on the grid, the race end only from the green).
    const sessionSeconds = (race && reading.gamePhase < GREEN) || !(reading.endEt > 0 && reading.endEt < 1_000_000) ? null
      : Math.max(0, reading.endEt - Math.max(0, reading.currentEt));
    const estimated = reading.player && reading.player.estimatedLapTime > 0 ? reading.player.estimatedLapTime : null;
    const lapSeconds = classLeaderLapSeconds(reading.player, reading.classLeader) ?? median(this.eventLaps) ?? estimated;
    const plan = planGarage({
      kind,
      sessionSeconds,
      formationLap: race,
      raceLeaderLapSeconds: race ? reading.leader?.estimatedLapTime ?? null : null,
      lapSeconds: lapSeconds === null ? null : round(lapSeconds, 3),
      perLap: resource.perLap,
      perLapSource: resource.perLapSource,
      lapsMeasured: resource.lapsMeasured,
      reserveLaps,
      capacity: resource.capacity,
      setInGarage: kind === 've' ? this.garage?.veStart ?? null : this.garage?.fuelStart ?? null,
    });
    return { ...plan, tyres: this.garageTyres(), tyreCoverage: null };
  }

  private garageTyres(): LiveGarageTyres | null {
    const selected = this.usage?.selected ?? null;
    return selected ? { ...selected, newSets: this.usage?.newSets ?? null } : null;
  }
}
