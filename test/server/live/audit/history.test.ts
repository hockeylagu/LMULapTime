import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { upsertLiveCapture } from '../../../../server/core/live/dbLiveCaptureStore.js';
import { createLiveRouter } from '../../../../server/routes/liveRoutes.js';
import type { ServerContext } from '../../../../server/core/serverContext.js';
import { LiveService } from '../../../../server/live/liveService.js';
import { LiveAuditReader } from '../../../../server/live/audit/reader.js';
import { iterateAuditHistory, readAuditHistory } from '../../../../server/live/audit/history.js';
import type { AuditHistoryOptions } from '../../../../server/live/audit/history.js';
import type { LiveAuditRecord } from '../../../../shared/types/liveAudit.js';
import type { LiveCaptureManifest, LiveCaptureBatch, LiveCaptureWriteResult } from '../../../../shared/types/liveCapture.js';
import { liveSnapshot, liveStrategy } from '../../../helpers/liveSnapshot.js';

const folders: string[] = [];
const databases: Database.Database[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) db.close();
  for (const folder of folders.splice(0)) {
    expect(path.dirname(folder)).toBe(path.resolve(tmpdir()));
    await rm(folder, { recursive: true, force: true });
  }
});

function manifest(): LiveCaptureManifest {
  const recordingId = 'd5b9885c-3650-4cb2-ae7d-1dcf38680fa3';
  return { recordingId, filename: `${recordingId}.live.duckdb`, source: 'live-capture', schemaVersion: 1,
    normalizationVersion: 1, signConvention: 'iso8855', layoutKey: null, trackName: 'Monza',
    driverName: 'Driver', vehicleName: 'Ferrari 296 GT3', vehicleModel: 'Ferrari 296 GT3', carClass: 'GT3',
    sessionCode: 10, sessionKind: 'race', startedAt: 1000, updatedAt: 5000,
    firstElapsedSeconds: 100, lastElapsedSeconds: 200, endedAt: 5000, status: 'completed',
    samples: 0, droppedSamples: 0, anchors: [], sessionId: null, gameVersion: null };
}

function record(sequence: number, runId = manifest().recordingId): LiveAuditRecord {
  return { runId, sequence: 1, recordedAt: 1000 + sequence, modelVersion: 3, reason: 'sample',
    snapshot: liveSnapshot({ strategy: liveStrategy() }), observation: { fuel: null, ve: null }, comparison: null };
}

async function recording(count = 450, corrupt = false, large = false) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lmu-audit-reader-')); folders.push(directory);
  const capture = manifest();
  const batch: LiveCaptureBatch = { type: 'batch', sequence: 1, manifest: capture, samples: new Float64Array(),
    observations: Array.from({ length: count }, (_, index) => ({ elapsedSeconds: 100, receivedAt: 1000 + index,
      source: 'recorder' as const, kind: 'strategy-audit-v1', data: {
        ...record(index, corrupt ? 'wrong-owner' : capture.recordingId), ...(large ? { padding: 'x'.repeat(30_000) } : {}),
      } })) };
  const worker = new Worker(new URL('../../../../server/live/capture/recordingWorkerBootstrap.mjs', import.meta.url), { workerData: { directory } });
  await new Promise<void>((resolve, reject) => {
    worker.on('error', reject);
    worker.on('message', (answer: LiveCaptureWriteResult) => {
      if (answer.type === 'persisted') worker.postMessage({ type: 'close' });
      if (answer.type === 'failed') { reject(new Error(answer.error)); void worker.terminate(); }
    });
    worker.on('exit', code => code === 0 ? resolve() : reject(new Error(`Writer exit ${code}`)));
    worker.postMessage(batch);
  });
  return { directory, capture };
}

function options(capture = manifest(), directory: string | null = 'unused'): AuditHistoryOptions {
  const db = new Database(':memory:'); databases.push(db); initDbSchema(db);
  upsertLiveCapture(db, capture, 1024);
  return { db, directory, runId: null, blocked: () => false, read: async () => ({ records: [], next: null }) };
}

describe('consolidated strategy history', () => {
  it('reads unlinked finalized recordings in worker pages and uses stable observation sequences', async () => {
    const { directory, capture } = await recording();
    const reader = new LiveAuditReader();
    const first = await reader.read({ directory, manifest: capture, after: null, direction: 'asc' });
    expect(first.records).toHaveLength(200);
    expect(first.next).toBe(first.records[199].sequence);
    const second = await reader.read({ directory, manifest: capture, after: first.next, direction: 'asc' });
    expect(second.records).toHaveLength(200);
    expect(second.records[0].sequence).toBeGreaterThan(first.next!);
    const last = await reader.read({ directory, manifest: capture, after: second.next, direction: 'asc' });
    expect(last.records).toHaveLength(50);
    expect(last.next).toBeNull();
    expect(new Set([...first.records, ...second.records, ...last.records].map(item => item.sequence)).size).toBe(450);
    const pending = [reader.read({ directory, manifest: capture, after: null, direction: 'asc' }),
      reader.read({ directory, manifest: capture, after: null, direction: 'desc' })];
    await expect(reader.read({ directory, manifest: capture, after: null, direction: 'asc' })).rejects.toThrow('busy');
    await Promise.all(pending);
    await rm(path.join(directory, capture.filename)); // Confirms every worker released its native handle.
  });

  it('pages by bytes as well as row count without dropping checkpoint records', async () => {
    const { directory, capture } = await recording(210, false, true);
    const reader = new LiveAuditReader();
    const first = await reader.read({ directory, manifest: capture, after: null, direction: 'desc' });
    expect(first.records.length).toBeLessThan(200);
    expect(first.records.length).toBeGreaterThan(0);
    const second = await reader.read({ directory, manifest: capture, after: first.next, direction: 'desc' });
    expect(first.records.length + second.records.length).toBe(210);
    const opts = options(capture, directory); opts.read = request => reader.read(request);
    expect(await readAuditHistory(opts)).toHaveLength(200);
  });

  it('rejects changed recording identity, bad checkpoint ownership and active sessions', async () => {
    const { directory, capture } = await recording(1, true);
    const reader = new LiveAuditReader();
    await expect(reader.read({ directory, manifest: capture, after: null, direction: 'asc' })).rejects.toThrow('checkpoint');
    await expect(reader.read({ directory, manifest: { ...capture, driverName: 'Other' }, after: null, direction: 'asc' })).rejects.toThrow('identity');
    await expect(reader.read({ directory, manifest: { ...capture, status: 'recording' }, after: null, direction: 'asc' })).rejects.toThrow('finalized');
    const opts = options(); opts.blocked = () => true;
    await expect(readAuditHistory(opts)).rejects.toThrow('closes');
  });

  it('bounds recording JSON to 200 and streams every CSV record without a SQLite audit table', async () => {
    const { directory, capture } = await recording();
    const opts = options(capture, directory); const reader = new LiveAuditReader();
    opts.read = request => reader.read(request);
    expect(opts.db.prepare("SELECT 1 FROM sqlite_master WHERE name='live_strategy_audit'").get()).toBeUndefined();
    const live = new LiveService();
    const captureSource = { directory, hasOpenRecordingHandle: false,
      status: () => ({ state: 'idle' as const, recordingId: null, samples: 0, droppedSamples: 0, pendingBatches: 0, error: null }) };
    const app = express();
    app.use('/api', createLiveRouter({ sessionDb: { getDb: () => opts.db } } as unknown as ServerContext, live, captureSource, opts.read));
    const response = await request(app).get('/api/live/audit');
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(200);
    expect(response.body[0].runId).toBe(capture.recordingId);
    const csv = await request(app).get(`/api/live/audit.csv?runId=${capture.recordingId}`);
    expect(csv.status).toBe(200);
    expect(csv.text.split('\r\n').filter(Boolean)).toHaveLength(451);
    expect((await request(app).get('/api/live/audit?runId=unknown')).body).toEqual([]);
    expect((await request(app).get('/api/live/audit.csv?runId[]=bad')).status).toBe(400);
    const blocked = vi.spyOn(live, 'isSessionLoaded').mockReturnValue(true);
    expect((await request(app).get('/api/live/audit.csv')).status).toBe(503);
    blocked.mockRestore();
    captureSource.hasOpenRecordingHandle = true;
    expect((await request(app).get('/api/live/audit')).status).toBe(503);
  });

  it('rechecks the live gate after async reads and scopes run IDs without guessing XML ownership', async () => {
    const opts = options(); let loaded = false;
    opts.blocked = () => loaded;
    opts.read = async () => { loaded = true; return { records: [record(1)], next: null }; };
    await expect(readAuditHistory(opts)).rejects.toThrow('closes');
    loaded = false; opts.runId = 'unknown';
    expect(await readAuditHistory(opts)).toEqual([]);
    const rows: LiveAuditRecord[] = [];
    for await (const row of iterateAuditHistory(opts)) rows.push(row);
    expect(rows).toEqual([]);
  });
});
