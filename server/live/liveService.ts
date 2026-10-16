import { Worker } from 'node:worker_threads';
import { deriveLiveState, isLiveOnTrack, isLiveSessionLoaded } from '../../shared/domain/live/liveLifecycle.js';
import type { LiveScoringReading } from '../../shared/domain/live/liveLifecycle.js';
import { LIVE_HEARTBEAT_MS, LIVE_STREAM_EVENTS } from '../../shared/types/live.js';
import type { LiveLifecycle, LivePedalBatch, LivePedalSample, LiveSnapshot } from '../../shared/types/live.js';
import { TypedEmitter } from '../core/typedEmitter.js';
import { findWorkerBootstrap, isWorkerMessage } from '../core/workerThreads.js';
import type { LiveReaderMessage } from './liveReader.js';
import { writeSseEvent } from './sse.js';
import type { SseSink } from './sse.js';

/** How often buffered pedal samples go out to the pages (about 25 batches a second). */
export const PEDAL_FLUSH_MS = 40;
/** Samples kept between two flushes; more than this means the reader outruns the stream, and the oldest go. */
const MAX_BUFFERED_PEDALS = 250;
const WORKER_RESTART_MS = 3000;

export type LiveWorker = Pick<Worker, 'on' | 'postMessage' | 'terminate' | 'unref'>;

interface LiveClient {
  /** The sink's buffer is full: nothing is written to it until 'drain' (it must never slow the reader). */
  blocked: boolean;
}

export interface LiveServiceOptions {
  /** Replaces the shared memory worker (tests). */
  createWorker?: () => LiveWorker;
}

function offlineSnapshot(): LiveSnapshot {
  return { sequence: 0, receivedAt: Date.now(), lifecycle: 'offline', paused: false, session: null };
}

/**
 * Owns the shared memory worker, the current snapshot and the pages connected to the live stream.
 * A page gets the snapshot on connect and on every change, pedal batches while the driver is on track,
 * and a heartbeat. A page that cannot keep up misses batches; the reader is never held back by it.
 */
export class LiveService {
  public readonly events = new TypedEmitter<{ lifecycle: [LiveLifecycle]; 'session-loaded': [boolean] }>();
  private snapshot: LiveSnapshot = offlineSnapshot();
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

  public constructor(private readonly options: LiveServiceOptions = {}) {}

  public getSnapshot(): LiveSnapshot { return this.snapshot; }
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
    return () => {
      this.clients.delete(sink);
      if (this.clients.size === 0) this.clearTimers();
    };
  }

  private handleMessage(message: unknown): void {
    if (!isWorkerMessage<LiveReaderMessage>(message, ['frame', 'closed'])) return;
    this.markFirstReading();
    if (message.type === 'closed') {
      this.applyReading(null);
      return;
    }
    if (message.scoring) this.applyReading(message.scoring);
    if (message.pedal) this.bufferPedal(message.pedal);
  }

  private applyReading(reading: LiveScoringReading | null): void {
    const previous = this.snapshot;
    const state = deriveLiveState(reading, previous.lifecycle);
    const elapsed = state.session?.elapsedSeconds;
    const sameState = state.lifecycle === previous.lifecycle && state.paused === previous.paused &&
      JSON.stringify(state.session && { ...state.session, elapsedSeconds: 0 }) ===
      JSON.stringify(previous.session && { ...previous.session, elapsedSeconds: 0 });
    if (sameState) {
      // The session clock moves every frame; it alone is not a change worth a snapshot.
      if (previous.session && elapsed !== undefined) previous.session = { ...previous.session, elapsedSeconds: elapsed };
      return;
    }
    const wasLoaded = this.isSessionLoaded();
    this.snapshot = { sequence: previous.sequence + 1, receivedAt: Date.now(), ...state };
    if (!isLiveOnTrack(state.lifecycle)) this.pedals = [];
    for (const sink of this.clients.keys()) this.send(sink, LIVE_STREAM_EVENTS.snapshot, this.snapshot);
    if (state.lifecycle !== previous.lifecycle) this.events.emit('lifecycle', state.lifecycle);
    if (this.isSessionLoaded() !== wasLoaded) this.events.emit('session-loaded', this.isSessionLoaded());
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
    this.flushTimer ??= setInterval(() => this.flushPedals(), PEDAL_FLUSH_MS);
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
