import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWorkerOnce } from '../../../../server/core/workerThreads.js';
import { LiveEvidenceReader } from '../../../../server/live/capture/evidenceReader.js';
import { readLiveRecording } from '../../../../server/live/capture/readRecording.js';
import { LiveCaptureRecordingStore } from '../../../../server/live/capture/recordingStore.js';
import type { LiveCaptureBatch, LiveCaptureManifest } from '../../../../shared/types/liveCapture.js';
import { liveCaptureChannels } from '../../../../server/live/capture/channels.js';
import type { LiveEvidenceReadRequest, LiveEvidenceWorkerResult, LiveLapEvidence } from '../../../../shared/types/liveEvidence.js';

// Real worker starts cost ~260 ms each: only the end-to-end read uses one. The read rules run in
// process, and the queue test replaces the one-shot worker with answers it releases itself.
vi.mock('../../../../server/core/workerThreads.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../server/core/workerThreads.js')>();
  return { ...actual, runWorkerOnce: vi.fn(actual.runWorkerOnce) };
});

const folders: string[] = [];
afterEach(async () => {
  vi.mocked(runWorkerOnce).mockRestore();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function recording(largeObservations = false, normalizationVersion = 1): Promise<LiveEvidenceReadRequest> {
  const directory = await mkdtemp(path.join(tmpdir(), 'lmu-evidence-reader-'));
  folders.push(directory);
  const id = '83b74549-3e4c-4471-99ec-a6a4dca178b5';
  const manifest: LiveCaptureManifest = {
    recordingId: id, filename: `${id}.live.duckdb`, source: 'live-capture', schemaVersion: 1,
    normalizationVersion, signConvention: 'iso8855', layoutKey: 'monza_gp', trackName: 'Monza',
    driverName: 'Fixture Driver', vehicleName: 'Ferrari 296 GT3', vehicleModel: 'Ferrari 296 GT3', carClass: 'GT3',
    sessionCode: 10, sessionKind: 'race', startedAt: 1800000000000, updatedAt: 1800000010000,
    firstElapsedSeconds: 100, lastElapsedSeconds: 102, endedAt: 1800000010000, status: 'completed',
    samples: 6, droppedSamples: 3, anchors: [{ lapNumber: 2, startSeconds: 100, lapSeconds: 1 }],
    sessionId: 'fixture-session', gameVersion: 'Build-42',
  };
  const width = liveCaptureChannels(normalizationVersion).length + 3;
  const samples = new Float64Array(6 * width).fill(NaN);
  for (const [index, time] of [99.9, 100.02, 100.04, 100.5, 101, 102].entries()) {
    const at = index * width;
    samples[at] = time;
    samples[at + 1] = 1; // Native telemetry counter differs from the official scoring anchor.
    samples[at + 2] = 100;
    samples[at + 3] = 0;
    samples[at + 4] = -1;
    samples[at + 5] = 0.25;
  }
  const batch: LiveCaptureBatch = { type: 'batch', sequence: 0, manifest, samples, observations: [
    { elapsedSeconds: 99.9, receivedAt: 1, source: 'shared-memory', kind: 'outside', data: {} },
    { elapsedSeconds: 100.5, receivedAt: 2, source: 'shared-memory', kind: 'scoring', data: { inPits: false } },
    { elapsedSeconds: null, receivedAt: 3, requestStartedAt: 1, requestFinishedAt: 3, source: 'rest', kind: 'forecast', data: { rain: 20 } },
  ] };
  if (largeObservations) batch.observations = Array.from({ length: 1001 }, (_, index) => ({ elapsedSeconds: null,
    receivedAt: index, source: 'rest' as const, kind: 'forecast', data: { value: 'x'.repeat(1200) } }));
  const store = new LiveCaptureRecordingStore(directory);
  try { await store.write(batch); }
  finally { await store.close(); }
  return { directory, manifest: structuredClone(manifest), lapNumber: 2, startSeconds: 100, durationSeconds: 1 };
}

describe('live evidence reader', () => {
  it.each([2, 3])('reads version-%i wheel recordings with the vehicle channels plus longitudinal wheel velocities', async version => {
    const evidence = await readLiveRecording(await recording(false, version));
    expect(evidence.normalizationVersion).toBe(3);
    expect(evidence.channels.filter(channel => channel.frame === 'iso8855-vehicle')).toHaveLength(3);
    expect(evidence.channels.filter(channel => channel.frame === 'iso8855-wheel').map(channel => channel.name)).toEqual(
      ['fl', 'fr', 'rl', 'rr'].flatMap(wheel => [`${wheel}_patch_longitudinal_mps`]).concat(
        ['fl', 'fr', 'rl', 'rr'].map(wheel => `${wheel}_ground_longitudinal_mps`)));
    expect(evidence.points[0].values).toHaveLength(11);
  });

  it('reads the exact anchored lap through the worker, retains ISO values and gaps, and keeps untimed REST evidence at session scope', async () => {
    const request = await recording();
    const evidence = await new LiveEvidenceReader().read(request);
    expect(evidence.channels).toHaveLength(3);
    expect(evidence.points.map(point => point.elapsedSeconds)).toEqual([100.02, 100.04, 100.5, 101]);
    expect(evidence.points[0].lapSeconds).toBeCloseTo(0.02, 10);
    expect(evidence.points[0].values).toEqual([0, 1, -0.25]);
    expect(evidence).toMatchObject({ normalizationVersion: 3, sourceNormalizationVersion: 1 });
    const repeated = await readLiveRecording(request);
    expect(repeated.points).toEqual(evidence.points); // No stored rewrite or second sign flip on a later read.
    expect(evidence.coverage.gaps).toHaveLength(2);
    expect(evidence.coverage).toMatchObject({ recordingDroppedSamples: 3, lastLapSeconds: 1 });
    expect(evidence.observations.map(item => item.kind)).toEqual(['scoring']);
    expect(evidence.sessionObservations).toEqual([expect.objectContaining({ kind: 'forecast', elapsedSeconds: null, requestStartedAt: 1, requestFinishedAt: 3 })]);
    expect(evidence.gameVersion).toBe('Build-42');
  });

  it('refuses stale identity, wrong clock, path traversal and removed files instead of borrowing another source', async () => {
    const request = await recording();
    await expect(readLiveRecording({ ...request, manifest: { ...request.manifest, driverName: 'Other Driver' } })).rejects.toMatchObject({ reason: 'changed' });
    await expect(readLiveRecording({ ...request, startSeconds: 99 })).rejects.toMatchObject({ reason: 'unverified-clock' });
    await expect(readLiveRecording({ ...request, manifest: { ...request.manifest, filename: '../other.duckdb' } })).rejects.toMatchObject({ reason: 'incompatible' });
    await rm(path.join(request.directory, request.manifest.filename));
    await expect(readLiveRecording(request)).rejects.toMatchObject({ reason: 'missing' });
  });

  it('bounds sparse JSON before it crosses the worker boundary and reports omitted observations', async () => {
    const evidence = await readLiveRecording(await recording(true));
    expect(evidence.observationsTruncated).toBe(true);
    expect(evidence.sessionObservations.length).toBeGreaterThan(0);
    expect(evidence.sessionObservations.length).toBeLessThan(1000);
    expect(evidence.sessionObservations.every(item => Number.isSafeInteger(item.observationId))).toBe(true);
    expect(evidence.sessionObservations.reduce((total, item) => total + JSON.stringify(item.data).length, 0)).toBeLessThanOrEqual(1_000_000);
  });

  it('queues a few reads behind two running ones, asks the rest to retry and reports worker failures', async () => {
    const answers: Array<(answer: LiveEvidenceWorkerResult) => void> = [];
    vi.mocked(runWorkerOnce).mockImplementation(() => new Promise(resolve => { answers.push(resolve as (answer: LiveEvidenceWorkerResult) => void); }));
    const request: LiveEvidenceReadRequest = { directory: 'unused', manifest: {} as LiveCaptureManifest, lapNumber: 2, startSeconds: 100, durationSeconds: 1 };
    const evidence = { recordingId: 'queued' } as LiveLapEvidence;
    const reader = new LiveEvidenceReader();
    const settled = Promise.allSettled(Array.from({ length: 4 }, () => reader.read(request)));
    await expect(reader.read(request)).rejects.toMatchObject({ reason: 'busy' });
    expect(answers).toHaveLength(2);
    answers[0]({ type: 'failed', reason: 'missing', error: 'Live capture file was removed' });
    answers[1]({ type: 'evidence', evidence });
    await vi.waitFor(() => expect(answers).toHaveLength(4));
    answers[2]({ type: 'evidence', evidence });
    answers[3]({ type: 'evidence', evidence });
    const [failed, ...rest] = await settled;
    expect(failed).toMatchObject({ status: 'rejected', reason: { reason: 'missing', message: 'Live capture file was removed' } });
    expect(rest).toEqual(Array.from({ length: 3 }, () => ({ status: 'fulfilled', value: evidence })));
  });
});
