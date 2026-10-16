import { Worker } from 'node:worker_threads';
import { deriveLiveState, isLiveOnTrack, isLiveSessionLoaded } from '../../shared/domain/live/liveLifecycle.js';
import type { LiveGameScreen, LiveScoringReading } from '../../shared/domain/live/liveLifecycle.js';
import { LiveStrategyTracker } from '../../shared/domain/live/liveStrategyTracker.js';
import type { LiveRestUpdate } from '../../shared/domain/live/liveStrategyTracker.js';
import type { PersonalBestLookup } from '../../shared/domain/live/liveIdentity.js';
import { LiveSessionTracker, NO_SESSION_DETAILS } from '../../shared/domain/live/liveSessionTracker.js';
import { LIVE_HEARTBEAT_MS, LIVE_STREAM_EVENTS } from '../../shared/types/live.js';
import type { LiveLifecycle, LivePedalBatch, LivePedalSample, LiveSnapshot, LiveTiming } from '../../shared/types/live.js';
import { TypedEmitter } from '../core/typedEmitter.js';
import { findWorkerBootstrap, isWorkerMessage } from '../core/workerThreads.js';
import type { LiveReaderMessage } from './liveReader.js';
import { LiveIdentityResolver } from './liveIdentityResolver.js';
import type { LiveIdentityOptions } from './liveIdentityResolver.js';
import { LivePitPoller } from './livePitPoller.js';
import { DEFAULT_RESERVE_LAPS } from './liveSettings.js';
import type { LivePitPollerOptions, PitPollMode } from './livePitPoller.js';
import { writeSseEvent } from './sse.js';
import type { SseSink } from './sse.js';

/** How often buffered pedal samples go out to the pages (about 25 batches a second). */
export const PEDAL_FLUSH_MS = 40;
/** Samples kept between two flushes; more than this means the reader outruns the stream, and the oldest go. */
const MAX_BUFFERED_PEDALS = 250;
/** `timing` events go out at most this often (the scoring buffer itself updates 5 times a second). */
export const TIMING_MIN_INTERVAL_MS = 180;
const WORKER_RESTART_MS = 3000;

export type LiveWorker = Pick<Worker, 'on' | 'postMessage' | 'terminate' | 'unref'>;

interface LiveClient {
  /** The sink's buffer is full: nothing is written to it until 'drain' (it must never slow the reader). */
  blocked: boolean;
}

export interface LiveServiceOptions {
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
  public readonly events = new TypedEmitter<{ lifecycle: [LiveLifecycle]; 'session-loaded': [boolean] }>();
  private snapshot: LiveSnapshot = offlineSnapshot();
  private snapshotKey = contentKey(this.snapshot);
  private readonly tracker = new LiveSessionTracker();
  private readonly identity: LiveIdentityResolver;
  private pendingTiming: LiveTiming | null = null;
  private lastTimingAt = 0;
  private tyreSurfaceAvgC: number | null = null;
  private readonly strategy = new LiveStrategyTracker();
  private readonly pit: LivePitPoller;
  /** The last scoring reading, kept so a navigation notice or a REST answer can re-derive the snapshot without a new frame. */
  private lastReading: LiveScoringReading | null = null;
  private screen: LiveGameScreen = 'session';
  private loadingProgress: number | null = null;
  /** `GetGameState.isReplayActive`: a replay playing is not live driving. */
  private replay = false;
  private reserveLaps: number;
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
    this.reserveLaps = options.reserveLaps ?? DEFAULT_RESERVE_LAPS;
    this.identity = new LiveIdentityResolver({
      ...options.identity,
      personalBest: options.personalBest ?? (() => null),
      onChange: () => this.publish({ ...this.snapshot, identity: this.identity.identity }),
    });
    this.pit = new LivePitPoller({
      ...options.pit,
      onUpdate: update => this.applyRest(update),
      onReplay: active => {
        this.replay = active === true;
        this.applyReading(this.lastReading);
      },
    });
  }

  public getSnapshot(): LiveSnapshot { return this.snapshot; }

  /** The reserve setting changed: the plan follows at once. */
  public setReserveLaps(laps: number): void {
    this.reserveLaps = laps;
    this.applyReading(this.lastReading);
  }
  public hasClients(): boolean { return this.clients.size > 0; }
  /** A session is loaded in the game, so the game may be writing its files. */
  public isSessionLoaded(): boolean { return isLiveSessionLoaded(this.snapshot.lifecycle); }

  public start(): void {
    if (this.worker) return;
    this.stopped = false;
    const worker = this.options.createWorker?.()
      ?? new Worker(findWorkerBootstrap(import.meta.url, ['live', 'liveReaderWorkerBootstrap.mjs']));
    this.worker = worker;
    worker.unref();
    worker.on('message', (message: unknown) => this.handleMessage(message));
    const lost = (reason: string): void => {
      if (this.worker !== worker) return;
      console.warn(`[Live] Shared memory reader ${reason}`);
      this.worker = null;
      this.applyReading(null);
      if (this.stopped) return;
      this.restartTimer = setTimeout(() => this.start(), WORKER_RESTART_MS);
      this.restartTimer.unref();
    };
    worker.on('error', (error: Error) => lost(`failed: ${error.message}`));
    worker.on('exit', (code: number) => lost(`exited with code ${code}`));
  }

  public stop(): void {
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
  }

  /** Registers a page: it gets the current snapshot now. Returns the function that removes it. */
  public addClient(sink: SseSink): () => void {
    this.clients.set(sink, { blocked: false });
    this.send(sink, LIVE_STREAM_EVENTS.snapshot, this.snapshot);
    this.ensureTimers();
    this.followPitMode();
    return () => {
      this.clients.delete(sink);
      if (this.clients.size === 0) this.clearTimers();
      this.followPitMode();
    };
  }

  private handleMessage(message: unknown): void {
    if (!isWorkerMessage<LiveReaderMessage>(message, ['frame', 'navigation', 'closed'])) return;
    this.markFirstReading();
    if (message.type === 'closed') {
      this.screen = 'session';
      this.loadingProgress = null;
      this.strategy.reset();
      this.applyReading(null);
      return;
    }
    if (message.type === 'navigation') {
      this.screen = message.screen;
      this.loadingProgress = message.loadingProgress;
      this.applyReading(this.lastReading);
      return;
    }
    if (message.tyreSurfaceAvgC !== undefined) this.tyreSurfaceAvgC = message.tyreSurfaceAvgC;
    if (message.car) this.strategy.applyCar(message.car);
    if (message.scoring) this.applyReading(message.scoring);
    else if (message.car) this.applyReading(this.lastReading);
    if (message.pedal) this.bufferPedal(message.pedal);
  }

  private applyReading(reading: LiveScoringReading | null): void {
    const previous = this.snapshot;
    this.lastReading = reading;
    const screen: LiveGameScreen = this.replay && this.screen === 'session' ? 'menu' : this.screen;
    const state = deriveLiveState(reading, previous.lifecycle, screen);
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
      loadingProgress: state.lifecycle === 'loading' ? this.loadingProgress : null,
      strategy,
    };
    this.pendingTiming = this.clients.size > 0 && isLiveOnTrack(state.lifecycle) ? this.tracker.timing() : null;
    if (contentKey(next) === this.snapshotKey) {
      // The session clock moves every frame; it alone is not a change worth a snapshot.
      if (previous.session && next.session) previous.session = { ...previous.session, elapsedSeconds: next.session.elapsedSeconds };
      return;
    }
    this.publish(next);
  }

  /** Makes `next` the current snapshot and sends it to every page. */
  private publish(next: Omit<LiveSnapshot, 'sequence' | 'receivedAt'>): void {
    const previous = this.snapshot;
    const wasLoaded = this.isSessionLoaded();
    this.snapshot = { ...next, sequence: previous.sequence + 1, receivedAt: Date.now() };
    this.snapshotKey = contentKey(next);
    if (!isLiveOnTrack(next.lifecycle)) {
      this.pedals = [];
      this.pendingTiming = null;
    }
    for (const sink of this.clients.keys()) this.send(sink, LIVE_STREAM_EVENTS.snapshot, this.snapshot);
    if (next.lifecycle !== previous.lifecycle) {
      this.followPitMode();
      this.events.emit('lifecycle', next.lifecycle);
    }
    if (this.isSessionLoaded() !== wasLoaded) this.events.emit('session-loaded', this.isSessionLoaded());
  }

  private applyRest(update: LiveRestUpdate): void {
    this.strategy.applyRest(update);
    this.applyReading(this.lastReading);
  }

  /**
   * Pit data is read only while a dashboard is open and a session is loaded. During a replay (shown as the menu)
   * the poller keeps asking `GetGameState` only, to learn when it ends.
   */
  private followPitMode(): void {
    const lifecycle = this.snapshot.lifecycle;
    const replaying = this.replay && this.lastReading !== null && this.screen === 'session';
    const mode: PitPollMode = this.clients.size === 0 ? 'off'
      : replaying ? 'track'
        : !isLiveSessionLoaded(lifecycle) ? 'off' : lifecycle === 'garage' ? 'garage' : 'track';
    this.pit.setMode(mode);
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
      this.clients.delete(sink);
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
