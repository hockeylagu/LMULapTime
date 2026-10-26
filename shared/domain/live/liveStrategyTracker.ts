import type { LiveLapsLeft, LiveLapRecord, LiveSessionKind } from '../../types/live.js';
import type { LiveGaragePlan, LiveGarageTyres, LivePitInfo, LivePitMenu, LivePitState, LiveRaceStrategies, LiveResourceKind, LiveResourcePlan, LiveStrategy } from '../../types/liveStrategy.js';
import type { SessionStrategy } from '../../types/session.js';
import { LiveDamageTracker, LiveTyreTracker } from './liveCarCondition.js';
import type { LiveCarReading, LiveVehicleCondition } from './liveCarCondition.js';
import { nextForecastChange } from './liveForecast.js';
import type { LiveForecastNode } from './liveForecast.js';
import { liveSessionKind } from './liveLifecycle.js';
import type { LiveScoringReading, LiveState } from './liveLifecycle.js';
import { liveResourceKind, planGarage, planRace, resourceUnit } from './liveResourcePlan.js';
import { LiveUsageMeter } from './liveUsage.js';
import { limitingTyreCoverage, planFuelRatio, savingToFinish } from './liveInsights.js';
import { RAIN_WET_MIN } from '../lapConditions.js';
import { median } from '../pitStops.js';
import type { LiveUsageObservation } from '../../types/liveAudit.js';
import { classLeaderLapSeconds, raceClockRunning } from './liveLapsLeft.js';
import { plannedServiceSeconds, refuelBase, refuelSeconds } from './livePitTime.js';
import { planRaceStrategies } from '../strategy/raceStrategy.js';
import { estimateFromHistory } from '../strategy/strategyHistory.js';
import type { StrategyHistoryEstimate } from '../strategy/strategyHistory.js';
import type { RefuelPart } from './livePitTime.js';
import type { TyreWearProfile, TyreWheelValues } from '../../types/liveStrategy.js';

/** One parsed answer of LMU's local REST API (server/live/lmuPitRest.ts). */
/** The garage's selected tyre set, as `TireManagement` reports it. */
export type LiveSelectedTyres = Omit<LiveGarageTyres, 'newSets'>;

export type LiveRestUpdate =
  | { type: 'standings'; veFraction: number | null; fuelFraction: number | null; pitState: LivePitState; penalties: number }
  | { type: 'estimate'; total: number; damage: number; penalties: number; fuel: number; ve: number; tires: number }
  /** The pit rules: random delays (s), fill rates (litres or % VE a second) and the insert times of a refuel (s). */
  | { type: 'pitStopTimes'; fixRandom: number; fuelRandom: number; tireRandom: number; veRandom: number;
    fuelFillRate: number; veFillRate: number; fuelInsert: number; veInsert: number;
    /** Seconds to change four tyres (`FourTireChange`, 12 at Le Mans 2026-10-22); added to the refuel, null when absent. */
    fourTyreChange?: number | null }
  | { type: 'pitMenu'; menu: LivePitMenu }
  | { type: 'condition'; condition: LiveVehicleCondition }
  | { type: 'tireManagement'; vePerLap: number | null; fuelPerLap: number | null; newSets: number | null; selected: LiveSelectedTyres | null }
  | { type: 'garage'; veStart: number | null; fuelStart: number | null; fuelRatio?: number | null }
  | { type: 'forecast'; sessions: Record<string, LiveForecastNode[]> }
  /** The actual weekend (`GetSessionsInfoForEvent`); a race needs an unambiguous length in minutes. */
  | { type: 'schedule'; raceMinutes: number | null; hasQualifying: boolean };

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
  /** The reserve setting, in seconds of driving (`LiveSettings.reserveSeconds`). */
  reserveSeconds: number;
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

/**
 * Builds the `strategy` part of the snapshot from the scoring readings, the player's telemetry (fuel, damage,
 * tyres) and LMU's REST answers. Per-lap use and lap times are kept for the event (same track and car) across its
 * sessions; damage, tyres and pit data belong to one session. The game's track name can be the same for the layouts
 * of one facility (Bahrain GP and Outer): an event resolved to one layout is forgotten when another loads, so
 * no use or lap time crosses layouts (AGENTS.md section 3A). Deterministic: no clock of its own.
 */
export class LiveStrategyTracker {
  public constructor(private readonly correct?: (kind: LiveResourceKind, predicted: number,
    source: 'measured' | 'game', condition: 'dry' | 'wet', compound: string) => { perLap: number; adjustment: number } | null) {}
  /** Raw clean-lap measurements; separate from the rolling estimate used by the planner. */
  public observations(): LiveUsageObservation {
    return { fuel: this.meters.fuel.latestUse, ve: this.meters.ve.latestUse,
      fuelNowLitres: this.car && this.car.fuelCapacityLiters > 0 ? this.car.fuelLiters : null, veNowPercent: this.ve };
  }
  /** Freeze both resources using the same estimator as the live planner, including game fallback. */
  public learningForecasts(): Record<LiveResourceKind, Pick<LiveResourcePlan, 'perLap' | 'perLapSource' | 'lapsMeasured'>> {
    // Always freeze the uncorrected baseline: learning must never recursively fit its own adjustment.
    return { fuel: this.basePerLap('fuel'), ve: this.basePerLap('ve') };
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
  /** Raw 0-255 wetness of the last reading: corrections use the training rule (RAIN_WET_MIN), not the planner's hysteresis. */
  private wetness: number | null = null;
  /** Each wheel's measured wear per lap this event (FL, FR, RL, RR). */
  private eventTyreWear: TyreWheelValues | null = null;
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
  /** The player's resource, known from the first reading (REST answers can come before it). */
  private kind: LiveResourceKind | null = null;
  /** The fixed seconds of each refuel part, learned from the game's estimates (`refuelBase`). */
  private refuelBases: Record<LiveResourceKind, number | null> = { ve: null, fuel: null };
  private delays: Extract<LiveRestUpdate, { type: 'pitStopTimes' }> | null = null;
  private menu: LivePitMenu | null = null;
  private usage: Extract<LiveRestUpdate, { type: 'tireManagement' }> | null = null;
  /**
   * The game's last per-lap estimates for the event: the same car on the same layout, so a new session starts from
   * them instead of nothing until its own tyre screen is read (up to 20 s, often after the car has left the garage).
   * Dropped with the measured use when the track turns wet or dry.
   */
  private eventEstimate: Pick<Extract<LiveRestUpdate, { type: 'tireManagement' }>, 'vePerLap' | 'fuelPerLap'> | null = null;
  private garage: Extract<LiveRestUpdate, { type: 'garage' }> | null = null;
  private forecast: Record<string, LiveForecastNode[]> | null = null;
  private schedule: Extract<LiveRestUpdate, { type: 'schedule' }> | null = null;
  /** The player's earlier races on the layout in the class (`setRaceHistory`), for the race plan before event laps. */
  private raceHistory: SessionStrategy[] = [];
  private tyreProfile: TyreWearProfile | null = null;

  public setTyreWearProfile(profile: TyreWearProfile | null): void { this.tyreProfile = profile; }

  public tyreCompound(): string | null { return this.usage?.selected?.compound ?? this.car?.compound ?? null; }
  /** The stored pit lane loss of the layout and class (`setPitLaneLoss`), for the race plan's stop time. */
  private pitLaneLoss: number | null = null;

  /** The player's earlier races on this layout in this class, newest first; empty on another layout or class. */
  public setRaceHistory(races: SessionStrategy[]): void {
    this.raceHistory = races;
  }

  /** The stored pit lane loss of the loaded layout and class (median of the newest stops); null when none. */
  public setPitLaneLoss(seconds: number | null): void {
    this.pitLaneLoss = seconds;
  }

  /** Forgets everything (the game closed). */
  public reset(): void {
    this.eventKey = null;
    this.eventLayout = null;
    this.schedule = null;
    this.meters.ve.clear();
    this.meters.fuel.clear();
    this.eventLaps = [];
    this.ratios = []; this.wet = null; this.wetness = null; this.eventTyreWear = null; this.eventCompound = ''; this.ratioOptions = []; this.eventEstimate = null;
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
    this.refuelBases = { ve: null, fuel: null };
    this.menu = null;
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
        this.learnRefuelBases(update);
        this.damage.updateEstimate(update.damage, update.penalties);
        return;
      case 'pitStopTimes': this.delays = update; return;
      case 'pitMenu':
        this.menu = update.menu;
        if (update.menu.fuelRatioOptions) this.ratioOptions = update.menu.fuelRatioOptions;
        return;
      case 'condition':
        this.damage.updateCondition(update.condition);
        return;
      case 'tireManagement':
        this.usage = update;
        if (update.vePerLap !== null || update.fuelPerLap !== null) this.eventEstimate = { vePerLap: update.vePerLap, fuelPerLap: update.fuelPerLap };
        return;
      case 'garage': this.garage = update; return;
      case 'forecast': this.forecast = update.sessions; return;
      case 'schedule': this.schedule = update; return;
    }
  }

  /** Follows one scoring reading; returns the strategy for the snapshot, null while no session is loaded. */
  public update(reading: LiveScoringReading | null, state: LiveState, context: LiveStrategyContext): LiveStrategy | null {
    // The menu ends the session, not the event: the same car back on the same track keeps its measured use and ratios.
    if (state.lifecycle === 'menu') {
      this.resetSession(); this.sessionKey = null;
      // Another server can use the same track and car: wait for its own weekend, even when estimates are retained.
      this.schedule = null;
      return null;
    }
    if (state.lifecycle === 'offline') { this.reset(); return null; }
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
      this.eventEstimate = null;
      this.tyres.reset();
    }
    this.wet = wet;
    this.wetness = level;
    this.followLaps(reading, context.latestLap);
    const fuelUse = this.meters.fuel.latestUse;
    const veUse = this.meters.ve.latestUse;
    if (fuelUse && veUse && fuelUse.lap === veUse.lap && fuelUse.et === veUse.et) {
      const pair = `${veUse.lap}|${veUse.et}`;
      if (pair !== this.lastPair) { this.ratios = [...this.ratios, fuelUse.amount / veUse.amount].slice(-30); this.lastPair = pair; }
    }
    const kind = liveResourceKind(context.carClass);
    this.kind = kind;
    const reserveLaps = this.reserveLaps(context.reserveSeconds, reading);
    const resource = this.resource(kind, reading, state, context, reserveLaps);
    const lapsLeft = context.lapsLeft?.laps ?? null;
    const tyres = this.tyres.tyres(this.car?.compound ?? null, this.car?.tread, this.usage?.newSets ?? null);
    const wheelWear = tyres.wheels?.map(wheel => wheel.wearPerLap) ?? [];
    if (wheelWear.length === 4 && wheelWear.every(value => value !== null) && wheelWear.some(value => value > 0)) {
      this.eventTyreWear = wheelWear as TyreWheelValues;
    }
    const fraction = reading.trackLength > 0 ? Math.min(1, Math.max(0, player.lapDist / reading.trackLength)) : 0;
    if (lapsLeft !== null) {
      const race = resource.race;
      const toPit = race?.pitInLaps != null ? race.pitInLaps + 1 - fraction : lapsLeft - fraction;
      tyres.coverage = limitingTyreCoverage(tyres.wheels?.map(wheel => wheel.tread) ?? [], wheelWear, toPit, lapsLeft - fraction,
        race?.finishReachable ? 'finish' : 'pit', tyres.newSets);
    }
    // The grid keeps the plan: before the start the driver can still go back to the garage and change the load.
    const garage = state.lifecycle === 'garage' || state.lifecycle === 'starting' ? this.garagePlan(kind, reading, resource, reserveLaps) : null;
    if (garage?.tyres && garage.laps !== null) {
      const wear = this.planTyreWear(kind);
      const tread = garage.tyres.tread ?? [0, 1, 2, 3].map(() => garage.tyres!.wear);
      garage.tyreCoverage = wear ? limitingTyreCoverage(tread, wear, garage.laps, garage.laps, 'finish', garage.tyres.newSets) : null;
    }
    const fuelRatio = kind === 've' ? planFuelRatio({ ratios: this.ratios,
      fuelPerLap: this.ratios.length >= 3 ? this.perLap('fuel').perLap : this.gameEstimate('fuel'),
      vePerLap: this.ratios.length >= 3 ? this.perLap('ve').perLap : this.gameEstimate('ve'),
      garageSetting: this.garage?.fuelRatio ?? null, mfdSetting: state.lifecycle === 'garage' ? null : this.menu?.fuelRatio ?? null,
      options: this.ratioOptions, veTarget: garage?.needed ?? resource.race?.neededAfterStop ?? null,
      fuelNow: state.lifecycle === 'garage' ? null : this.car?.fuelLiters ?? null, veNow: state.lifecycle === 'garage' ? null : this.ve,
    }) : null;
    return {
      resource: state.lifecycle === 'garage' ? null : resource,
      pit: state.lifecycle === 'garage' ? null : this.pit(state.session.kind === 'race' ? this.lapsToStop(resource, fraction) : null,
        resource.race?.neededAfterStop ?? null),
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
    if (this.completedLaps === null) {
      this.completedLaps = player.totalLaps;
      this.lapExcluded = player.inPits;
    } else if (player.totalLaps > this.completedLaps) {
      // The lap's own validity, not `countLapFlag` along it: the flag drops to 1 for a second or two on laps the game
      // still counts (COTA race 2026-10-20: 8 of 11 valid laps went unmeasured).
      const invalid = latestLap !== null && (latestLap.lapNumber !== player.totalLaps || !latestLap.valid);
      const excluded = this.lapExcluded || player.inPits || invalid;
      for (const meter of Object.values(this.meters)) meter.addCrossing(player.totalLaps, player.lapStartEt, excluded);
      this.tyres.lapCompleted(this.car?.tread);
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

  /** The game's per-lap estimate: this session's tyre screen, else the event's last one. */
  private gameEstimate(kind: LiveResourceKind): number | null {
    return kind === 've' ? this.usage?.vePerLap ?? this.eventEstimate?.vePerLap ?? null
      : this.usage?.fuelPerLap ?? this.eventEstimate?.fuelPerLap ?? null;
  }

  private basePerLap(kind: LiveResourceKind): Pick<LiveResourcePlan, 'perLap' | 'perLapSource' | 'lapsMeasured'> {
    const meter = this.meters[kind];
    const measured = meter.perLap();
    if (measured !== null) return { perLap: round(measured, 2), perLapSource: 'measured', lapsMeasured: meter.laps.length };
    const game = this.gameEstimate(kind);
    return { perLap: game !== null && game > 0 ? round(game, 2) : null, perLapSource: game !== null && game > 0 ? 'game' : null, lapsMeasured: 0 };
  }

  /** What the player's earlier races on the layout in the class measured (dry only: the races do not say their conditions). */
  private history(kind: LiveResourceKind): StrategyHistoryEstimate | null {
    return this.wet ? null : estimateFromHistory(this.raceHistory, kind, this.eventCompound || this.usage?.selected?.compound || null);
  }

  /**
   * The use per lap: the event's own laps, else the player's earlier races here, else the game's estimate with its
   * learned correction (fitted to the game's estimate, not to the races). The learning keeps the uncorrected
   * baseline (`learningForecasts`), never the history.
   */
  private perLap(kind: LiveResourceKind): Pick<LiveResourcePlan, 'perLap' | 'perLapSource' | 'lapsMeasured' | 'learning'> {
    const base = this.basePerLap(kind);
    const history = base.perLapSource === 'measured' ? null : this.history(kind)?.perLap ?? null;
    if (history !== null) return { perLap: history, perLapSource: 'history', lapsMeasured: 0 };
    const correction = base.perLap !== null && base.perLapSource !== null && base.perLapSource !== 'history' && this.wetness !== null && this.eventCompound
      ? this.correct?.(kind, base.perLap, base.perLapSource, this.wetness >= RAIN_WET_MIN ? 'wet' : 'dry', this.eventCompound) : null;
    return correction && Number.isFinite(correction.perLap) && correction.perLap > 0
      ? { ...base, perLap: correction.perLap, learning: { baselinePerLap: base.perLap!, adjustment: correction.adjustment } } : base;
  }

  /**
   * The reserve setting as laps at the player's pace (the event's valid laps, else the game's estimate); half a lap
   * while no lap time is known. Seconds keep a long lap from holding a large reserve (Le Mans race 2026-10-23: half a
   * lap was 4 % VE, about 1.6 s of refuel, against a use that varied by 0.15 % a lap).
   */
  private reserveLaps(seconds: number, reading: LiveScoringReading): number {
    const estimate = reading.player && reading.player.estimatedLapTime > 0 ? reading.player.estimatedLapTime : null;
    const lapSeconds = median(this.eventLaps) ?? estimate;
    return lapSeconds === null ? 0.5 : round(Math.max(0, seconds) / lapSeconds, 2);
  }

  private resource(kind: LiveResourceKind, reading: LiveScoringReading, state: LiveState, context: LiveStrategyContext,
    reserveLaps: number): LiveResourcePlan {
    const player = reading.player;
    const amount = this.amount(kind);
    const capacity = this.capacity(kind);
    const usage = this.perLap(kind);
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
        ? savingToFinish(amount, perLap, Math.max(0, lapsLeft - lapFraction), usage.perLapSource) : null,
    };
  }

  /** Laps to the line of the next stop: this lap's once requested or without a planned stop, else the planned one. */
  private lapsToStop(resource: LiveResourcePlan, fraction: number): number {
    const pitInLaps = this.pitState === 'none' ? resource.race?.pitInLaps ?? 0 : 0;
    return pitInLaps + 1 - fraction;
  }

  /**
   * What each refuel part adds from these amounts up to the MFD target: VE and its fuel (`target x ratio` litres) on
   * a VE car, fuel on the others. Null parts are unknown.
   */
  private refuelAdded(ve: number | null, fuel: number | null, target = this.menu?.resourceValue ?? null): Record<LiveResourceKind, number | null> {
    if (target === null || this.kind === null) return { ve: null, fuel: null };
    if (this.kind === 'fuel') return { ve: null, fuel: fuel === null ? null : target - fuel };
    const ratio = this.menu?.fuelRatio ?? null;
    return { ve: ve === null ? null : target - ve, fuel: ratio && fuel !== null ? target * ratio - fuel : null };
  }

  /** Seconds per unit of a refuel and its fixed part (`RefuelPart`, nothing added yet); null without the fill rate. */
  private refuelRate(kind: LiveResourceKind): Omit<RefuelPart, 'added'> | null {
    const perUnit = this.fillSeconds(kind);
    const insert = kind === 've' ? this.delays?.veInsert : this.delays?.fuelInsert;
    return perUnit === null ? null : { secondsPerUnit: perUnit, base: this.refuelBases[kind] ?? insert ?? 0 };
  }

  private fillSeconds(kind: LiveResourceKind): number | null {
    const rate = kind === 've' ? this.delays?.veFillRate : this.delays?.fuelFillRate;
    return rate && rate > 0 ? 1 / rate : null;
  }

  private learnRefuelBases(estimate: Extract<LiveRestUpdate, { type: 'estimate' }>): void {
    const added = this.refuelAdded(this.ve, this.car && this.car.fuelCapacityLiters > 0 ? this.car.fuelLiters : null);
    for (const kind of ['ve', 'fuel'] as const) {
      const perUnit = this.fillSeconds(kind);
      const base = perUnit !== null && added[kind] !== null ? refuelBase(estimate[kind], added[kind]!, perUnit) : null;
      if (base !== null) this.refuelBases[kind] = base;
    }
  }

  /**
   * The game's estimate is for a stop made now; the planned stop refuels from the amounts left at its pit entry,
   * `lapsToStop` laps of use from now, up to `target` (the MFD's by default). In the pit lane (and outside a race)
   * the game's estimate stands.
   */
  private service(estimate: Extract<LiveRestUpdate, { type: 'estimate' }>, lapsToStop: number | null,
    target = this.menu?.resourceValue ?? null): { seconds: number; refuels: boolean } {
    const game = { seconds: estimate.total, refuels: estimate.fuel > 0 || estimate.ve > 0 };
    if (lapsToStop === null || (this.pitState !== 'none' && this.pitState !== 'request')) return game;
    const fuelNow = this.car && this.car.fuelCapacityLiters > 0 ? this.car.fuelLiters : null;
    const atEntry = (now: number | null, kind: LiveResourceKind): number | null => {
      const perLap = this.perLap(kind).perLap;
      return now === null || perLap === null ? null : Math.max(0, now - perLap * lapsToStop);
    };
    const added = this.refuelAdded(atEntry(this.ve, 've'), atEntry(fuelNow, 'fuel'), target);
    const parts: RefuelPart[] = [];
    for (const kind of ['ve', 'fuel'] as const) {
      const perUnit = this.fillSeconds(kind);
      const insert = kind === 've' ? this.delays?.veInsert : this.delays?.fuelInsert;
      if (perUnit !== null && added[kind] !== null) parts.push({ added: added[kind]!, secondsPerUnit: perUnit, base: this.refuelBases[kind] ?? insert ?? 0 });
    }
    return parts.length === 0 ? game
      : { seconds: plannedServiceSeconds(estimate, parts), refuels: parts.some(part => refuelSeconds(part) > 0) };
  }

  /** `neededAfterStop`: the plan's need after the next stop, which prices the planned stop whatever the MFD says. */
  private pit(lapsToStop: number | null, neededAfterStop: number | null): LivePitInfo {
    const estimate = this.estimate;
    const penalties = Math.max(this.penalties, estimate?.penalties ? 1 : 0);
    const planned = estimate && penalties === 0 ? this.service(estimate, lapsToStop) : null;
    const plannedStop = estimate && penalties === 0 && lapsToStop !== null && neededAfterStop !== null
      ? this.service(estimate, lapsToStop, neededAfterStop).seconds : null;
    const service = planned?.seconds ?? null;
    const delays = this.delays;
    const random = estimate && delays
      ? (estimate.damage > 0 ? delays.fixRandom : 0)
        + (planned?.refuels ? Math.max(delays.fuelRandom, delays.veRandom) : 0)
        + (estimate.tires > 0 ? delays.tireRandom : 0)
      : 0;
    return {
      state: this.pitState,
      penalties,
      serviceSeconds: service === null ? null : round(service, 0),
      serviceMaxSeconds: service === null ? null : round(service + random, 0),
      plannedServiceSeconds: plannedStop === null ? null : round(plannedStop, 1),
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

  /** The plan's wear per wheel: the learned profile when dry, else the event's measured wear, else the earlier races'. */
  private planTyreWear(kind: LiveResourceKind): TyreWheelValues | null {
    if (!this.wet && this.tyreProfile) return this.tyreProfile.wheels.map(wheel => wheel.wearPerLap) as TyreWheelValues;
    if (this.eventTyreWear) return this.eventTyreWear;
    const value = this.history(kind)?.wearPerLap ?? null;
    return value === null ? null : [value, value, value, value];
  }

  /** The race plan, on the dashboard's use per lap and the plan's wear (`planTyreWear`). */
  private raceStrategy(kind: LiveResourceKind, lapSeconds: number | null, resource: LiveResourcePlan, reserveLaps: number,
    tyres: LiveGarageTyres | null, qualifyingAhead: boolean): LiveRaceStrategies | null {
    const history = this.history(kind);
    const historyWear = this.eventTyreWear === null ? history?.wearPerLap ?? null : null;
    const strategy = planRaceStrategies({
      kind, raceMinutes: this.schedule?.raceMinutes ?? null, lapSeconds, perLap: resource.perLap, reserveLaps, capacity: resource.capacity,
      qualifyingAhead, tyres, compound: this.eventCompound || tyres?.compound || null,
      wearPerLap: this.planTyreWear(kind), tyreChangeSeconds: this.delays?.fourTyreChange ?? null,
      pitLaneSeconds: this.pitLaneLoss, refuel: this.refuelRate(kind),
    });
    if (!strategy) return null;
    const source = resource.perLapSource;
    const races = Math.max(source === 'history' ? history?.useRaces ?? 0 : 0, historyWear !== null ? history?.wearRaces ?? 0 : 0);
    return { ...strategy, basis: {
      use: source === 'measured' ? 'event' : source,
      wear: !this.wet && this.tyreProfile ? 'learned' : this.eventTyreWear !== null ? 'event' : historyWear !== null ? 'history' : null,
      sessions: !this.wet ? this.tyreProfile?.sessions : undefined, races } };
  }

  private garagePlan(kind: LiveResourceKind, reading: LiveScoringReading, resource: LiveResourcePlan, reserveLaps: number): LiveGaragePlan {
    const race = liveSessionKind(reading.sessionCode) === 'race';
    // `endEt` is a session time, not a length: what is left is the time to it. Before a race's clock runs it is not the
    // race end (`raceClockRunning`), so the race length comes from the event's schedule, unknown until it is read.
    const clockRunning = raceClockRunning(reading.gamePhase, reading.currentEt);
    const raceMinutes = this.schedule?.raceMinutes ?? null;
    const sessionSeconds = race && !clockRunning
      ? (raceMinutes === null ? null : raceMinutes * 60)
      : !(reading.endEt > 0 && reading.endEt < 1_000_000) ? null : Math.max(0, reading.endEt - Math.max(0, reading.currentEt));
    const estimated = reading.player && reading.player.estimatedLapTime > 0 ? reading.player.estimatedLapTime : null;
    const lapSeconds = classLeaderLapSeconds(reading.player, reading.classLeader) ?? median(this.eventLaps) ?? estimated;
    const tyres = this.garageTyres();
    const plan = planGarage({
      kind,
      sessionSeconds,
      race,
      // Once the race clock runs the formation lap is behind: the time left holds racing laps only.
      formationLap: race && !clockRunning,
      raceLeaderLapSeconds: race ? reading.leader?.estimatedLapTime ?? null : null,
      lapSeconds: lapSeconds === null ? null : round(lapSeconds, 3),
      perLap: resource.perLap,
      perLapSource: resource.perLapSource,
      lapsMeasured: resource.lapsMeasured,
      reserveLaps,
      capacity: resource.capacity,
      setInGarage: kind === 've' ? this.garage?.veStart ?? null : this.garage?.fuelStart ?? null,
    });
    const sessionKind = liveSessionKind(reading.sessionCode);
    // Planned from any garage before the race; once the race clock runs it is the race plan's job.
    const raceStrategy = race && clockRunning ? null : this.raceStrategy(kind, plan.lapSeconds, resource, reserveLaps, tyres,
      sessionKind === 'qualifying' || (sessionKind === 'practice' && this.schedule?.hasQualifying === true));
    return { ...plan, ...(resource.learning ? { learning: resource.learning } : {}), tyres, tyreCoverage: null, raceStrategy };
  }

  private garageTyres(): LiveGarageTyres | null {
    const selected = this.usage?.selected ?? null;
    return selected ? { ...selected, newSets: this.usage?.newSets ?? null } : null;
  }
}
