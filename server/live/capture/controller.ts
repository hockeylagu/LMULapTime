import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { LiveScoringReading } from '../../../shared/domain/live/liveLifecycle.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import {
  LIVE_CAPTURE_NORMALIZATION_VERSION, LIVE_CAPTURE_SAMPLE_WIDTH, LIVE_CAPTURE_SCHEMA_VERSION, LIVE_CAPTURE_SOURCE,
  LIVE_CAPTURE_PENDING_BATCHES, LIVE_CAPTURE_FINALIZATION_SLOTS,
} from '../../../shared/types/liveCapture.js';
import type {
  LiveCaptureBatch, LiveCaptureManifest, LiveCaptureObservation, LiveCaptureSample, LiveCaptureStatus, LiveCaptureWriteResult,
  LiveCaptureCatalogEntry,
} from '../../../shared/types/liveCapture.js';
import { LiveAuditTracker } from '../../../shared/domain/live/liveAudit.js';
import type { LiveUsageObservation } from '../../../shared/types/liveAudit.js';
import { findWorkerBootstrap, isWorkerMessage } from '../../core/workerThreads.js';
import type { LiveDiagnostics } from './diagnostics.js';
import { resolvedCaptureFilename } from './maintenance/filenames.js';

const BATCH_SAMPLES = 50;
const MAX_OBSERVATIONS = 200;
const MAX_OBSERVATION_BYTES = 256_000;
const FLUSH_MS = 1000;
/** How long a possible resume waits for navigation to name the layout before recording a new file. */
const RECOVERY_LAYOUT_WAIT_MS = 10_000;

export type CaptureWorker = Pick<Worker, 'postMessage' | 'on' | 'unref' | 'terminate'>;
export interface LiveCaptureControllerOptions {
  directory: string;
  onPersist(manifest: LiveCaptureManifest, bytes: number): void;
  onCatalog?: (recordings: LiveCaptureCatalogEntry[], errors: Array<{ filename: string; error: string }>) => void;
  existing?: () => LiveCaptureManifest[];
  createWorker?: () => CaptureWorker;
  now?: () => number;
  diagnostics?: LiveDiagnostics;
}

/** Bounded capture transport. No filesystem, DuckDB work or per-sample JSON on the reader path. */
export class LiveCaptureController {
  public readonly directory: string;
  public readonly diagnostics: LiveDiagnostics | undefined;
  private manifest: LiveCaptureManifest | null = null;
  private worker: CaptureWorker | null = null;
  private buffer = new Float64Array(BATCH_SAMPLES * LIVE_CAPTURE_SAMPLE_WIDTH);
  private readonly spareBuffers: ArrayBuffer[] = [];
  private sampleCount = 0;
  private observations: LiveCaptureObservation[] = [];
  private observationBytes = 0;
  private sequence = Date.now();
  private pending = new Set<number>();
  private timer: NodeJS.Timeout | null = null;
  private lastSample = -Infinity;
  private sessionKey = '';
  private error: string | null = null;
  private lastObservation = new Map<string, string>();
  private terrainMaterials: Array<string | undefined> = [];
  private recoverable: LiveCaptureManifest[] | null = null;
  private recoveryProbe: { reading: LiveScoringReading; key: string; observedAt: number } | null = null;
  private stopped = false;
  private stopping: Promise<void> | null = null;
  private closeResolve: (() => void) | null = null;
  private closingWorker = false;
  private audit: LiveAuditTracker | null = null;
  private links = new Map<string, Pick<LiveCaptureManifest, 'recordingId' | 'filename' | 'sessionId' | 'gameVersion'>>();
  private linked = new Map<string, string>();
  private pendingLinks = new Map<string, string>();
  private catalogPromise: Promise<void> | null = null;
  private catalogResolve: (() => void) | null = null;
  private catalogSent = false;

  public constructor(private readonly options: LiveCaptureControllerOptions) {
    this.directory = path.resolve(options.directory);
    this.diagnostics = options.diagnostics;
  }

  public status(): LiveCaptureStatus {
    return {
      state: this.error ? 'unavailable' : this.manifest ? 'recording' : 'idle',
      recordingId: this.manifest?.recordingId ?? null, samples: this.manifest?.samples ?? 0,
      droppedSamples: this.manifest?.droppedSamples ?? 0, pendingBatches: this.pending.size, error: this.error,
    };
  }

  /** Native handles outlive close callbacks; defer independent file maintenance until worker exit. */
  public get hasOpenRecordingHandle(): boolean { return this.worker !== null; }

  public update(reading: LiveScoringReading | null, snapshot: LiveSnapshot, usage?: LiveUsageObservation): void {
    if (this.stopped) return;
    const player = reading?.player;
    const session = snapshot.session;
    if (!reading || !player || !session) {
      this.recoveryProbe = null;
      this.finish(snapshot.lifecycle === 'offline' ? 'interrupted' : 'completed');
      return;
    }
    if (!Number.isFinite(reading.currentEt) || reading.currentEt < 0) return;
    const key = `${reading.sessionCode}|${reading.trackName}|${player.vehicleName}|${player.driverName ?? ''}`;
    const changedLayout = this.manifest?.layoutKey != null && snapshot.identity?.layoutKey != null
      && this.manifest.layoutKey !== snapshot.identity.layoutKey;
    if (this.manifest && (key !== this.sessionKey || changedLayout || reading.currentEt < this.manifest.lastElapsedSeconds - 1)) {
      this.finish('completed');
    }
    // Open a recording only once the player is in the car: garage menus and session-over screens produce no motion samples.
    if (!this.manifest && reading.inRealtime) this.begin(reading, snapshot, key);
    const manifest = this.manifest;
    if (!manifest) return;
    manifest.updatedAt = Math.max(manifest.updatedAt, this.now());
    manifest.lastElapsedSeconds = Math.max(manifest.lastElapsedSeconds, reading.currentEt);
    manifest.layoutKey ??= snapshot.identity?.layoutKey ?? null;
    const lap = player.totalLaps + 1;
    if (Number.isFinite(player.lapStartEt) && player.lapStartEt >= 0 && player.lapStartEt <= reading.currentEt) {
      const currentAnchor = manifest.anchors.find(anchor => anchor.lapNumber === lap);
      if (currentAnchor) currentAnchor.startSeconds = player.lapStartEt;
      else {
        manifest.anchors.push({ lapNumber: lap, startSeconds: player.lapStartEt, lapSeconds: null });
      }
      const prior = manifest.anchors.find(anchor => anchor.lapNumber === player.totalLaps);
      if (prior && player.lastLapTime > 0) prior.lapSeconds = player.lastLapTime;
    }
    this.observe({ source: 'shared-memory', kind: 'scoring', elapsedSeconds: reading.currentEt, receivedAt: this.now(), data: {
      driverName: player.driverName ?? '', vehicleId: player.id, lapNumber: lap, lapStartSeconds: player.lapStartEt,
      lastLapSeconds: player.lastLapTime, sectors: [player.lastSector1, player.lastSector2],
      inPits: player.inPits, countLapFlag: player.countLapFlag, gamePhase: reading.gamePhase,
      inRealtime: reading.inRealtime, avgPathWetness: reading.avgPathWetness,
      maxPathWetness: reading.maxPathWetness ?? null,
    } });
    if (player.upgradePackHex !== undefined) this.observe({ source: 'shared-memory', kind: 'upgrade-pack',
      elapsedSeconds: reading.currentEt, receivedAt: this.now(), data: { rawHex: player.upgradePackHex } });
    if (usage) this.audit?.update(snapshot, reading, usage, this.now());
  }

  public sample(sample: LiveCaptureSample): void {
    const manifest = this.manifest;
    if (!manifest || this.stopped || this.error) return;
    if (!Number.isFinite(sample.elapsedSeconds) || sample.elapsedSeconds < 0 || sample.elapsedSeconds <= this.lastSample
      || !Number.isSafeInteger(sample.lapNumber) || sample.lapNumber < 0 || sample.values.length !== LIVE_CAPTURE_SAMPLE_WIDTH - 3) return;
    if (sample.impact) this.observe({ source: 'shared-memory', kind: 'impact',
      elapsedSeconds: sample.impact.elapsedSeconds, receivedAt: this.now(),
      data: { impactElapsedSeconds: sample.impact.elapsedSeconds, magnitude: sample.impact.magnitude } });
    if (sample.terrainMaterials?.length === 4) sample.terrainMaterials.forEach((rawName, corner) => {
      if (rawName === this.terrainMaterials[corner]) return;
      this.observe({ source: 'shared-memory', kind: 'terrain-change', elapsedSeconds: sample.elapsedSeconds,
        receivedAt: this.now(), data: { corner: ['FL', 'FR', 'RL', 'RR'][corner], rawName } });
      this.terrainMaterials[corner] = rawName;
    });
    if (this.pending.size >= LIVE_CAPTURE_PENDING_BATCHES || this.sampleCount >= BATCH_SAMPLES) {
      manifest.droppedSamples++;
      return;
    }
    this.lastSample = sample.elapsedSeconds;
    const at = this.sampleCount * LIVE_CAPTURE_SAMPLE_WIDTH;
    this.buffer[at] = sample.elapsedSeconds;
    this.buffer[at + 1] = sample.lapNumber;
    this.buffer[at + 2] = sample.lapStartSeconds ?? NaN;
    this.buffer.set(sample.values, at + 3);
    this.sampleCount++;
    manifest.samples++;
    manifest.lastElapsedSeconds = Math.max(manifest.lastElapsedSeconds, sample.elapsedSeconds);
    manifest.updatedAt = Math.max(manifest.updatedAt, this.now());
    if (this.sampleCount === BATCH_SAMPLES) this.flush();
  }

  public observe(observation: LiveCaptureObservation): void {
    if (!this.manifest || this.stopped || this.error) return;
    const json = JSON.stringify(observation.data);
    if (json === undefined) return;
    const key = `${observation.source}:${observation.kind}`;
    // New timestamps remain explicit for REST measurements and failures; selections/configuration store changes.
    const measured = observation.kind === 'condition' || observation.kind === 'standings' || observation.kind === 'failure';
    if (!measured && this.lastObservation.get(key) === json) return;
    if (this.observations.length >= MAX_OBSERVATIONS || this.observationBytes + json.length > MAX_OBSERVATION_BYTES) {
      this.manifest.droppedSamples++;
      return;
    }
    this.lastObservation.set(key, json);
    this.observations.push(observation);
    this.observationBytes += json.length;
    if (Number.isFinite(observation.receivedAt)) {
      this.manifest.updatedAt = Math.max(this.manifest.updatedAt, observation.receivedAt);
    }
  }

  /** A recording, learning or diagnostics step threw: this session stops recording (the dashboard shows NO REC). */
  public fail(error: unknown): void {
    if (this.error) return;
    this.error = `Live recording: ${error instanceof Error ? error.message : String(error)}`;
    console.warn(`[Live] ${this.error}`);
  }

  /** Replay playback pauses capture without closing or learning from replay frames. */
  public pause(): void { this.flush(); }

  /** Apply the XML match decided by the coordinator; file provenance is patched only off track. */
  public synchronizeLinks(manifests: readonly LiveCaptureManifest[]): void {
    if (this.stopped) return;
    for (const manifest of manifests) {
      if (this.linked.get(manifest.recordingId) === JSON.stringify([manifest.sessionId, manifest.gameVersion])) continue;
      this.links.set(manifest.recordingId, { recordingId: manifest.recordingId, filename: manifest.filename,
        sessionId: manifest.sessionId, gameVersion: manifest.gameVersion });
    }
    this.pumpLinks();
  }

  /** Rebuild the compact source index from app-owned files, outside a loaded game session. */
  public discover(): Promise<void> {
    if (this.stopped || this.manifest) return Promise.resolve();
    if (this.catalogPromise) return this.catalogPromise;
    this.error = null;
    this.catalogPromise = new Promise<void>(resolve => { this.catalogResolve = resolve; });
    this.pumpLinks();
    return this.catalogPromise;
  }

  public stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.finish('interrupted');
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const worker = this.worker;
    if (!worker) return this.diagnostics?.stop() ?? Promise.resolve();
    this.stopping = new Promise<void>(resolve => {
      let settled = false;
      const done = (): void => { if (settled) return; settled = true; clearTimeout(timeout); this.closeResolve = null; resolve(); };
      const timeout = setTimeout(() => { void worker.terminate().then(done, done); }, 5000);
      timeout.unref();
      this.closeResolve = done;
      if (!this.closingWorker) { this.closingWorker = true; worker.postMessage({ type: 'close' }); }
    });
    if (this.diagnostics) this.stopping = this.stopping.then(() => this.diagnostics?.stop());
    return this.stopping;
  }

  private now(): number { return (this.options.now ?? Date.now)(); }

  private begin(reading: LiveScoringReading, snapshot: LiveSnapshot, key: string): void {
    const player = reading.player;
    if (!player) return;
    const now = this.now();
    this.recoverable ??= this.options.existing?.() ?? [];
    const probe = this.recoveryProbe;
    if (probe && (probe.key !== key || reading.currentEt < probe.reading.currentEt
      || player.totalLaps < (probe.reading.player?.totalLaps ?? 0)
      || (player.totalLaps === probe.reading.player?.totalLaps ? player.lapStartEt !== probe.reading.player.lapStartEt
        : player.lapStartEt < probe.reading.currentEt))) this.recoveryProbe = null;
    const continuity = this.recoveryProbe?.reading ?? reading;
    const observedAt = this.recoveryProbe?.observedAt ?? now;
    const candidates = this.recoverable.filter(record => record.status !== 'completed'
      && record.normalizationVersion === LIVE_CAPTURE_NORMALIZATION_VERSION
      && record.layoutKey !== null && record.trackName === reading.trackName
      && record.sessionCode === reading.sessionCode && record.driverName === (player.driverName ?? '')
      && record.vehicleName === player.vehicleName && record.lastElapsedSeconds <= continuity.currentEt
      && observedAt - record.updatedAt >= 0 && observedAt - record.updatedAt < 120_000
      && record.anchors.some(anchor => anchor.lapNumber === (continuity.player?.totalLaps ?? -1) + 1
        && anchor.startSeconds === continuity.player?.lapStartEt));
    if (candidates.length && !snapshot.identity?.layoutKey && now - observedAt < RECOVERY_LAYOUT_WAIT_MS) {
      // Do not fork a known interrupted attempt while navigation resolves a multi-layout venue.
      this.recoveryProbe ??= { reading: { ...reading, player: { ...player } }, key, observedAt: now };
      return;
    }
    const matching = candidates.filter(record => record.layoutKey === snapshot.identity?.layoutKey);
    const prior = matching.length === 1 ? matching[0] : null;
    this.recoveryProbe = null;
    const recordingId = prior?.recordingId ?? randomUUID();
    const safeLayout = (snapshot.identity?.layoutKey ?? 'unresolved').replace(/[^a-zA-Z0-9_-]/g, '_');
    this.manifest = prior ? { ...prior, status: 'recording', endedAt: null, updatedAt: now, anchors: prior.anchors.map(a => ({ ...a })) } : {
      recordingId, source: LIVE_CAPTURE_SOURCE, schemaVersion: LIVE_CAPTURE_SCHEMA_VERSION,
      normalizationVersion: LIVE_CAPTURE_NORMALIZATION_VERSION, signConvention: 'iso8855',
      filename: `${safeLayout}_${snapshot.session?.kind ?? 'unknown'}_${new Date(now).toISOString().replace(/:/g, '-')}_${recordingId}.live.duckdb`,
      layoutKey: snapshot.identity?.layoutKey ?? null, trackName: reading.trackName, driverName: player.driverName ?? '',
      vehicleName: player.vehicleName, vehicleModel: snapshot.identity?.vehicleModel ?? null,
      carClass: snapshot.identity?.carClass ?? null, sessionCode: reading.sessionCode, sessionKind: snapshot.session?.kind ?? 'unknown',
      startedAt: now, updatedAt: now, firstElapsedSeconds: reading.currentEt, lastElapsedSeconds: reading.currentEt,
      endedAt: null, status: 'recording', samples: 0, droppedSamples: 0, anchors: [], sessionId: null, gameVersion: null,
    };
    this.sessionKey = key;
    this.diagnostics?.begin(this.manifest.filename, recordingId);
    this.diagnostics?.record({ kind: 'session', at: now, data: this.manifest });
    this.lastSample = prior?.lastElapsedSeconds ?? -Infinity;
    this.lastObservation.clear();
    this.terrainMaterials = [];
    this.audit = new LiveAuditTracker(() => recordingId, record => this.observe({
      source: 'recorder', kind: 'strategy-audit-v1', elapsedSeconds: record.snapshot.session?.elapsedSeconds ?? null,
      receivedAt: record.recordedAt, data: record,
    }));
    this.error = null;
    this.ensureWorker();
    this.flush(true);
  }

  private ensureWorker(): void {
    if (this.worker) return;
    const worker = this.options.createWorker?.() ?? new Worker(
      findWorkerBootstrap(import.meta.url, ['live', 'capture', 'recordingWorkerBootstrap.mjs']),
      { workerData: { directory: this.directory } },
    );
    this.worker = worker;
    worker.unref();
    worker.on('message', (message: unknown) => {
      if (!isWorkerMessage<LiveCaptureWriteResult>(message, ['persisted', 'failed', 'closed', 'linked', 'catalogued'])) return;
      if (message.type === 'persisted') {
        const expected = this.pending.delete(message.sequence);
        const recycled = message.recycledSamples;
        if (expected && recycled instanceof ArrayBuffer && recycled.byteLength === BATCH_SAMPLES * LIVE_CAPTURE_SAMPLE_WIDTH * 8
          && this.spareBuffers.length < LIVE_CAPTURE_PENDING_BATCHES + LIVE_CAPTURE_FINALIZATION_SLOTS) this.spareBuffers.push(recycled);
        try { this.options.onPersist(message.manifest, message.bytes); }
        catch (error) { this.error = `Recording index: ${error instanceof Error ? error.message : String(error)}`; }
        this.pumpLinks();
        this.closeIfIdle(worker);
      } else if (message.type === 'linked') {
        const link = this.links.get(message.recordingId);
        const written = this.pendingLinks.get(message.recordingId);
        if (written !== undefined) this.linked.set(message.recordingId, written);
        if (link && written === JSON.stringify([link.sessionId, link.gameVersion])) this.links.delete(message.recordingId);
        this.pendingLinks.delete(message.recordingId);
        this.pumpLinks();
        this.closeIfIdle(worker);
      } else if (message.type === 'catalogued') {
        for (const { manifest } of message.recordings) {
          const link = this.links.get(manifest.recordingId);
          if (link) link.filename = manifest.filename;
        }
        try { this.options.onCatalog?.(message.recordings, message.errors); }
        catch (error) { this.error = `Recording catalog: ${error instanceof Error ? error.message : String(error)}`; }
        this.catalogResolve?.();
        this.catalogResolve = null;
        this.catalogPromise = null;
        this.catalogSent = false;
        this.pumpLinks();
        this.closeIfIdle(worker);
      } else if (message.type === 'failed') {
        this.diagnostics?.record({ kind: 'capture-failure', at: this.now(), data: message });
        this.error = message.error;
        if (message.sequence !== undefined) this.pending.delete(message.sequence);
        if (message.operation === 'link' || message.recordingId !== undefined) {
          this.links.clear(); this.pendingLinks.clear();
        }
        this.catalogResolve?.(); this.catalogResolve = null; this.catalogPromise = null; this.catalogSent = false;
        this.closeIfIdle(worker);
      }
      // Wait for worker exit rather than the close callback, so native handles are released.
    });
    worker.on('error', (error: Error) => {
      this.diagnostics?.record({ kind: 'capture-failure', at: this.now(), data: { error: error.message } });
      this.error = error.message; this.pending.clear();
      this.catalogResolve?.(); this.catalogResolve = null; this.catalogPromise = null; this.catalogSent = false;
    });
    worker.on('exit', (code: number) => {
      const expected = this.closingWorker;
      this.diagnostics?.record({ kind: 'capture-worker-exit', at: this.now(), data: { code, expected } });
      if (this.worker === worker) { this.worker = null; this.closingWorker = false; }
      if (!this.stopped && !expected) this.error ??= `Live capture writer exited (${code})`;
      this.pending.clear();
      this.pendingLinks.clear();
      if (!expected) {
        this.catalogResolve?.(); this.catalogResolve = null; this.catalogPromise = null; this.catalogSent = false;
      }
      this.closeResolve?.();
      if (!this.stopped && expected) {
        if (this.manifest) { this.ensureWorker(); this.flush(true); }
        else this.pumpLinks();
      }
    });
    this.timer ??= setInterval(() => this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  private flush(force = false): void {
    this.diagnostics?.record({ kind: 'capture-health', at: this.now(), data: this.status() });
    if (!this.manifest || !this.worker || this.closingWorker || this.error) return;
    if (this.pending.size >= LIVE_CAPTURE_PENDING_BATCHES + (force ? LIVE_CAPTURE_FINALIZATION_SLOTS : 0)) {
      if (force) this.error = 'Live capture writer cannot finalize while its bounded queue is full';
      return;
    }
    if (!force && !this.sampleCount && !this.observations.length) return;
    const samples = this.sampleCount > 0 ? this.buffer.subarray(0, this.sampleCount * LIVE_CAPTURE_SAMPLE_WIDTH) : new Float64Array(0);
    if (this.sampleCount > 0) {
      const spare = this.spareBuffers.pop();
      this.buffer = spare ? new Float64Array(spare) : new Float64Array(BATCH_SAMPLES * LIVE_CAPTURE_SAMPLE_WIDTH);
    }
    const batch: LiveCaptureBatch = {
      type: 'batch', sequence: ++this.sequence,
      manifest: { ...this.manifest, anchors: this.manifest.anchors.map(anchor => ({ ...anchor })) },
      samples, observations: this.observations,
    };
    this.pending.add(batch.sequence);
    this.sampleCount = 0;
    this.observations = [];
    this.observationBytes = 0;
    try { this.worker.postMessage(batch, [samples.buffer]); }
    catch (error) { this.pending.delete(batch.sequence); this.error = error instanceof Error ? error.message : String(error); }
  }

  private finish(status: LiveCaptureManifest['status']): void {
    if (!this.manifest) return;
    // Finalize in the owning recording before any transition can open another file.
    this.audit?.end(this.now());
    this.audit = null;
    this.manifest.status = status;
    this.manifest.endedAt = status === 'completed' ? this.now() : null;
    this.manifest.updatedAt = Math.max(this.manifest.updatedAt, this.now());
    this.flush(true);
    this.diagnostics?.record({ kind: 'session-end', at: this.now(), data: { status, manifest: this.manifest } });
    this.diagnostics?.end(resolvedCaptureFilename(this.manifest));
    this.recoverable ??= [];
    this.recoverable = this.recoverable.filter(record => record.recordingId !== this.manifest?.recordingId);
    if (status === 'interrupted') this.recoverable.push(this.manifest);
    this.manifest = null;
    this.sessionKey = '';
    this.sampleCount = 0;
    this.observations = [];
    this.observationBytes = 0;
  }

  private pumpLinks(): void {
    if (this.manifest || this.stopped || this.closingWorker || this.pending.size || this.error) return;
    if (this.catalogPromise) {
      if (!this.catalogSent) {
        this.ensureWorker();
        this.catalogSent = true;
        this.worker?.postMessage({ type: 'catalog' });
      }
      return;
    }
    if (!this.links.size) return;
    this.ensureWorker();
    for (const link of this.links.values()) {
      if (this.pendingLinks.size >= 2) break;
      if (this.pendingLinks.has(link.recordingId)) continue;
      this.pendingLinks.set(link.recordingId, JSON.stringify([link.sessionId, link.gameVersion]));
      this.worker?.postMessage({ type: 'link', ...link });
    }
  }

  private closeIfIdle(worker: CaptureWorker): void {
    if (!this.manifest && !this.pending.size && !this.links.size && !this.catalogPromise && !this.stopped && !this.closingWorker) {
      this.closingWorker = true;
      worker.postMessage({ type: 'close' });
    }
  }
}
