import { Worker } from 'node:worker_threads';
import { LIVE_BASELINE_MODEL_VERSION, LIVE_MODEL_VERSION } from '../../shared/domain/live/liveAudit.js';
import { deriveLiveState, isLiveOnTrack, isLiveSessionLoaded } from '../../shared/domain/live/liveLifecycle.js';
import type { LiveGameScreen, LiveScoringReading, LiveVehicleReading } from '../../shared/domain/live/liveLifecycle.js';
import type { LiveCarReading } from '../../shared/domain/live/liveCarCondition.js';
import type { LiveRaceStrategies } from '../../shared/types/liveStrategy.js';
import type { SessionStrategy } from '../../shared/types/session.js';
import { LiveStrategyTracker } from '../../shared/domain/live/liveStrategyTracker.js';
import { LiveResultTracker } from '../../shared/domain/live/liveResults.js';
import type { LiveRestUpdate } from '../../shared/domain/live/liveStrategyTracker.js';
import type { PersonalBestLookup } from '../../shared/domain/live/liveIdentity.js';
import type { PitLaneLossRow } from '../core/live/dbPitLaneStore.js';
import { LiveSessionTracker, NO_SESSION_DETAILS } from '../../shared/domain/live/liveSessionTracker.js';
import { DEFAULT_LIVE_SETTINGS, LIVE_HEARTBEAT_MS, LIVE_STREAM_EVENTS } from '../../shared/types/live.js';
import type { LiveLifecycle, LivePedalBatch, LivePedalSample, LiveSessionKind, LiveSnapshot, LiveTiming } from '../../shared/types/live.js';
import { TypedEmitter } from '../core/typedEmitter.js';
import { findWorkerBootstrap, isWorkerMessage } from '../core/workerThreads.js';
import type { LiveReaderMessage } from './liveReader.js';
import { LiveIdentityResolver } from './liveIdentityResolver.js';
import type { LiveIdentityOptions } from './liveIdentityResolver.js';
import { LivePitPoller } from './livePitPoller.js';
import { parseNavigationState } from './lmuNavigation.js';
import type { LivePitPollerOptions, PitPollMode } from './livePitPoller.js';
import { writeSseEvent } from './sse.js';
import type { SseSink } from './sse.js';
import type { LiveCaptureController } from './capture/controller.js';
import { FieldDiagnosticsLog } from './capture/fieldDiagnostics.js';
import { LiveLearningCapture } from '../../shared/domain/learning/capture.js';
import type { AutomaticLearningRuntime } from './learning/runtime.js';
import type { TyreWearProfile } from '../../shared/types/liveStrategy.js';

/** How often buffered pedal samples go out to the pages (about 25 batches a second). */
export const PEDAL_FLUSH_MS = 40;
/** Samples kept between two flushes; more than this means the reader outruns the stream, and the oldest go. */
const MAX_BUFFERED_PEDALS = 250;
/** `timing` events go out at most this often (the scoring buffer itself updates 5 times a second). */
export const TIMING_MIN_INTERVAL_MS = 100;
const WORKER_RESTART_MS = 3000;
/** How long a stop waits for the reader's last capture rows. */
const READER_DRAIN_MS = 1000;

export type LiveWorker = Pick<Worker, 'on' | 'postMessage' | 'terminate' | 'unref'>;

interface LiveClient {
  /** The sink's buffer is full: nothing is written to it until 'drain' (it must never slow the reader). */
  blocked: boolean;
}

export interface LiveServiceOptions {
  learning?: AutomaticLearningRuntime;
  /** Durable capture also keeps safe REST polling alive without dashboard subscribers. */
  capture?: LiveCaptureController;
  /** Replaces the shared memory worker (tests). */
  createWorker?: () => LiveWorker;
  /** The player's personal record on a layout and class, from the app's history. Without it no record is shown. */
  personalBest?: PersonalBestLookup;
  /** Replaces the identity resolver's REST read and clock (tests). */
  identity?: Pick<LiveIdentityOptions, 'readNavigation' | 'now'>;
  /** Replaces the pit poller's REST read and clock (tests). */
  pit?: Pick<LivePitPollerOptions, 'get' | 'now'>;
  /** VE or fuel reserve in laps (the live settings); half a lap without it. Changed later with `setReserveLaps`. */
  reserveSeconds?: number;
  /** The stored pit lane loss per layout and class (`server/core/live/dbPitLaneStore.ts`); none without it. */
  pitLane?: {
    read(layoutKey: string, carClass: string): number | null;
    record(row: PitLaneLossRow): void;
  };
  /** Saves the race plan shown before the start with the race recording (`server/core/live/dbRacePlanStore.ts`). */
  racePlan?: (recordingId: string, plan: LiveRaceStrategies) => void;
  /** The player's earlier races on a layout in a class, measured (`readStrategyHistory`); none without it. */
  raceHistory?: (layoutKey: string, carClass: string) => Promise<SessionStrategy[]>;
  tyreWearProfile?: (layoutKey: string, carModel: string, compound: string, driverName: string, signal: AbortSignal) => Promise<TyreWearProfile | null>;
  tyreWearRevision?: () => string;
  /** The data plugin's hybrid deployment settings in kW for a car model and class; none without a plugin record. */
  deploymentKw?: (carModel: string, carClass: string) => readonly number[] | null;
}

function offlineSnapshot(): LiveSnapshot {
  return {
    sequence: 0, receivedAt: Date.now(), lifecycle: 'offline', session: null, identity: null,
    ...NO_SESSION_DETAILS, loadingProgress: null, strategy: null,
  };
}


/** What makes two snapshots the same to a page: everything but the sequence, the receipt time and the moving session clock. */
const contentKey = (snapshot: Omit<LiveSnapshot, 'sequence' | 'receivedAt'>): string =>
  JSON.stringify({ ...snapshot, session: snapshot.session && { ...snapshot.session, elapsedSeconds: 0 } });

/**
 * Owns the shared memory worker, the current snapshot and the pages connected to the live stream.
 * A page gets the snapshot on connect and on every change, pedal batches while the driver is on track,
 * and a heartbeat. A page that cannot keep up misses batches; the reader is never held back by it.
 */
export class LiveService {
  public readonly events = new TypedEmitter<{ lifecycle: [LiveLifecycle]; 'session-loaded': [boolean]; 'game-running': [boolean]; snapshot: [LiveSnapshot] }>();
  private processRunning: boolean | null = null;
  private reportedRunning = false;
  private snapshot: LiveSnapshot = offlineSnapshot();
  private snapshotKey = contentKey(this.snapshot);
  private readonly tracker = new LiveSessionTracker();
  private readonly identity: LiveIdentityResolver;
  private pendingTiming: LiveTiming | null = null;
  private lastTimingAt = 0;
  private lastTimingDiagnosticAt = -Infinity;
  private tyreSurfaceAvgC: number | null = null;
  private readonly strategy = new LiveStrategyTracker((kind, predicted, source, condition, compound) => {
    const player = this.lastReading?.player;
    if (!player) return null;
    return this.options.learning?.correct(kind, predicted, {
      layoutKey: this.identity.identity?.layoutKey ?? null, vehicleModel: this.identity.identity?.vehicleModel ?? null,
      driverName: player.driverName ?? '', condition, compound, modelVersion: LIVE_BASELINE_MODEL_VERSION, predictionSource: source,
    }) ?? null;
  });
  private readonly results = new LiveResultTracker();
  private lastDiagnosticStrategyAt = -Infinity;
  private readonly fieldLog = new FieldDiagnosticsLog();
  /** The latest car reading, for the player's gap fields in the diagnostic field line. */
  private lastCar: LiveCarReading | null = null;
  private readonly learning = new LiveLearningCapture();
  private pitLaneKey: string | null = null;
  private pitLaneSession = 0;
  /** The race's plan from before the start, and the recording it was last saved with. */
  private raceHistoryKey: string | null = null;
  private tyreWearKey: string | null = null;
  private deploymentKey: string | null = null;
  private readonly tyreWearCache = new Map<string, TyreWearProfile | null>();
  private readonly tyreWearPending = new Set<string>();
  private tyreWearRead: AbortController | null = null;
  private racePlan: { plan: LiveRaceStrategies; json: string; savedFor: string | null } | null = null;
  private readonly pit: LivePitPoller;
  /** The last scoring reading, kept so a navigation notice or a REST answer can re-derive the snapshot without a new frame. */
  private lastReading: LiveScoringReading | null = null;
  private screen: LiveGameScreen = 'session';
  private loadingProgress: number | null = null;
  /**
   * A replay playing (`navigation/state` `settingMode`): it is not live driving. The reader asks every 2 s, and the
   * pit poller's state check says it too; both are fresh reads, so the newest wins. A failed check says nothing.
   */
  private replay = false;
  /** The last `session-loaded` value sent. */
  private sessionLoaded = false;
  private reserveSeconds: number;
  private carDamaged = false;
  /** The car's last impact time; null until the first car reading, so an old impact triggers nothing. */
  private lastImpactEt: number | null = null;
  private readonly clients = new Map<SseSink, LiveClient>();
  private pedals: LivePedalSample[] = [];
  private worker: LiveWorker | null = null;
  private stopped = true;
  private flushTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;

  private markFirstReading: () => void = () => {};
  /** Settles on the reader's first answer (game found or not), so file scans can wait for it. */
  public readonly firstReading = new Promise<void>(resolve => { this.markFirstReading = resolve; });

  public constructor(private readonly options: LiveServiceOptions = {}) {
    this.reserveSeconds = options.reserveSeconds ?? DEFAULT_LIVE_SETTINGS.reserveSeconds;
    this.identity = new LiveIdentityResolver({
      ...options.identity,
      personalBest: options.personalBest ?? (() => null),
      onChange: () => this.publish({ ...this.snapshot, identity: this.identity.identity }),
    });
    this.pit = new LivePitPoller({
      ...options.pit,
      diagnosticSink: () => this.options.capture?.diagnostics?.sink(),
      onUpdate: update => this.applyRest(update),
      onEvidence: observation => {
        if (!this.isReplaying()) this.record(() => this.options.capture?.observe(observation));
      },
      onNavigation: body => {
        const navigation = parseNavigationState(body);
        if (navigation) this.identity.offerNavigation(navigation);
      },
      onReplay: active => {
        if (active === null) return;
        this.setReplay(active);
      },
    });
  }

  public getSnapshot(): LiveSnapshot { return this.snapshot; }
  public isGameRunning(): boolean { return this.processRunning ?? this.snapshot.lifecycle !== 'offline'; }

  private publishRunning(): void {
    const running = this.isGameRunning();
    if (running === this.reportedRunning) return;
    this.reportedRunning = running;
    this.events.emit('game-running', running);
  }

  /** The reserve setting (seconds of driving) changed: the plan follows at once. */
  public setReserveSeconds(seconds: number): void {
    this.reserveSeconds = seconds;
    this.applyReading(this.lastReading);
  }
  public hasClients(): boolean { return this.clients.size > 0; }
  /**
   * A session is loaded in the game, so the game may be writing its files. A replay counts too: the page shows it
   * as the menu, but one started from a session's monitor leaves that session loaded (and one from the main menu
   * cannot be told apart from it, so holding the scans until it ends costs only that wait).
   */
  public isSessionLoaded(): boolean { return isLiveSessionLoaded(this.snapshot.lifecycle) || this.isReplaying(); }

  private isReplaying(): boolean { return this.replay && this.lastReading !== null && this.screen === 'session'; }

  public start(): void {
    if (this.worker) return;
    this.stopped = false;
    const worker = this.options.createWorker?.()
      ?? new Worker(findWorkerBootstrap(import.meta.url, ['live', 'liveReaderWorkerBootstrap.mjs']),
        { workerData: { diagnostics: this.options.capture?.diagnostics !== undefined } });
    this.worker = worker;
    worker.unref();
    worker.on('message', (message: unknown) => {
      if (this.worker === worker) this.handleMessage(message);
    });
    const lost = (reason: string): void => {
      if (this.worker !== worker) return;
      // Active races keep reader failures in their diagnostic sidecar. Surface startup failures
      // in the server console when there is no session diagnostic sink yet.
      if (!this.options.capture?.diagnostics?.sink()) console.warn(`[Live] Shared memory reader ${reason}`);
      this.record(() => {
        this.options.capture?.diagnostics?.record({ kind: 'reader-failure', at: Date.now(), data: { reason } });
        this.options.capture?.observe({ source: 'recorder', kind: 'failure', elapsedSeconds: null, receivedAt: Date.now(),
          data: { path: 'shared-memory-reader', outcome: reason } });
      });
      this.worker = null;
      this.processRunning = null;
      this.handleMessage({ type: 'closed' });
      this.publishRunning();
      if (this.stopped) return;
      this.restartTimer = setTimeout(() => this.start(), WORKER_RESTART_MS);
      this.restartTimer.unref();
    };
    worker.on('error', (error: Error) => lost(`failed: ${error.message}`));
    worker.on('exit', (code: number) => lost(`exited with code ${code}`));
  }

  public stop(): Promise<void> {
    this.tyreWearRead?.abort();
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.clearTimers();
    this.identity.stop();
    this.pit.stop();
    const worker = this.worker;
    this.worker = null;
    const drained = worker ? this.drainReader(worker) : Promise.resolve();
    return drained.then(() => this.options.capture?.stop());
  }

  /**
   * The reader holds up to half a second of capture rows: they are taken before the recording closes. It answers
   * `stopped` after posting them; an exit or a reader that does not answer in time ends the wait.
   */
  private drainReader(worker: LiveWorker): Promise<void> {
    return new Promise<void>(resolve => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        void worker.terminate();
        resolve();
      };
      const timeout = setTimeout(finish, READER_DRAIN_MS);
      timeout.unref();
      worker.on('message', (message: unknown) => {
        if (done || !isWorkerMessage<{ type: 'capture' | 'stopped' }>(message, ['capture', 'stopped'])) return;
        if (message.type === 'stopped') finish();
        else this.handleMessage(message);
      });
      worker.on('exit', finish);
      worker.postMessage({ type: 'stop' });
    });
  }

  /** Registers a page: it gets the current snapshot now. Returns the function that removes it. */
  public addClient(sink: SseSink): () => void {
    this.clients.set(sink, { blocked: false });
    this.ensureTimers();
    this.followPitMode();
    this.send(sink, LIVE_STREAM_EVENTS.snapshot, this.snapshot);
    return () => this.removeClient(sink);
  }

  /** The last page gone stops the flush timers and the pit poller. */
  private removeClient(sink: SseSink): void {
    if (!this.clients.delete(sink)) return;
    if (this.clients.size === 0) this.clearTimers();
    this.followPitMode();
  }

  private handleMessage(message: unknown): void {
    if (!isWorkerMessage<LiveReaderMessage>(message, ['frame', 'capture', 'navigation', 'closed', 'process', 'diagnostic'])) return;
    if (message.type === 'diagnostic') {
      this.record(() => this.options.capture?.diagnostics?.record(message.event));
      return;
    }
    if (message.type === 'process') {
      this.record(() => this.options.capture?.diagnostics?.record({ kind: 'game-process', at: Date.now(), data: message }));
      this.processRunning = message.running;
      this.publishRunning();
      return;
    }
    if (message.type === 'capture') {
      const { batch } = message;
      if (!this.isReplaying() && this.snapshot.session?.inRealtime) this.record(() => this.options.capture?.samples(batch));
      return;
    }
    this.markFirstReading();
    if (message.type === 'closed') {
      this.replay = false;
      this.screen = 'session';
      this.loadingProgress = null;
      this.carDamaged = false;
      this.lastImpactEt = null;
      this.strategy.reset();
      this.applyReading(null);
      return;
    }
    if (message.type === 'navigation') {
      this.record(() => this.options.capture?.diagnostics?.record({ kind: 'navigation', at: Date.now(), data: message }));
      // A replay is a session screen whose frames are not the session's (applyReading shows it as the menu).
      this.screen = message.screen === 'replay' ? 'session' : message.screen;
      this.loadingProgress = message.loadingProgress;
      this.setReplay(message.screen === 'replay');
      return;
    }
    if (this.isReplaying()) return;
    if (message.tyreSurfaceAvgC !== undefined) this.tyreSurfaceAvgC = message.tyreSurfaceAvgC;
    if (message.car) {
      this.lastCar = message.car;
      this.strategy.applyCar(message.car);
      this.followCar(message.car);
    }
    const before = this.lastReading?.player ?? null;
    if (message.scoring) this.applyReading(message.scoring);
    else if (message.car) this.applyReading(this.lastReading);
    if (message.scoring) this.followPlayer(before, message.scoring.player);
    if (message.pedal) this.bufferPedal(message.pedal);
    const { car } = message;
    if (car) this.record(() => this.options.capture?.observe({ source: 'shared-memory', kind: 'car-condition',
      elapsedSeconds: message.pedal?.t ?? this.lastReading?.currentEt ?? null, receivedAt: Date.now(), data: {
        fuelCapacityLitres: car.fuelCapacityLiters,
        dents: car.dentSeverity, detached: car.detached, lastImpactEt: car.lastImpactEt, compound: car.compound,
      } }));
    // Exploration: the limiter as the game reports it, a line only when it changes.
    if (car?.limiter) this.record(() => this.options.capture?.diagnostics?.record({ kind: 'player-limiter', at: Date.now(), data: car.limiter }));
  }

  /**
   * The stored pit lane loss follows the exact layout and class (never a guess: none while either is unknown); a stop
   * measured on them is stored and the median read again. A storage failure only loses that stop.
   */
  private followPitLane(layoutKey: string | null, carClass: string | null): void {
    const store = this.options.pitLane;
    if (!store) return;
    const key = layoutKey && carClass ? `${layoutKey}|${carClass}` : null;
    const measured = this.tracker.takeLaneLoss();
    try {
      if (measured && layoutKey && carClass) {
        const recordingId = this.options.capture?.status().recordingId ?? `live-${this.pitLaneSession}`;
        store.record({ stopKey: `${recordingId}|${measured.inLap}`, layoutKey, carClass, lossSeconds: measured.seconds, measuredAt: Date.now() });
      }
      if (key !== this.pitLaneKey || measured) {
        if (key !== this.pitLaneKey) this.pitLaneSession = Date.now();
        this.pitLaneKey = key;
        const loss = layoutKey && carClass ? store.read(layoutKey, carClass) : null;
        this.tracker.setStoredLaneLoss(loss);
        this.strategy.setPitLaneLoss(loss);
      }
    } catch (error) {
      console.warn('[Live] Pit lane loss store failed:', error);
    }
  }

  /**
   * The race plan learns from the player's earlier races on the exact layout in the exact class, read once when they
   * resolve (never a guess: none while either is unknown). An answer for a key no longer current is dropped; a failed
   * read leaves the plan on the event's laps and the game's estimate.
   */
  private followRaceHistory(layoutKey: string | null, carClass: string | null): void {
    const read = this.options.raceHistory;
    const key = layoutKey && carClass ? `${layoutKey}|${carClass}` : null;
    if (!read || key === this.raceHistoryKey) return;
    this.raceHistoryKey = key;
    this.strategy.setRaceHistory([]);
    if (!layoutKey || !carClass) return;
    read(layoutKey, carClass).then(races => {
      if (this.raceHistoryKey === key) this.strategy.setRaceHistory(races);
    }, (error: unknown) => console.warn('[Live] Race history read failed:', error));
  }

  /** The plugin's kW list for the loaded car, looked up once per car and class. */
  private followDeploymentKw(carModel: string | null, carClass: string | null): void {
    const key = carModel && carClass ? `${carModel}|${carClass}` : null;
    if (key === this.deploymentKey) return;
    this.deploymentKey = key;
    this.strategy.setDeploymentKw(key && carModel && carClass ? this.options.deploymentKw?.(carModel, carClass) ?? null : null);
  }

  /** Cohort reads only start in the garage; cached answers cannot cross layout, model, driver or compound. */
  private followTyreWear(layoutKey: string | null, carModel: string | null, compound: string | null,
    driverName: string | null, lifecycle: LiveLifecycle): void {
    const read = this.options.tyreWearProfile;
    const key = layoutKey && carModel && compound && driverName
      ? JSON.stringify([layoutKey, carModel, compound, driverName, this.options.tyreWearRevision?.() ?? '']) : null;
    if (lifecycle !== 'garage' || key !== this.tyreWearKey) this.tyreWearRead?.abort();
    this.tyreWearKey = key;
    this.strategy.setTyreWearProfile(key ? this.tyreWearCache.get(key) ?? null : null);
    if (!read || !key || !layoutKey || !carModel || !compound || !driverName || lifecycle !== 'garage'
      || this.tyreWearCache.has(key) || this.tyreWearPending.has(key)) return;
    this.tyreWearPending.add(key);
    const controller = new AbortController();
    this.tyreWearRead = controller;
    read(layoutKey, carModel, compound, driverName, controller.signal).then(profile => {
      this.tyreWearPending.delete(key);
      if (controller.signal.aborted) return;
      this.tyreWearCache.set(key, profile);
      if (this.tyreWearKey === key) this.strategy.setTyreWearProfile(profile);
    }, (error: unknown) => {
      this.tyreWearPending.delete(key);
      if (controller.signal.aborted) return;
      this.tyreWearCache.set(key, null);
      console.warn('[Live] Tyre wear profile read failed:', error);
    });
  }

  /**
   * The race plan shown before the start (it is null once the clock runs) is saved with the race recording, once it
   * exists (it may begin only at the green) and whenever the plan changed; another session forgets it. A storage
   * failure only loses the plan vs actual.
   */
  private followRacePlan(kind: LiveSessionKind | null, plan: LiveRaceStrategies | null): void {
    if (kind !== 'race') {
      this.racePlan = null;
      return;
    }
    const json = plan ? JSON.stringify(plan) : null;
    if (plan && json !== this.racePlan?.json) this.racePlan = { plan, json: json!, savedFor: null };
    const recordingId = this.options.capture?.status().recordingId;
    if (!this.racePlan || !recordingId || this.racePlan.savedFor === recordingId || !this.options.racePlan) return;
    try {
      this.options.racePlan(recordingId, this.racePlan.plan);
      this.racePlan.savedFor = recordingId;
    } catch (error) {
      console.warn('[Live] Race plan store failed:', error);
    }
  }

  /** Recording, learning and diagnostics never stop the dashboard: a failure only ends the recording (NO REC). */
  private record(work: () => void): void {
    try { work(); } catch (error) { this.options.capture?.fail(error); }
  }

  /** Damage keeps the stop estimate and the MFD read often; a new impact asks for the condition now. */
  private followCar(car: LiveCarReading): void {
    this.carDamaged = car.detached || car.dentSeverity.some(dent => dent > 0) || car.wheels.some(wheel => wheel.flat || wheel.detached);
    if (this.lastImpactEt !== null && car.lastImpactEt > this.lastImpactEt) this.pit.trigger('condition');
    this.lastImpactEt = car.lastImpactEt;
    this.followPitActive();
  }

  /**
   * The condition is read after a stop with the tyre screen (new sets, the set fitted); the tread at each crossing
   * comes from shared memory. Nothing is triggered by a replay's frames.
   */
  private followPlayer(before: LiveVehicleReading | null, player: LiveVehicleReading | null): void {
    if (this.isReplaying() || !before || !player || player.id !== before.id) return;
    if (before.inPits && !player.inPits) {
      this.pit.trigger('condition');
      this.pit.trigger('tireManagement');
    }
    this.followPitActive();
  }

  private followPitActive(): void {
    // What keeps the pit in play for the poller: the pit state, damage seen in the car, or the car in the pits.
    const player = this.lastReading?.player;
    this.pit.setPitActive((player?.pitState ?? 'none') !== 'none' || this.carDamaged || player?.inPits === true);
  }

  private applyReading(reading: LiveScoringReading | null): void {
    const previous = this.snapshot;
    if (this.replay && this.screen === 'session' && reading !== null) {
      this.options.capture?.pause();
      // The replay's frames are not the session's: show the menu, and leave the last session reading, laps, strategy,
      // results and capture as they were (a replay watched from the monitor between sessions must not clear them).
      this.lastReading ??= reading;
      const menu = { ...deriveLiveState(reading, previous.lifecycle, 'menu'), identity: null, ...NO_SESSION_DETAILS,
        loadingProgress: null, strategy: null, result: null, qualifyingResult: null, audit: previous.audit ?? null };
      this.pendingTiming = null;
      const key = contentKey(menu);
      if (key !== this.snapshotKey) this.publish(menu, key);
      return;
    }
    this.lastReading = reading;
    const state = deriveLiveState(reading, previous.lifecycle, this.screen);
    this.identity.update(isLiveSessionLoaded(state.lifecycle) ? state.session : null);
    const identity = this.identity.identity;
    // The previous strategy: the planned stop it holds shortens the race distance (`LiveSessionTracker`).
    const details = this.tracker.apply(reading, state, previous.strategy ?? null);
    this.followPitLane(identity?.layoutKey ?? null, identity?.carClass ?? null);
    this.followRaceHistory(identity?.layoutKey ?? null, identity?.carClass ?? null);
    this.followTyreWear(identity?.layoutKey ?? null, identity?.vehicleModel ?? null,
      this.strategy.tyreCompound(), reading?.player?.driverName ?? null, state.lifecycle);
    this.followDeploymentKw(identity?.vehicleModel ?? null, identity?.carClass ?? null);
    const strategy = this.strategy.update(reading, state, {
      carClass: identity?.carClass ?? null,
      layoutKey: identity?.layoutKey ?? null,
      lapsLeft: details.lapsLeft,
      latestLap: details.recentLaps[details.recentLaps.length - 1] ?? null,
      reserveSeconds: this.reserveSeconds,
    });
    const next = {
      ...state, identity, ...details,
      ...this.results.update(reading, state, details.recentLaps[details.recentLaps.length - 1] ?? null, details.sessionBest, strategy, identity?.layoutKey ?? null),
      loadingProgress: state.lifecycle === 'loading' ? this.loadingProgress : null,
      strategy,
    };
    this.followRacePlan(state.session?.kind ?? null, strategy?.garage?.raceStrategy ?? null);
    this.record(() => {
      this.options.capture?.update(reading, { ...next, sequence: previous.sequence + 1, receivedAt: Date.now() }, this.strategy.observations());
      const recordingId = this.options.capture?.status().recordingId;
      if (recordingId && reading) {
        const events = this.learning.update(recordingId, { ...next, sequence: previous.sequence + 1, receivedAt: Date.now() },
          reading, this.strategy.learningForecasts(), this.strategy.observations());
        for (const event of events) this.options.capture?.observe({ source: 'recorder', ...event,
          elapsedSeconds: reading.currentEt, receivedAt: Date.now() });
      }
      this.options.capture?.diagnostics?.record({ kind: 'app-state', at: Date.now(), data: {
        lifecycle: next.lifecycle, identity: next.identity, loadingProgress: next.loadingProgress,
        session: next.session ? { ...next.session, elapsedSeconds: undefined } : null,
      } });
      const diagnostics = this.options.capture?.diagnostics;
      if (reading && diagnostics) this.fieldLog.update(reading, this.lastCar, Date.now(), event => diagnostics.record(event));
      if (Date.now() - this.lastDiagnosticStrategyAt >= 10_000 || next.lifecycle !== previous.lifecycle) {
        this.lastDiagnosticStrategyAt = Date.now();
        // The MFD's fuel ratio choices never change in a session: the pit menu reads log them, not every strategy record.
        const pit = next.strategy?.pit;
        const strategy = next.strategy && pit?.mfd ? { ...next.strategy, pit: { ...pit, mfd: { ...pit.mfd, fuelRatioOptions: undefined } } } : next.strategy;
        this.options.capture?.diagnostics?.record({ kind: 'strategy', at: Date.now(), data: {
          modelVersion: LIVE_MODEL_VERSION, elapsedSeconds: reading?.currentEt ?? null,
          strategy, observations: this.strategy.observations(),
        } });
      }
    });
    if (this.options.capture) this.followPitMode();
    const captureStatus = this.options.capture?.status();
    const audited = { ...next, audit: captureStatus?.recordingId ? {
      runId: captureStatus.recordingId,
      status: captureStatus.state === 'unavailable' ? 'unavailable' as const : 'recording' as const,
    } : null };
    this.pendingTiming = this.clients.size > 0 && isLiveOnTrack(state.lifecycle) ? this.tracker.timing() : null;
    const key = contentKey(audited);
    if (key === this.snapshotKey) {
      // The session clock moves every frame; it alone is not a change worth a snapshot.
      if (previous.session && next.session) previous.session = { ...previous.session, elapsedSeconds: next.session.elapsedSeconds };
      return;
    }
    this.publish(audited, key);
  }

  /** Makes `next` the current snapshot and sends it to every page; `key` is its content key when already built. */
  private publish(next: Omit<LiveSnapshot, 'sequence' | 'receivedAt'>, key = contentKey(next)): void {
    const previous = this.snapshot;
    this.snapshot = { ...next, sequence: previous.sequence + 1, receivedAt: Date.now() };
    this.snapshotKey = key;
    this.publishRunning();
    if (!isLiveOnTrack(next.lifecycle)) {
      this.pedals = [];
      this.pendingTiming = null;
    }
    this.broadcast(LIVE_STREAM_EVENTS.snapshot, this.snapshot);
    if (next.lifecycle !== previous.lifecycle) {
      this.followPitMode();
      this.events.emit('lifecycle', next.lifecycle);
    }
    this.followSessionLoaded();
    this.events.emit('snapshot', this.snapshot);
  }

  private setReplay(active: boolean): void {
    this.replay = active;
    this.applyReading(this.lastReading);
    this.followSessionLoaded();
    this.followPitMode();
  }

  private followSessionLoaded(): void {
    const loaded = this.isSessionLoaded();
    if (loaded === this.sessionLoaded) return;
    this.sessionLoaded = loaded;
    this.events.emit('session-loaded', loaded);
  }

  private applyRest(update: LiveRestUpdate): void {
    this.strategy.applyRest(update);
    this.applyReading(this.lastReading);
  }

  /**
   * Pit data is read only while a dashboard is open and a session is loaded. During a replay (shown as the menu)
   * the poller keeps asking the state check only, to learn when it ends.
   */
  private followPitMode(): void {
    const lifecycle = this.snapshot.lifecycle;
    const replaying = this.isReplaying();
    const mode: PitPollMode = this.clients.size === 0 && !this.options.capture ? 'off'
      : replaying ? 'track'
        : lifecycle === 'loading' || !isLiveSessionLoaded(lifecycle) ? 'off' : lifecycle === 'garage' ? 'garage' : 'track';
    this.pit.setMode(mode, this.options.capture?.status().recordingId ?? '');
    // The poller's state checks read the navigation state: the identity takes them instead of asking too.
    this.identity.setShared(mode !== 'off');
  }

  private bufferPedal(sample: LivePedalSample): void {
    if (this.clients.size === 0 || !isLiveOnTrack(this.snapshot.lifecycle)) return;
    this.pedals.push(sample);
    if (this.pedals.length > MAX_BUFFERED_PEDALS) this.pedals.splice(0, this.pedals.length - MAX_BUFFERED_PEDALS);
  }

  private flushPedals(): void {
    if (this.pedals.length === 0) return;
    const batch: LivePedalBatch = { samples: this.pedals };
    this.pedals = [];
    if (!isLiveOnTrack(this.snapshot.lifecycle)) return;
    this.broadcast(LIVE_STREAM_EVENTS.pedals, batch);
  }

  /** The newest current-lap progress, at most about 5 times a second, to pages that can take it. */
  private flushTiming(): void {
    const timing = this.pendingTiming;
    const now = Date.now();
    if (!timing || now - this.lastTimingAt < TIMING_MIN_INTERVAL_MS || !isLiveOnTrack(this.snapshot.lifecycle)) return;
    this.pendingTiming = null;
    this.lastTimingAt = now;
    const event: LiveTiming = { ...timing, tyreSurfaceAvgC: this.tyreSurfaceAvgC };
    if (now - this.lastTimingDiagnosticAt >= 1000) {
      this.lastTimingDiagnosticAt = now;
      const player = this.lastReading?.player;
      this.record(() => this.options.capture?.diagnostics?.record({ kind: 'lap-timing', at: now, data: {
        timing: event, clients: this.clients.size,
        input: player ? { currentEt: this.lastReading?.currentEt, totalLaps: player.totalLaps,
          lapStartEt: player.lapStartEt, timeIntoLap: player.timeIntoLap, lapDist: player.lapDist } : null,
      } }));
    }
    this.broadcast(LIVE_STREAM_EVENTS.timing, event);
  }

  /** Writes to one page unless its buffer is full; a full buffer drops everything until it drains, then catches up with the snapshot. */
  private broadcast(event: string, data: unknown): void {
    let frame: string | undefined;
    for (const [sink, client] of this.clients) {
      if (client.blocked) continue;
      frame ??= `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      this.send(sink, event, data, frame);
    }
  }

  private send(sink: SseSink, event: string, data: unknown, frame?: string): void {
    const client = this.clients.get(sink);
    if (!client || client.blocked) return;
    try {
      if (frame === undefined ? writeSseEvent(sink, event, data) : sink.write(frame)) return;
    } catch {
      this.removeClient(sink);
      return;
    }
    client.blocked = true;
    sink.once('drain', () => {
      client.blocked = false;
      this.send(sink, LIVE_STREAM_EVENTS.snapshot, this.snapshot);
    });
  }

  private ensureTimers(): void {
    this.flushTimer ??= setInterval(() => { this.flushTiming(); this.flushPedals(); }, PEDAL_FLUSH_MS);
    this.heartbeatTimer ??= setInterval(() => {
      this.broadcast(LIVE_STREAM_EVENTS.heartbeat, { at: Date.now() });
    }, LIVE_HEARTBEAT_MS);
    this.flushTimer.unref();
    this.heartbeatTimer.unref();
  }

  private clearTimers(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.flushTimer = null;
    this.heartbeatTimer = null;
    this.pedals = [];
  }
}
