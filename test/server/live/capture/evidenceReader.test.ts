import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveEvidenceReader } from '../../../../server/live/capture/evidenceReader.js';
import type { LiveCaptureBatch, LiveCaptureManifest, LiveCaptureWriteResult } from '../../../../shared/types/liveCapture.js';
import type { LiveEvidenceReadRequest } from '../../../../shared/types/liveEvidence.js';

const folders: string[] = [];
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }); });

async function recording(largeObservations = false): Promise<LiveEvidenceReadRequest> {
  const directory = await mkdtemp(path.join(tmpdir(), 'lmu-evidence-reader-'));
  folders.push(directory);
  const id = '83b74549-3e4c-4471-99ec-a6a4dca178b5';
  const manifest: LiveCaptureManifest = {
    recordingId: id, filename: `${id}.live.duckdb`, source: 'live-capture', schemaVersion: 1,
    normalizationVersion: 1, signConvention: 'iso8855', layoutKey: 'monza_gp', trackName: 'Monza',
    driverName: 'Fixture Driver', vehicleName: 'Ferrari 296 GT3', vehicleModel: 'Ferrari 296 GT3', carClass: 'GT3',
    sessionCode: 10, sessionKind: 'race', startedAt: 1800000000000, updatedAt: 1800000010000,
    firstElapsedSeconds: 100, lastElapsedSeconds: 102, endedAt: 1800000010000, status: 'completed',
    samples: 6, droppedSamples: 3, anchors: [{ lapNumber: 2, startSeconds: 100, lapSeconds: 1 }],
    sessionId: 'fixture-session', gameVersion: 'Build-42',
  };
  const samples = new Float64Array(6 * 33).fill(NaN);
  for (const [index, time] of [99.9, 100.02, 100.04, 100.5, 101, 102].entries()) {
    const at = index * 33;
    samples[at] = time;
    samples[at + 1] = 1; // Native telemetry counter differs from the official scoring anchor.
    samples[at + 2] = 100;
    samples[at + 3] = 0;
    samples[at + 4] = -1;
    samples[at + 8] = 0.25;
  }
  const batch: LiveCaptureBatch = { type: 'batch', sequence: 0, manifest, samples, observations: [
    { elapsedSeconds: 99.9, receivedAt: 1, source: 'shared-memory', kind: 'outside', data: {} },
    { elapsedSeconds: 100.5, receivedAt: 2, source: 'shared-memory', kind: 'scoring', data: { inPits: false } },
    { elapsedSeconds: null, receivedAt: 3, requestStartedAt: 1, requestFinishedAt: 3, source: 'rest', kind: 'forecast', data: { rain: 20 } },
  ] };
  if (largeObservations) batch.observations = Array.from({ length: 1001 }, (_, index) => ({ elapsedSeconds: null,
    receivedAt: index, source: 'rest' as const, kind: 'forecast', data: { value: 'x'.repeat(1200) } }));
  const worker = new Worker(new URL('../../../../server/live/capture/recordingWorkerBootstrap.mjs', import.meta.url), { workerData: { directory } });
  await new Promise<void>((resolve, reject) => {
    worker.on('error', reject);
    worker.on('message', (answer: LiveCaptureWriteResult) => {
      if (answer.type === 'persisted') worker.postMessage({ type: 'close' });
      if (answer.type === 'failed') { reject(new Error(answer.error)); void worker.terminate(); }
    });
    worker.on('exit', code => code === 0 ? resolve() : reject(new Error(`Writer exited ${code}`)));
    worker.postMessage(batch);
  });
  return { directory, manifest, lapNumber: 2, startSeconds: 100, durationSeconds: 1 };
}

describe('live evidence reader worker', () => {
  it('reads the exact anchored lap, retains ISO values and gaps, and keeps untimed REST evidence at session scope', async () => {
    const request = await recording();
    const evidence = await new LiveEvidenceReader().read(request);
    expect(evidence.channels).toHaveLength(6);
    expect(evidence.points.map(point => point.elapsedSeconds)).toEqual([100.02, 100.04, 100.5, 101]);
    expect(evidence.points[0].lapSeconds).toBeCloseTo(0.02, 10);
    expect(evidence.points[0].values).toEqual([0, -1, null, null, null, 0.25]);
    expect(evidence.coverage.gaps).toHaveLength(2);
    expect(evidence.coverage).toMatchObject({ recordingDroppedSamples: 3, lastLapSeconds: 1 });
    expect(evidence.observations.map(item => item.kind)).toEqual(['scoring']);
    expect(evidence.sessionObservations).toEqual([expect.objectContaining({ kind: 'forecast', elapsedSeconds: null, requestStartedAt: 1, requestFinishedAt: 3 })]);
    expect(evidence.gameVersion).toBe('Build-42');
  });

  it('refuses stale identity, wrong clock, path traversal and removed files instead of borrowing another source', async () => {
    const request = await recording();
    const reader = new LiveEvidenceReader();
    await expect(reader.read({ ...request, manifest: { ...request.manifest, driverName: 'Other Driver' } })).rejects.toMatchObject({ reason: 'changed' });
    await expect(reader.read({ ...request, startSeconds: 99 })).rejects.toMatchObject({ reason: 'unverified-clock' });
    await expect(reader.read({ ...request, manifest: { ...request.manifest, filename: '../other.duckdb' } })).rejects.toMatchObject({ reason: 'incompatible' });
    await rm(path.join(request.directory, request.manifest.filename));
    await expect(reader.read(request)).rejects.toMatchObject({ reason: 'missing' });
  });

  it('bounds sparse JSON before it crosses the worker boundary and reports omitted observations', async () => {
    const request = await recording(true);
    const evidence = await new LiveEvidenceReader().read(request);
    expect(evidence.observationsTruncated).toBe(true);
    expect(evidence.sessionObservations.length).toBeGreaterThan(0);
    expect(evidence.sessionObservations.length).toBeLessThan(1000);
    expect(evidence.sessionObservations.every(item => Number.isSafeInteger(item.observationId))).toBe(true);
    expect(evidence.sessionObservations.reduce((total, item) => total + JSON.stringify(item.data).length, 0)).toBeLessThanOrEqual(1_000_000);
  });

  it('rejects excess concurrent readers without queueing work on the capture worker', async () => {
    const request = await recording();
    const reader = new LiveEvidenceReader();
    const pending = [reader.read(request), reader.read(request)];
    try { await expect(reader.read(request)).rejects.toMatchObject({ reason: 'busy' }); }
    finally { await Promise.all(pending); }
  });
});
