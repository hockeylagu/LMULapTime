import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import duckdb from 'duckdb';
import type { DuckDbError } from 'duckdb';
import {
  LIVE_CAPTURE_NORMALIZATION_VERSION,
  LIVE_CAPTURE_SAMPLE_WIDTH,
  LIVE_CAPTURE_SCHEMA_VERSION,
  LIVE_CAPTURE_SOURCE,
} from '../../../shared/types/liveCapture.js';
import type {
  LiveCaptureBatch,
  LiveCaptureManifest,
  LiveCaptureObservation,
} from '../../../shared/types/liveCapture.js';
import { LIVE_CAPTURE_CHANNELS } from './channels.js';

const MAX_ROWS_PER_INSERT = 512;
const MAX_CATALOG_FILES = 10_000;
const MAX_CATALOG_METADATA_BYTES = 2 * 1024 * 1024;
const RECORDING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]*$/;
const EXPECTED_TABLES = [
  'capture_batches', 'capture_channels', 'capture_manifest', 'capture_metadata', 'capture_observations', 'capture_samples',
] as const;

type Db = duckdb.Database;
type Connection = duckdb.Connection;
type Statement = duckdb.Statement;
type DbRow = Record<string, unknown>;
type WriteAnswer = { manifest: LiveCaptureManifest; bytes: number };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function callbackPromise<T>(invoke: (callback: (error: DuckDbError | null, result: T) => void) => unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      invoke((error, result) => error ? reject(error) : resolve(result));
    } catch (error: unknown) {
      reject(error);
    }
  });
}

function run(connection: Connection, sql: string, values: unknown[] = []): Promise<void> {
  return callbackPromise<void>(callback => connection.run(sql, ...values, callback));
}

function all(connection: Connection, sql: string, values: unknown[] = []): Promise<DbRow[]> {
  return callbackPromise<DbRow[]>(callback => connection.all(sql, ...values, callback) as unknown as void);
}

function closeConnection(connection: Connection): Promise<void> {
  return callbackPromise<void>(callback => connection.close(callback));
}

function closeDatabase(database: Db): Promise<void> {
  return callbackPromise<void>(callback => database.close(callback));
}

function openDatabase(filename: string, readOnly = false): Promise<Db> {
  return new Promise<Db>((resolve, reject) => {
    let database: Db;
    try {
      const onOpen = (error: DuckDbError | null): void => {
        if (error) reject(error);
        else resolve(database);
      };
      database = readOnly
        ? new duckdb.Database(filename, duckdb.OPEN_READONLY, onOpen)
        : new duckdb.Database(filename, onOpen);
    } catch (error: unknown) {
      reject(error);
    }
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullOrFinite(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function requiredText(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`Invalid live capture ${name}`);
}

function validCaptureFilename(filename: string, recordingId: string): boolean {
  return path.basename(filename) === filename
    && !filename.includes('/') && !filename.includes('\\')
    && SAFE_FILENAME_PATTERN.test(filename)
    && !filename.endsWith('.') && !filename.endsWith(' ')
    && filename.endsWith(`${recordingId}.live.duckdb`);
}

function stableManifest(manifest: LiveCaptureManifest): string {
  const ordered: LiveCaptureManifest = {
    recordingId: manifest.recordingId,
    source: manifest.source,
    schemaVersion: manifest.schemaVersion,
    normalizationVersion: manifest.normalizationVersion,
    signConvention: manifest.signConvention,
    filename: manifest.filename,
    layoutKey: manifest.layoutKey,
    trackName: manifest.trackName,
    driverName: manifest.driverName,
    vehicleName: manifest.vehicleName,
    vehicleModel: manifest.vehicleModel,
    carClass: manifest.carClass,
    sessionCode: manifest.sessionCode,
    sessionKind: manifest.sessionKind,
    startedAt: manifest.startedAt,
    updatedAt: manifest.updatedAt,
    firstElapsedSeconds: manifest.firstElapsedSeconds,
    lastElapsedSeconds: manifest.lastElapsedSeconds,
    endedAt: manifest.endedAt,
    status: manifest.status,
    samples: manifest.samples,
    droppedSamples: manifest.droppedSamples,
    anchors: manifest.anchors.map(anchor => ({
      lapNumber: anchor.lapNumber,
      startSeconds: anchor.startSeconds,
      lapSeconds: anchor.lapSeconds,
    })),
    sessionId: manifest.sessionId,
    gameVersion: manifest.gameVersion,
  };
  return JSON.stringify(ordered);
}

function manifestMetadata(manifest: LiveCaptureManifest): Array<[string, string]> {
  return [
    ['recording_id', manifest.recordingId],
    ['source', manifest.source],
    ['schema_version', String(manifest.schemaVersion)],
    ['normalization_version', String(manifest.normalizationVersion)],
    ['sign_convention', manifest.signConvention],
    ['filename', manifest.filename],
  ];
}

function immutableManifestMatches(left: LiveCaptureManifest, right: LiveCaptureManifest): boolean {
  return left.recordingId === right.recordingId
    && left.source === right.source
    && left.schemaVersion === right.schemaVersion
    && left.normalizationVersion === right.normalizationVersion
    && left.signConvention === right.signConvention
    && left.filename === right.filename
    && (left.layoutKey === right.layoutKey || left.layoutKey === null && right.layoutKey !== null)
    && left.trackName === right.trackName
    && left.driverName === right.driverName
    && left.vehicleName === right.vehicleName
    && left.vehicleModel === right.vehicleModel
    && left.carClass === right.carClass
    && left.sessionCode === right.sessionCode
    && left.sessionKind === right.sessionKind
    && left.startedAt === right.startedAt
    && (left.gameVersion === null || right.gameVersion === null || left.gameVersion === right.gameVersion)
    && (left.sessionId === null || right.sessionId === null || left.sessionId === right.sessionId);
}

function validateManifest(manifest: LiveCaptureManifest): void {
  if (!RECORDING_ID_PATTERN.test(manifest.recordingId)) throw new Error('Live capture recordingId must be a UUID');
  if (!validCaptureFilename(manifest.filename, manifest.recordingId)) throw new Error('Live capture filename must be a safe basename ending with its UUID and .live.duckdb');
  if (manifest.source !== LIVE_CAPTURE_SOURCE
    || manifest.schemaVersion !== LIVE_CAPTURE_SCHEMA_VERSION
    || manifest.normalizationVersion !== LIVE_CAPTURE_NORMALIZATION_VERSION
    || manifest.signConvention !== 'iso8855') throw new Error('Live capture schema signature does not match this build');
  requiredText(manifest.trackName, 'trackName');
  if (typeof manifest.driverName !== 'string') throw new Error('Invalid live capture driverName');
  requiredText(manifest.vehicleName, 'vehicleName');
  requiredText(manifest.sessionKind, 'sessionKind');
  if (manifest.layoutKey !== null && typeof manifest.layoutKey !== 'string') throw new Error('Invalid live capture layoutKey');
  if (manifest.vehicleModel !== null && typeof manifest.vehicleModel !== 'string') throw new Error('Invalid live capture vehicleModel');
  if (manifest.carClass !== null && typeof manifest.carClass !== 'string') throw new Error('Invalid live capture carClass');
  if (manifest.sessionId !== null && typeof manifest.sessionId !== 'string') throw new Error('Invalid live capture sessionId');
  if (manifest.gameVersion !== null && typeof manifest.gameVersion !== 'string') throw new Error('Invalid live capture gameVersion');
  if (!Number.isSafeInteger(manifest.sessionCode) || manifest.sessionCode < 0) throw new Error('Invalid live capture sessionCode');
  if (!isFiniteNumber(manifest.startedAt) || !isFiniteNumber(manifest.updatedAt) || manifest.updatedAt < manifest.startedAt) {
    throw new Error('Invalid live capture timestamps');
  }
  if (!isFiniteNumber(manifest.firstElapsedSeconds) || !isFiniteNumber(manifest.lastElapsedSeconds)
    || manifest.firstElapsedSeconds < 0 || manifest.lastElapsedSeconds < manifest.firstElapsedSeconds) {
    throw new Error('Invalid live capture elapsed time range');
  }
  if (manifest.endedAt !== null && (!isFiniteNumber(manifest.endedAt) || manifest.endedAt < manifest.startedAt)) {
    throw new Error('Invalid live capture endedAt');
  }
  if (!['recording', 'completed', 'interrupted'].includes(manifest.status)) throw new Error('Invalid live capture status');
  if (!Number.isSafeInteger(manifest.samples) || manifest.samples < 0
    || !Number.isSafeInteger(manifest.droppedSamples) || manifest.droppedSamples < 0) {
    throw new Error('Invalid live capture sample counts');
  }
  if (!Array.isArray(manifest.anchors)) throw new Error('Invalid live capture lap anchors');
  for (const anchor of manifest.anchors) {
    if (!Number.isSafeInteger(anchor.lapNumber) || anchor.lapNumber < 0
      || !isFiniteNumber(anchor.startSeconds) || anchor.startSeconds < 0
      || !isNullOrFinite(anchor.lapSeconds) || (anchor.lapSeconds !== null && anchor.lapSeconds < 0)) {
      throw new Error('Invalid live capture lap anchor');
    }
  }
}

function serializeObservation(observation: LiveCaptureObservation): string {
  if (!['shared-memory', 'rest', 'recorder'].includes(observation.source)) throw new Error('Invalid live capture observation source');
  requiredText(observation.kind, 'observation kind');
  if (!isNullOrFinite(observation.elapsedSeconds) || (observation.elapsedSeconds !== null && observation.elapsedSeconds < 0)) {
    throw new Error('Invalid live capture observation elapsedSeconds');
  }
  if (!isFiniteNumber(observation.receivedAt) || observation.receivedAt < 0) throw new Error('Invalid live capture observation receivedAt');
  const started = observation.requestStartedAt;
  const finished = observation.requestFinishedAt;
  if ((started === undefined) !== (finished === undefined)
    || (started !== undefined && (!isFiniteNumber(started) || !isFiniteNumber(finished) || finished < started))) {
    throw new Error('Invalid live capture observation request interval');
  }
  let data: string | undefined;
  try { data = JSON.stringify(observation.data); }
  catch (error: unknown) { throw new Error(`Live capture observation data is not JSON: ${error instanceof Error ? error.message : String(error)}`); }
  if (data === undefined) throw new Error('Live capture observation data must have a JSON representation');
  return data;
}

function validateBatch(batch: LiveCaptureBatch): { rowCount: number; observationData: string[]; fingerprint: string; manifestJson: string } {
  if (batch.type !== 'batch') throw new Error('Invalid live capture message type');
  validateManifest(batch.manifest);
  if (!Number.isSafeInteger(batch.sequence) || batch.sequence < 0) throw new Error('Invalid live capture batch sequence');
  if (!(batch.samples instanceof Float64Array) || batch.samples.length % LIVE_CAPTURE_SAMPLE_WIDTH !== 0) {
    throw new Error('Live capture samples must be a Float64Array with complete 33-value rows');
  }
  const rowCount = batch.samples.length / LIVE_CAPTURE_SAMPLE_WIDTH;
  if (rowCount > 10_000) throw new Error('Live capture batch exceeds the 10,000-sample limit');
  if (!Array.isArray(batch.observations)) throw new Error('Live capture observations must be an array');
  if (batch.observations.length > 10_000) throw new Error('Live capture batch exceeds the observation limit');

  let priorElapsed = -Infinity;
  for (let row = 0; row < rowCount; row++) {
    const offset = row * LIVE_CAPTURE_SAMPLE_WIDTH;
    const elapsed = batch.samples[offset];
    const lap = batch.samples[offset + 1];
    const lapStart = batch.samples[offset + 2];
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed < priorElapsed) throw new Error(`Malformed elapsed timestamp at sample ${row}`);
    if (!Number.isSafeInteger(lap) || lap < 0) throw new Error(`Malformed lap number at sample ${row}`);
    if (!(Number.isNaN(lapStart) || Number.isFinite(lapStart) && lapStart >= 0)) throw new Error(`Malformed lap start at sample ${row}`);
    for (let channel = 0; channel < LIVE_CAPTURE_CHANNELS.length; channel++) {
      const value = batch.samples[offset + 3 + channel];
      if (!Number.isNaN(value) && !Number.isFinite(value)) throw new Error(`Malformed channel value at sample ${row}, channel ${channel}`);
    }
    priorElapsed = elapsed;
  }
  const observationData = batch.observations.map(serializeObservation);
  const manifestJson = stableManifest(batch.manifest);
  const hash = createHash('sha256');
  hash.update(String(batch.sequence));
  hash.update('\0');
  hash.update(manifestJson);
  hash.update('\0');
  hash.update(Buffer.from(batch.samples.buffer, batch.samples.byteOffset, batch.samples.byteLength));
  hash.update('\0');
  for (const observation of batch.observations) {
    hash.update(JSON.stringify({
      elapsedSeconds: observation.elapsedSeconds,
      receivedAt: observation.receivedAt,
      source: observation.source,
      kind: observation.kind,
      requestStartedAt: observation.requestStartedAt ?? null,
      requestFinishedAt: observation.requestFinishedAt ?? null,
      data: JSON.parse(serializeObservation(observation)) as unknown,
    }));
    hash.update('\0');
  }
  return { rowCount, observationData, fingerprint: hash.digest('hex'), manifestJson };
}

function columnSql(): string {
  return LIVE_CAPTURE_CHANNELS.map(channel => `"${channel.name}" DOUBLE`).join(', ');
}

function expectedMetadata(manifest: LiveCaptureManifest): Map<string, string> {
  return new Map(manifestMetadata(manifest));
}

function rowString(row: DbRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`Invalid DuckDB ${key} value`);
  return value;
}

export class LiveCaptureRecordingStore {
  private database: Db | null = null;
  private connection: Connection | null = null;
  private filename: string | null = null;
  private currentManifest: LiveCaptureManifest | null = null;
  private lastSequence = -1;
  private lastSampleElapsed: number | null = null;
  private closed = false;
  private queue: Promise<unknown> = Promise.resolve();

  public constructor(private readonly directory: string) {}

  public write(batch: LiveCaptureBatch): Promise<WriteAnswer> {
    if (this.closed) return Promise.reject(new Error('Live capture recording store is closed'));
    const operation = this.queue.then(() => this.writeSerial(batch));
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  public link(filename: string, recordingId: string, sessionId: string | null, gameVersion: string | null): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Live capture recording store is closed'));
    const operation = this.queue.then(() => this.linkSerial(filename, recordingId, sessionId, gameVersion));
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  public catalog(): Promise<{ recordings: Array<{ manifest: LiveCaptureManifest; bytes: number }>; errors: Array<{ filename: string; error: string }> }> {
    if (this.closed) return Promise.reject(new Error('Live capture recording store is closed'));
    const operation = this.queue.then(() => this.catalogSerial());
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async catalogSerial(): Promise<{ recordings: Array<{ manifest: LiveCaptureManifest; bytes: number }>; errors: Array<{ filename: string; error: string }> }> {
    // Catalog is requested only while the recorder is idle. Closing defensively also
    // ensures this worker never holds a writer handle while opening read-only files.
    await this.closeCurrent();
    const recordings: Array<{ manifest: LiveCaptureManifest; bytes: number }> = [];
    const errors: Array<{ filename: string; error: string }> = [];
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(this.directory, { withFileTypes: true });
    } catch (error: unknown) {
      return { recordings, errors: [{ filename: '<directory>', error: `Cannot read live capture directory: ${errorText(error)}` }] };
    }
    const candidates = entries.filter(entry => entry.name.toLowerCase().endsWith('.live.duckdb'));
    if (candidates.length > MAX_CATALOG_FILES) {
      return { recordings, errors: [{ filename: '<directory>', error: `Live capture catalog exceeds the ${MAX_CATALOG_FILES}-file limit` }] };
    }
    for (const entry of candidates) {
      const filename = entry.name;
      try {
        const target = path.resolve(this.directory, filename);
        if (path.dirname(target) !== path.resolve(this.directory)) throw new Error('Catalog path escaped its directory');
        const stat = await fs.promises.lstat(target);
        if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Catalog path is not a regular file');
        const manifest = await this.readCatalogFile(target, filename);
        let bytes = stat.size;
        try { bytes += (await fs.promises.stat(`${target}.wal`)).size; }
        catch (error: unknown) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
        }
        recordings.push({ manifest, bytes });
      } catch (error: unknown) {
        errors.push({ filename, error: errorText(error) });
      }
    }
    recordings.sort((left, right) => left.manifest.startedAt - right.manifest.startedAt || left.manifest.recordingId.localeCompare(right.manifest.recordingId));
    return { recordings, errors };
  }

  private async readCatalogFile(target: string, filename: string): Promise<LiveCaptureManifest> {
    const database = await openDatabase(target, true);
    const connection = database.connect();
    let failure: unknown;
    try {
      const existingTables = (await all(connection,
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"))
        .map(row => rowString(row, 'table_name'));
      const tableSet = new Set(existingTables.map(name => name.toLowerCase()));
      if (!EXPECTED_TABLES.every(table => tableSet.has(table))) throw new Error('Not a compatible live capture schema');
      const sizeRows = await all(connection,
        'SELECT COALESCE(SUM(octet_length(CAST(value AS BLOB))), 0) AS metadata_bytes FROM capture_metadata');
      const metadataBytes = sizeRows[0]?.metadata_bytes;
      if ((typeof metadataBytes !== 'number' && typeof metadataBytes !== 'bigint')
        || Number(metadataBytes) > MAX_CATALOG_METADATA_BYTES) {
        throw new Error(`Live capture metadata exceeds the ${MAX_CATALOG_METADATA_BYTES}-byte catalog limit`);
      }
      const signatureRows = await all(connection,
        "SELECT key, value FROM capture_metadata WHERE key IN ('source', 'schema_version')");
      const signature = new Map(signatureRows.map(row => [rowString(row, 'key'), rowString(row, 'value')]));
      if (signature.get('source') !== LIVE_CAPTURE_SOURCE
        || signature.get('schema_version') !== String(LIVE_CAPTURE_SCHEMA_VERSION)) {
        throw new Error('Live capture source or schema signature mismatch');
      }
      const manifestRows = await all(connection,
        'SELECT recording_id, manifest_json FROM capture_manifest WHERE singleton = TRUE');
      if (manifestRows.length !== 1) throw new Error('Live capture manifest is missing or ambiguous');
      const json = rowString(manifestRows[0], 'manifest_json');
      if (Buffer.byteLength(json, 'utf8') > MAX_CATALOG_METADATA_BYTES) throw new Error('Live capture manifest exceeds the catalog size limit');
      let parsed: unknown;
      try { parsed = JSON.parse(json) as unknown; }
      catch { throw new Error('Live capture manifest JSON is corrupt'); }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Live capture manifest JSON is invalid');
      const manifest = parsed as LiveCaptureManifest;
      if (manifest.recordingId !== manifestRows[0].recording_id) throw new Error('Live capture manifest recording ID mismatch');
      validateManifest(manifest);
      if (manifest.filename !== filename) throw new Error('Live capture manifest filename does not match its file');
      await this.verifyCatalog(connection, manifest);
      const counts = await all(connection,
        'SELECT count(*) AS sample_count FROM capture_samples');
      const sampleCount = counts[0]?.sample_count;
      if ((typeof sampleCount !== 'number' && typeof sampleCount !== 'bigint') || Number(sampleCount) !== manifest.samples) {
        throw new Error('Live capture manifest sample count does not match stored samples');
      }
      return manifest;
    } catch (error: unknown) {
      failure = error;
      throw error;
    } finally {
      try { await closeConnection(connection); }
      catch (error: unknown) { failure ??= error; }
      try { await closeDatabase(database); }
      catch (error: unknown) { failure ??= error; }
      if (failure) throw failure;
    }
  }

  private async linkSerial(filename: string, recordingId: string, sessionId: string | null, gameVersion: string | null): Promise<void> {
    if (!RECORDING_ID_PATTERN.test(recordingId)) throw new Error('Live capture recordingId must be a UUID');
    if (!validCaptureFilename(filename, recordingId)) throw new Error('Live capture filename must be a safe basename ending with its UUID and .live.duckdb');
    if (sessionId !== null && (typeof sessionId !== 'string' || sessionId.trim().length === 0)) throw new Error('Invalid linked sessionId');
    if (gameVersion !== null && typeof gameVersion !== 'string') throw new Error('Invalid linked gameVersion');
    const target = path.resolve(this.directory, filename);
    const fileInfo = await fs.promises.lstat(target).catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (!fileInfo) throw new Error('Cannot link a missing live capture file');
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) throw new Error('Live capture path must be a regular file');
    if (this.filename !== target) {
      await this.closeCurrent();
      await this.openExisting(target);
    }
    const connection = this.connection;
    const manifest = this.currentManifest;
    if (!connection || !manifest) throw new Error('Live capture database is not open');
    if (manifest.recordingId !== recordingId || manifest.filename !== filename) throw new Error('Live capture ID does not match the stored manifest');
    validateManifest(manifest);
    if (manifest.sessionId === sessionId && manifest.gameVersion === gameVersion) return;
    const linked: LiveCaptureManifest = {
      ...manifest,
      sessionId,
      gameVersion,
      updatedAt: manifest.updatedAt,
    };
    await run(connection, 'BEGIN TRANSACTION');
    try {
      await run(connection,
        'UPDATE capture_manifest SET manifest_json = CAST(? AS JSON), updated_at = ? WHERE singleton = TRUE AND recording_id = ?',
        [stableManifest(linked), linked.updatedAt, recordingId]);
      await run(connection, 'COMMIT');
    } catch (error: unknown) {
      try { await run(connection, 'ROLLBACK'); } catch { /* Preserve the link failure. */ }
      throw error;
    }
    this.currentManifest = linked;
  }

  private async writeSerial(batch: LiveCaptureBatch): Promise<WriteAnswer> {
    const checked = validateBatch(batch);
    await fs.promises.mkdir(this.directory, { recursive: true });
    const target = path.resolve(this.directory, batch.manifest.filename);
    if (this.filename !== target) {
      await this.closeCurrent();
      await this.open(target, batch.manifest);
    }
    const connection = this.connection;
    if (!connection) throw new Error('Live capture database is not open');

    const duplicate = await all(connection, 'SELECT fingerprint, manifest_json FROM capture_batches WHERE sequence = ?', [batch.sequence]);
    if (duplicate.length > 0) {
      const prior = duplicate[0];
      if (rowString(prior, 'fingerprint') !== checked.fingerprint || rowString(prior, 'manifest_json') !== checked.manifestJson) {
        throw new Error(`Live capture batch sequence ${batch.sequence} was already committed with different content`);
      }
      const stored = await this.readManifest(connection);
      if (!stored) throw new Error('Live capture manifest is missing after a committed batch');
      return { manifest: stored, bytes: this.fileBytes(target) };
    }
    if (batch.sequence <= this.lastSequence) throw new Error(`Live capture batch sequence ${batch.sequence} is older than the committed sequence`);

    const priorManifest = this.currentManifest;
    if (priorManifest && !immutableManifestMatches(priorManifest, batch.manifest)) {
      throw new Error('Live capture manifest identity changed while recording');
    }
    if (priorManifest?.status === 'completed'
      || priorManifest?.status === 'interrupted' && batch.manifest.status !== 'recording') {
      throw new Error('Cannot append to a finalized live capture');
    }
    if (priorManifest && batch.manifest.droppedSamples < priorManifest.droppedSamples) throw new Error('Live capture dropped sample count cannot decrease');
    if (batch.manifest.samples !== (priorManifest?.samples ?? 0) + checked.rowCount) {
      throw new Error('Live capture manifest sample count does not match this batch');
    }
    const batchLast = checked.rowCount > 0 ? batch.samples[batch.samples.length - LIVE_CAPTURE_SAMPLE_WIDTH] : null;
    if (priorManifest) {
      if (batch.manifest.firstElapsedSeconds !== priorManifest.firstElapsedSeconds
        || batch.manifest.lastElapsedSeconds < priorManifest.lastElapsedSeconds) {
        throw new Error('Live capture manifest elapsed range moved backwards');
      }
    }
    if (batchLast !== null && batch.manifest.lastElapsedSeconds < batchLast) {
      throw new Error('Live capture manifest lastElapsedSeconds precedes a stored sample');
    }
    if (this.lastSampleElapsed !== null && batch.samples.length > 0 && batch.samples[0] < this.lastSampleElapsed) {
      throw new Error('Live capture sample time moved backwards');
    }
    if (priorManifest?.sessionId && batch.manifest.sessionId !== priorManifest.sessionId) {
      throw new Error('Verified live capture session ownership cannot change');
    }

    await run(connection, 'BEGIN TRANSACTION');
    try {
      await this.insertSamples(connection, batch, checked.rowCount, priorManifest?.samples ?? 0);
      await this.insertObservations(connection, batch, checked.observationData);
      await run(connection,
        'UPDATE capture_manifest SET recording_id = ?, manifest_json = CAST(? AS JSON), updated_at = ? WHERE singleton = TRUE',
        [batch.manifest.recordingId, checked.manifestJson, batch.manifest.updatedAt]);
      await run(connection,
        'INSERT INTO capture_batches (sequence, fingerprint, manifest_json, sample_count) VALUES (?, ?, CAST(? AS JSON), ?)',
        [batch.sequence, checked.fingerprint, checked.manifestJson, checked.rowCount]);
      await run(connection, 'COMMIT');
    } catch (error: unknown) {
      try { await run(connection, 'ROLLBACK'); } catch { /* Preserve the write failure. */ }
      throw error;
    }
    this.currentManifest = batch.manifest;
    this.lastSequence = batch.sequence;
    if (batchLast !== null) this.lastSampleElapsed = batchLast;
    return { manifest: batch.manifest, bytes: this.fileBytes(target) };
  }

  private async open(target: string, incoming: LiveCaptureManifest): Promise<void> {
    const existingPath = await fs.promises.lstat(target).catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (existingPath?.isSymbolicLink() || (existingPath && !existingPath.isFile())) throw new Error('Live capture path must be a regular file');
    const database = await openDatabase(target);
    const connection = database.connect();
    this.database = database;
    this.connection = connection;
    this.filename = target;
    try {
      const existingTables = (await all(connection,
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"))
        .map(row => rowString(row, 'table_name'));
      const tableSet = new Set(existingTables.map(name => name.toLowerCase()));
      const hasManifestTable = tableSet.has('capture_manifest');
      if (existingTables.length > 0 && !EXPECTED_TABLES.every(table => tableSet.has(table))) {
        throw new Error('Existing DuckDB file is not a compatible live capture');
      }
      await run(connection, 'BEGIN TRANSACTION');
      try {
        await run(connection, `CREATE TABLE IF NOT EXISTS capture_manifest (
          singleton BOOLEAN PRIMARY KEY CHECK (singleton = TRUE), recording_id VARCHAR NOT NULL,
          manifest_json JSON NOT NULL, updated_at DOUBLE NOT NULL)`);
        await run(connection, 'CREATE TABLE IF NOT EXISTS capture_metadata (key VARCHAR PRIMARY KEY, value VARCHAR NOT NULL)');
        await run(connection, `CREATE TABLE IF NOT EXISTS capture_channels (
          ordinal INTEGER PRIMARY KEY, name VARCHAR UNIQUE NOT NULL, unit VARCHAR NOT NULL,
          source_field VARCHAR NOT NULL, frame VARCHAR NOT NULL, verified BOOLEAN NOT NULL)`);
        await run(connection, `CREATE TABLE IF NOT EXISTS capture_samples (
          sample_index BIGINT NOT NULL, elapsed_seconds DOUBLE NOT NULL, lap_number INTEGER NOT NULL,
          lap_start_seconds DOUBLE, ${columnSql()})`);
        await run(connection, `CREATE TABLE IF NOT EXISTS capture_observations (
          observation_id BIGINT PRIMARY KEY, elapsed_seconds DOUBLE, received_at DOUBLE NOT NULL,
          request_started_at DOUBLE, request_finished_at DOUBLE, source VARCHAR NOT NULL, kind VARCHAR NOT NULL,
          data JSON NOT NULL)`);
        await run(connection, `CREATE TABLE IF NOT EXISTS capture_batches (
          sequence BIGINT PRIMARY KEY, fingerprint VARCHAR NOT NULL, manifest_json JSON NOT NULL, sample_count INTEGER NOT NULL)`);
        if (!hasManifestTable && existingTables.length > 0) throw new Error('Refusing to initialize a non-empty DuckDB file');
        if (!hasManifestTable) {
          const metadataInsert = connection.prepare('INSERT INTO capture_metadata VALUES (?, ?)');
          for (const [key, value] of manifestMetadata(incoming)) await this.runPrepared(metadataInsert, [key, value]);
          const channelInsert = connection.prepare('INSERT INTO capture_channels VALUES (?, ?, ?, ?, ?, ?)');
          for (const [ordinal, channel] of LIVE_CAPTURE_CHANNELS.entries()) {
            await this.runPrepared(channelInsert, [ordinal, channel.name, channel.unit, channel.sourceField, channel.frame, channel.verified]);
          }
          await callbackPromise<void>(callback => metadataInsert.finalize(callback));
          await callbackPromise<void>(callback => channelInsert.finalize(callback));
          const initial: LiveCaptureManifest = {
            ...incoming,
            updatedAt: incoming.startedAt,
            endedAt: null,
            status: 'recording',
            samples: 0,
            droppedSamples: 0,
          };
          await run(connection, 'INSERT INTO capture_manifest VALUES (TRUE, ?, CAST(? AS JSON), ?)',
            [initial.recordingId, stableManifest(initial), initial.updatedAt]);
        }
        await run(connection, 'COMMIT');
      } catch (error: unknown) {
        try { await run(connection, 'ROLLBACK'); } catch { /* Keep the initialization error. */ }
        throw error;
      }
      const stored = await this.readManifest(connection);
      if (!stored) throw new Error('Live capture manifest is missing');
      if (!immutableManifestMatches(stored, incoming)) throw new Error('Live capture ID collides with a different manifest');
      await this.verifyCatalog(connection, stored);
      this.currentManifest = stored;
      const sequence = await all(connection, 'SELECT COALESCE(MAX(sequence), -1) AS last_sequence FROM capture_batches');
      const last = sequence[0]?.last_sequence;
      if (typeof last !== 'bigint' && typeof last !== 'number') throw new Error('Invalid live capture sequence state');
      this.lastSequence = Number(last);
      const count = await all(connection, 'SELECT count(*) AS sample_count FROM capture_samples');
      const sampleCount = count[0]?.sample_count;
      if ((typeof sampleCount !== 'bigint' && typeof sampleCount !== 'number') || Number(sampleCount) !== stored.samples) {
        throw new Error('Live capture manifest sample count does not match stored samples');
      }
      const lastSample = await all(connection, 'SELECT max(elapsed_seconds) AS last_elapsed FROM capture_samples');
      const lastElapsed = lastSample[0]?.last_elapsed;
      if (lastElapsed !== null && typeof lastElapsed !== 'bigint' && typeof lastElapsed !== 'number') {
        throw new Error('Invalid live capture sample timestamp state');
      }
      this.lastSampleElapsed = lastElapsed === null ? null : Number(lastElapsed);
    } catch (error: unknown) {
      await this.closeCurrent();
      throw error;
    }
  }

  private async openExisting(target: string): Promise<void> {
    const database = await openDatabase(target);
    const connection = database.connect();
    this.database = database;
    this.connection = connection;
    this.filename = target;
    try {
      const existingTables = (await all(connection,
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"))
        .map(row => rowString(row, 'table_name'));
      const tableSet = new Set(existingTables.map(name => name.toLowerCase()));
      if (!EXPECTED_TABLES.every(table => tableSet.has(table))) throw new Error('Existing DuckDB file is not a compatible live capture');
      const manifest = await this.readManifest(connection);
      if (!manifest) throw new Error('Live capture manifest is missing');
      await this.verifyCatalog(connection, manifest);
      const sequence = await all(connection, 'SELECT COALESCE(MAX(sequence), -1) AS last_sequence FROM capture_batches');
      const last = sequence[0]?.last_sequence;
      if (typeof last !== 'bigint' && typeof last !== 'number') throw new Error('Invalid live capture sequence state');
      const count = await all(connection, 'SELECT count(*) AS sample_count FROM capture_samples');
      const sampleCount = count[0]?.sample_count;
      if ((typeof sampleCount !== 'bigint' && typeof sampleCount !== 'number') || Number(sampleCount) !== manifest.samples) {
        throw new Error('Live capture manifest sample count does not match stored samples');
      }
      const lastSample = await all(connection, 'SELECT max(elapsed_seconds) AS last_elapsed FROM capture_samples');
      const lastElapsed = lastSample[0]?.last_elapsed;
      if (lastElapsed !== null && typeof lastElapsed !== 'bigint' && typeof lastElapsed !== 'number') {
        throw new Error('Invalid live capture sample timestamp state');
      }
      this.currentManifest = manifest;
      this.lastSequence = Number(last);
      this.lastSampleElapsed = lastElapsed === null ? null : Number(lastElapsed);
    } catch (error: unknown) {
      try { await this.closeCurrent(); } catch { /* Preserve the existing-file validation error. */ }
      throw error;
    }
  }

  private async verifyCatalog(connection: Connection, manifest: LiveCaptureManifest): Promise<void> {
    const metadataRows = await all(connection, 'SELECT key, value FROM capture_metadata ORDER BY key');
    const metadata = new Map(metadataRows.map(row => [rowString(row, 'key'), rowString(row, 'value')]));
    for (const [key, value] of expectedMetadata(manifest)) {
      if (metadata.get(key) !== value) throw new Error(`Live capture metadata signature mismatch for ${key}`);
    }
    const channels = await all(connection,
      'SELECT ordinal, name, unit, source_field, frame, verified FROM capture_channels ORDER BY ordinal');
    if (channels.length !== LIVE_CAPTURE_CHANNELS.length) throw new Error('Live capture channel catalog has an incompatible size');
    for (let index = 0; index < LIVE_CAPTURE_CHANNELS.length; index++) {
      const stored = channels[index];
      const expected = LIVE_CAPTURE_CHANNELS[index];
      if (stored.ordinal !== index || stored.name !== expected.name || stored.unit !== expected.unit
        || stored.source_field !== expected.sourceField || stored.frame !== expected.frame || stored.verified !== expected.verified) {
        throw new Error(`Live capture channel catalog mismatch at channel ${index}`);
      }
    }
  }

  private async readManifest(connection: Connection): Promise<LiveCaptureManifest | null> {
    const rows = await all(connection, 'SELECT recording_id, manifest_json FROM capture_manifest WHERE singleton = TRUE');
    if (rows.length === 0) return null;
    const json = rowString(rows[0], 'manifest_json');
    let manifest: unknown;
    try { manifest = JSON.parse(json) as unknown; }
    catch { throw new Error('Live capture manifest JSON is corrupt'); }
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Live capture manifest JSON is invalid');
    const stored = manifest as LiveCaptureManifest;
    if (rows[0].recording_id !== stored.recordingId) throw new Error('Live capture manifest recording ID mismatch');
    validateManifest(stored);
    return stored;
  }

  private async insertSamples(connection: Connection, batch: LiveCaptureBatch, rowCount: number, sampleOffset: number): Promise<void> {
    for (let start = 0; start < rowCount; start += MAX_ROWS_PER_INSERT) {
      const count = Math.min(MAX_ROWS_PER_INSERT, rowCount - start);
      const tuple = `(${Array(4 + LIVE_CAPTURE_CHANNELS.length).fill('?').join(', ')})`;
      const sql = `INSERT INTO capture_samples VALUES ${Array(count).fill(tuple).join(', ')}`;
      const values: unknown[] = [];
      for (let row = start; row < start + count; row++) {
        const offset = row * LIVE_CAPTURE_SAMPLE_WIDTH;
        values.push(sampleOffset + row, batch.samples[offset], batch.samples[offset + 1], Number.isNaN(batch.samples[offset + 2]) ? null : batch.samples[offset + 2]);
        for (let channel = 0; channel < LIVE_CAPTURE_CHANNELS.length; channel++) {
          const value = batch.samples[offset + 3 + channel];
          values.push(!LIVE_CAPTURE_CHANNELS[channel].verified || Number.isNaN(value) ? null : value);
        }
      }
      await run(connection, sql, values);
    }
  }

  private async insertObservations(connection: Connection, batch: LiveCaptureBatch, data: string[]): Promise<void> {
    if (batch.observations.length === 0) return;
    const rows = await all(connection, 'SELECT COALESCE(MAX(observation_id), -1) AS last_id FROM capture_observations');
    const last = rows[0]?.last_id;
    if (typeof last !== 'bigint' && typeof last !== 'number') throw new Error('Invalid live capture observation state');
    const firstId = Number(last) + 1;
    for (let start = 0; start < batch.observations.length; start += MAX_ROWS_PER_INSERT) {
      const count = Math.min(MAX_ROWS_PER_INSERT, batch.observations.length - start);
      const tuple = '(?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))';
      const sql = `INSERT INTO capture_observations VALUES ${Array(count).fill(tuple).join(', ')}`;
      const values: unknown[] = [];
      for (let index = start; index < start + count; index++) {
        const observation = batch.observations[index];
        values.push(firstId + index, observation.elapsedSeconds, observation.receivedAt,
          observation.requestStartedAt ?? null, observation.requestFinishedAt ?? null,
          observation.source, observation.kind, data[index]);
      }
      await run(connection, sql, values);
    }
  }

  private runPrepared(statement: Statement, values: unknown[]): Promise<void> {
    return callbackPromise<void>(callback => statement.run(...values, callback));
  }

  private fileBytes(target: string): number {
    let total = 0;
    for (const filename of [target, `${target}.wal`]) {
      try { total += fs.statSync(filename).size; }
      catch (error: unknown) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      }
    }
    return total;
  }

  private async closeCurrent(): Promise<void> {
    const connection = this.connection;
    const database = this.database;
    this.connection = null;
    this.database = null;
    this.filename = null;
    this.currentManifest = null;
    this.lastSequence = -1;
    this.lastSampleElapsed = null;
    if (!connection && !database) return;
    let failure: unknown;
    if (connection) {
      try { await run(connection, 'CHECKPOINT'); }
      catch (error: unknown) { failure = error; }
      try { await closeConnection(connection); }
      catch (error: unknown) { failure ??= error; }
    }
    if (database) {
      try { await closeDatabase(database); }
      catch (error: unknown) { failure ??= error; }
    }
    if (failure) throw failure;
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.queue;
    await this.closeCurrent();
  }
}
