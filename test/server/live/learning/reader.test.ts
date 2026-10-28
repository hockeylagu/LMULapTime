import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readLearningEventsInWorker } from '../../../../server/live/learning/reader.js';
import { parseLearningEvent, readLearningEvents } from '../../../../server/live/learning/readEvents.js';
import { LiveCaptureRecordingStore } from '../../../../server/live/capture/recordingStore.js';
import type { LiveCaptureBatch, LiveCaptureManifest } from '../../../../shared/types/liveCapture.js';

const folders: string[] = [];
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }); });

async function recording(invalid = false) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lmu-learning-reader-'));
  folders.push(directory);
  const id = '83b74549-3e4c-4471-99ec-a6a4dca178b5';
  const manifest: LiveCaptureManifest = {
    recordingId: id, filename: `${id}.live.duckdb`, source: 'live-capture', schemaVersion: 1,
    normalizationVersion: 1, signConvention: 'iso8855', layoutKey: 'monza_gp', trackName: 'Monza',
    driverName: 'Driver', vehicleName: 'Ferrari 296 GT3', vehicleModel: 'Ferrari 296 GT3', carClass: 'GT3',
    sessionCode: 10, sessionKind: 'race', startedAt: 1800000000000, updatedAt: 1800000010000,
    firstElapsedSeconds: 100, lastElapsedSeconds: 200, endedAt: 1800000010000, status: 'completed',
    samples: 0, droppedSamples: 0, anchors: [{ lapNumber: 2, startSeconds: 100, lapSeconds: 100 }],
    sessionId: 'fixture-session', gameVersion: 'Build-42',
  };
  const batch: LiveCaptureBatch = { type: 'batch', sequence: 0, manifest, samples: new Float64Array(), observations: [
    { elapsedSeconds: 100, receivedAt: 1, source: 'recorder', kind: 'learning-forecast', data: {
      version: invalid ? 99 : 1, lapNumber: 2, lapStartSeconds: 100, forecastSeconds: 100.1, kind: 'fuel',
      predicted: 2.1, predictionSource: 'measured', modelVersion: 3, condition: 'dry', compound: 'Medium',
    } },
    { elapsedSeconds: 200, receivedAt: 2, source: 'recorder', kind: 'learning-outcome', data: {
      version: 1, lapNumber: 2, crossingSeconds: 200, kind: 'fuel', actual: 2.2,
      measurementSource: 'live-usage-meter', exclusions: [],
    } },
    { elapsedSeconds: 150, receivedAt: 3, source: 'shared-memory', kind: 'car-condition', data: { fuelLitres: 20 } },
  ] };
  // Written in process: a real recording worker start would add ~260 ms per fixture.
  const store = new LiveCaptureRecordingStore(directory);
  try { await store.write(batch); }
  finally { await store.close(); }
  return { directory, manifest };
}

describe('learning observation reader', () => {
  it('reads only compact learning events from a finalized typed recording and releases handles', async () => {
    const request = await recording();
    const events = await readLearningEventsInWorker(request);
    expect(events).toHaveLength(2);
    expect(events.map(row => row.event.kind)).toEqual(['learning-forecast', 'learning-outcome']);
    expect(events[0].event.data).toMatchObject({ predicted: 2.1 });
    expect(events[1].event.data).toMatchObject({ actual: 2.2 });
    await expect(readLearningEvents({ ...request, manifest: { ...request.manifest, driverName: 'Wrong' } })).rejects.toThrow('identity');
    await rm(path.join(request.directory, request.manifest.filename));
    await expect(readLearningEvents(request)).rejects.toThrow('removed');
  });

  it('rejects unsupported or corrupt event schemas rather than training on partial evidence', async () => {
    await expect(readLearningEvents(await recording(true))).rejects.toThrow('unsupported');
    expect(parseLearningEvent('learning-outcome', { version: 1, lapNumber: 2, kind: 'fuel', actual: 2 })).toBeNull();
  });
});
