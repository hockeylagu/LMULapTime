import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { LIVE_MODEL_VERSION, LiveAuditTracker } from '../../shared/domain/live/liveAudit.js';
import type { LiveAuditRecord } from '../../shared/types/liveAudit.js';
import { deriveLiveState, isLiveOnTrack, isLiveSessionLoaded } from '../../shared/domain/live/liveLifecycle.js';
import type { LiveGameScreen, LiveScoringReading, LiveVehicleReading } from '../../shared/domain/live/liveLifecycle.js';
import type { LiveCarReading } from '../../shared/domain/live/liveCarCondition.js';
import type { LivePitState } from '../../shared/types/liveStrategy.js';
import { LiveStrategyTracker } from '../../shared/domain/live/liveStrategyTracker.js';
import { LiveResultTracker } from '../../shared/domain/live/liveResults.js';
import type { LiveRestUpdate } from '../../shared/domain/live/liveStrategyTracker.js';
import type { PersonalBestLookup } from '../../shared/domain/live/liveIdentity.js';
import { LiveSessionTracker, NO_SESSION_DETAILS } from '../../shared/domain/live/liveSessionTracker.js';
import { DEFAULT_LIVE_SETTINGS, LIVE_HEARTBEAT_MS, LIVE_STREAM_EVENTS } from '../../shared/types/live.js';
import type { LiveLifecycle, LivePedalBatch, LivePedalSample, LiveSnapshot, LiveTiming } from '../../shared/types/live.js';
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

/** How often buffered pedal samples go out to the pages (about 25 batches a second). */
export const PEDAL_FLUSH_MS = 40;
/** Samples kept between two flushes; more than this means the reader outruns the stream, and the oldest go. */
const MAX_BUFFERED_PEDALS = 250;
/** `timing` events go out at most this often (the scoring buffer itself updates 5 times a second). */
export const TIMING_MIN_INTERVAL_MS = 100;
const WORKER_RESTART_MS = 3000;

export type LiveWorker = Pick<Worker, 'on' | 'postMessage' | 'terminate' | 'unref'>;

interface LiveClient {
  /** The sink's buffer is full: nothing is written to it until 'drain' (it must never slow the reader). */
  blocked: boolean;
}

export interface LiveServiceOptions {
  /** Durable capture also keeps safe REST polling alive without dashboard subscribers. */
  capture?: LiveCaptureController;
  /** Persists immutable checkpoints while a dashboard page is open (none without one). */
  saveAuditRecord?: (record: LiveAuditRecord) => void;
  /** Replaces the shared memory worker (tests). */
  createWorker?: () => LiveWorker;
  /** The player's personal record on a layout and class, from the app's history. Without it no record is shown. */
  personalBest?: PersonalBestLookup;
  /** Replaces the identity resolver's REST read and clock (tests). */
  identity?: Pick<LiveIdentityOptions, 'readNavigation' | 'now'>;
  /** Replaces the pit poller's REST read and clock (tests). */
  pit?: Pick<LivePitPollerOptions, 'get' | 'now'>;
  /** VE or fuel reserve in laps (the live settings); half a lap without it. Changed later with `setReserveLaps`. */
  reserveLaps?: number;
}

function offlineSnapshot(): LiveSnapshot {
  return {
    sequence: 0, receivedAt: Date.now(), lifecycle: 'offline', paused: false, session: null, identity: null,
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
  public readonly events = new TypedEmitter<{ lifecycle: [LiveLifecycle]; 'session-loaded': [boolean]; 'game-running': [boolean] }>();
  private processRunning: boolean | null = null;
  private reportedRunning = false;
  private snapshot: LiveSnapshot = offlineSnapshot();
  private snapshotKey = contentKey(this.snapshot);
  private readonly tracker = new LiveSessionTracker();
  private readonly identity: LiveIdentityResolver;
  private pendingTiming: LiveTiming | null = null;
  private lastTimingAt = 0;
  private tyreSurfaceAvgC: number | null = null;
  private readonly strategy = new LiveStrategyTracker();
  private readonly results = new LiveResultTracker();
  private readonly audit: LiveAuditTracker | null;
  private auditFailed = false;
  private lastDiagnosticStrategyAt = -Infinity;
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
  private reserveLaps: number;
  /** What keeps the pit in play for the poller (`setPitActive`): the standings' pit state and damage seen in the car. */
  private pitState: LivePitState = 'none';
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
    this.audit = options.saveAuditRecord ? new LiveAuditTracker(randomUUID, record => {
      if (this.auditFailed) return;
      try { options.saveAuditRecord?.(record); }
      catch (error) {
        this.auditFailed = true;
        console.error('[Live] Strategy history could not be saved:', error instanceof Error ? error.message : String(error));
      }
    }) : null;
    this.reserveLaps = options.reserveLaps ?? DEFAULT_LIVE_SETTINGS.reserveLaps;
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
        if (!this.isReplaying()) this.options.capture?.observe(observation);
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

  /** The reserve setting changed: the plan follows at once. */
  public setReserveLaps(laps: number): void {
    this.reserveLaps = laps;
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
      console.warn(`[Live] Shared memory reader ${reason}`);
      this.options.capture?.diagnostics?.record({ kind: 'reader-failure', at: Date.now(), data: { reason } });
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
    this.audit?.end(Date.now());
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.clearTimers();
    this.identity.stop();
    this.pit.stop();
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.postMessage({ type: 'stop' });
      void worker.terminate();
    }
    return this.options.capture?.stop() ?? Promise.resolve();
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
    if (!isWorkerMessage<LiveReaderMessage>(message, ['frame', 'navigation', 'closed', 'process', 'diagnostic'])) return;
    if (message.type === 'diagnostic') {
      this.options.capture?.diagnostics?.record(message.event);
      return;
    }
    if (message.type === 'process') {
      this.options.capture?.diagnostics?.record({ kind: 'game-process', at: Date.now(), data: message });
      this.processRunning = message.running;
      this.publishRunning();
      return;
    }
    this.markFirstReading();
    if (message.type === 'closed') {
      this.replay = false;
      this.screen = 'session';
      this.loadingProgress = null;
      this.pitState = 'none';
      this.carDamaged = false;
      this.lastImpactEt = null;
      this.strategy.reset();
      this.applyReading(null);
      return;
    }
    if (message.type === 'navigation') {
      this.options.capture?.diagnostics?.record({ kind: 'navigation', at: Date.now(), data: message });
      // A replay is a session screen whose frames are not the session's (applyReading shows it as the menu).
      this.screen = message.screen === 'replay' ? 'session' : message.screen;
      this.loadingProgress = message.loadingProgress;
      this.setReplay(message.screen === 'replay');
      return;
    }
    if (this.isReplaying()) return;
    if (message.tyreSurfaceAvgC !== undefined) this.tyreSurfaceAvgC = message.tyreSurfaceAvgC;
    if (message.car) {
      this.strategy.applyCar(message.car);
      this.followCar(message.car);
    }
    const before = this.lastReading?.player ?? null;
    if (message.scoring) this.applyReading(message.scoring);
    else if (message.car) this.applyReading(this.lastReading);
    if (message.scoring) this.followPlayer(before, message.scoring.player);
    if (message.pedal) this.bufferPedal(message.pedal);
    if (message.capture && this.snapshot.session?.inRealtime && !this.snapshot.paused) this.options.capture?.sample(message.capture);
    if (message.car) this.options.capture?.observe({ source: 'shared-memory', kind: 'car-condition',
      elapsedSeconds: message.pedal?.t ?? this.lastReading?.currentEt ?? null, receivedAt: Date.now(), data: {
        fuelLitres: message.car.fuelLiters, fuelCapacityLitres: message.car.fuelCapacityLiters,
        dents: message.car.dentSeverity, detached: message.car.detached, lastImpactEt: message.car.lastImpactEt,
        compound: message.car.compound,
      } });
  }

  /** Damage keeps the stop estimate and the MFD read often; a new impact asks for the condition now. */
  private followCar(car: LiveCarReading): void {
    this.carDamaged = car.detached || car.dentSeverity.some(dent => dent > 0) || car.wheels.some(wheel => wheel.flat || wheel.detached);
    if (this.lastImpactEt !== null && car.lastImpactEt > this.lastImpactEt) this.pit.trigger('condition');
    this.lastImpactEt = car.lastImpactEt;
    this.followPitActive();
  }

  /**
   * The condition is read once a lap, right after the line (the tyre tracker takes the tread at each crossing), and
   * after a stop with the tyre screen (new sets, the set fitted). Nothing is triggered by a replay's frames.
   */
  private followPlayer(before: LiveVehicleReading | null, player: LiveVehicleReading | null): void {
    if (this.isReplaying() || !before || !player || player.id !== before.id) return;
    if (player.totalLaps > before.totalLaps) this.pit.trigger('condition');
    if (before.inPits && !player.inPits) {
      this.pit.trigger('condition');
      this.pit.trigger('tireManagement');
    }
    this.followPitActive();
  }

  private followPitActive(): void {
    this.pit.setPitActive(this.pitState !== 'none' || this.carDamaged || this.lastReading?.player?.inPits === true);
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
      if (contentKey(menu) !== this.snapshotKey) this.publish(menu);
      return;
    }
    this.lastReading = reading;
    const state = deriveLiveState(reading, previous.lifecycle, this.screen);
    this.identity.update(isLiveSessionLoaded(state.lifecycle) ? state.session : null);
    const identity = this.identity.identity;
    const details = this.tracker.apply(reading, state);
    const strategy = this.strategy.update(reading, state, {
      carClass: identity?.carClass ?? null,
      layoutKey: identity?.layoutKey ?? null,
      lapsLeft: details.lapsLeft,
      latestLap: details.recentLaps[details.recentLaps.length - 1] ?? null,
      reserveLaps: this.reserveLaps,
    });
    const next = {
      ...state, identity, ...details,
      ...this.results.update(reading, state, details.recentLaps[details.recentLaps.length - 1] ?? null, details.sessionBest, strategy, identity?.layoutKey ?? null),
      loadingProgress: state.lifecycle === 'loading' ? this.loadingProgress : null,
      strategy,
    };
    this.options.capture?.update(reading, { ...next, sequence: previous.sequence + 1, receivedAt: Date.now() });
    this.options.capture?.diagnostics?.record({ kind: 'app-state', at: Date.now(), data: {
      lifecycle: next.lifecycle, paused: next.paused, identity: next.identity, loadingProgress: next.loadingProgress,
      session: next.session ? { ...next.session, elapsedSeconds: undefined } : null,
    } });
    if (Date.now() - this.lastDiagnosticStrategyAt >= 10_000 || next.lifecycle !== previous.lifecycle) {
      this.lastDiagnosticStrategyAt = Date.now();
      this.options.capture?.diagnostics?.record({ kind: 'strategy', at: Date.now(), data: {
        modelVersion: LIVE_MODEL_VERSION, elapsedSeconds: reading?.currentEt ?? null,
        strategy: next.strategy, observations: this.strategy.observations(),
      } });
    }
    if (this.options.capture) this.followPitMode();
    // History is captured only while a dashboard is open, like the REST reads it depends on.
    if (this.clients.size === 0) this.audit?.end(Date.now());
    const auditId = this.clients.size > 0
      ? this.audit?.update({ ...next, sequence: previous.sequence + 1, receivedAt: Date.now() }, reading, this.strategy.observations(), Date.now()) : null;
    const audited = { ...next, audit: auditId ? { runId: auditId, status: this.auditFailed ? 'unavailable' as const : 'recording' as const } : null };
    this.pendingTiming = this.clients.size > 0 && isLiveOnTrack(state.lifecycle) ? this.tracker.timing() : null;
    if (contentKey(audited) === this.snapshotKey) {
      // The session clock moves every frame; it alone is not a change worth a snapshot.
      if (previous.session && next.session) previous.session = { ...previous.session, elapsedSeconds: next.session.elapsedSeconds };
      return;
    }
    this.publish(audited);
  }

  /** Makes `next` the current snapshot and sends it to every page. */
  private publish(next: Omit<LiveSnapshot, 'sequence' | 'receivedAt'>): void {
    const previous = this.snapshot;
    this.snapshot = { ...next, sequence: previous.sequence + 1, receivedAt: Date.now() };
    this.snapshotKey = contentKey(next);
    this.publishRunning();
    if (!isLiveOnTrack(next.lifecycle)) {
      this.pedals = [];
      this.pendingTiming = null;
    }
    for (const sink of this.clients.keys()) this.send(sink, LIVE_STREAM_EVENTS.snapshot, this.snapshot);
    if (next.lifecycle !== previous.lifecycle) {
      this.followPitMode();
      this.events.emit('lifecycle', next.lifecycle);
    }
    this.followSessionLoaded();
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
    if (update.type === 'standings') {
      this.pitState = update.pitState;
      this.followPitActive();
    }
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
    for (const sink of this.clients.keys()) this.send(sink, LIVE_STREAM_EVENTS.pedals, batch);
  }

  /** The newest current-lap progress, at most about 5 times a second, to pages that can take it. */
  private flushTiming(): void {
    const timing = this.pendingTiming;
    const now = Date.now();
    if (!timing || now - this.lastTimingAt < TIMING_MIN_INTERVAL_MS || !isLiveOnTrack(this.snapshot.lifecycle)) return;
    this.pendingTiming = null;
    this.lastTimingAt = now;
    const event: LiveTiming = { ...timing, tyreSurfaceAvgC: this.tyreSurfaceAvgC };
    for (const sink of this.clients.keys()) this.send(sink, LIVE_STREAM_EVENTS.timing, event);
  }

  /** Writes to one page unless its buffer is full; a full buffer drops everything until it drains, then catches up with the snapshot. */
  private send(sink: SseSink, event: string, data: unknown): void {
    const client = this.clients.get(sink);
    if (!client || client.blocked) return;
    try {
      if (writeSseEvent(sink, event, data)) return;
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
      for (const sink of this.clients.keys()) this.send(sink, LIVE_STREAM_EVENTS.heartbeat, { at: Date.now() });
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
