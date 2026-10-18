import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { LiveService } from '../../../../server/live/liveService.js';
import type { LiveWorker } from '../../../../server/live/liveService.js';
import { LiveCaptureController } from '../../../../server/live/capture/controller.js';
import { decodeLiveCaptureSample } from '../../../../server/live/capture/decode.js';
import { VEHICLE_TELEMETRY } from '../../../../server/live/rf2Layout.js';
import { SessionDatabase } from '../../../../server/core/db.js';
import { getLiveCaptureIndexRows, upsertLiveCapture } from '../../../../server/core/live/dbLiveCaptureStore.js';
import { reconcileLiveCaptures } from '../../../../server/live/capture/reconcile.js';
import { scoringReading, vehicleReading } from '../../../helpers/liveReadings.js';

class Reader extends EventEmitter {
  public postMessage(): void {}
  public unref(): void {}
  public terminate(): Promise<number> { return Promise.resolve(0); }
}

it('persists recorded memory values through service, real worker, rediscovery and SQLite indexing without a dashboard', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lmu-capture-pipeline-'));
  const db = new SessionDatabase(':memory:');
  const reader = new Reader();
  const capture = new LiveCaptureController({ directory,
    onPersist: (manifest, bytes) => upsertLiveCapture(db.getDb(), manifest, bytes) });
  const service = new LiveService({ capture, createWorker: () => reader as unknown as LiveWorker,
    pit: { get: async () => ({ ok: false, reason: 'error' }) } });
  try {
    // Numeric values from the saved Laguna Seca memory JSONL (2026-10-15, first telemetry frame).
    // JSONL stores rounded decoded values, so this checks serialization and mapping, not ABI offsets.
    const slot = Buffer.alloc(VEHICLE_TELEMETRY.size);
    const at = VEHICLE_TELEMETRY.offsets;
    slot.writeDoubleLE(69.4525, at.elapsedTime);
    slot.writeInt32LE(0, at.lapNumber);
    for (const [field, values] of [['localVel', [0.0003, 0.3096, -24.0998]],
      ['localRot', [-0.04272, -0.14548, 0.0212]]] as const) {
      values.forEach((value, index) => slot.writeDoubleLE(value, at[field] + index * 8));
    }
    service.start();
    reader.emit('message', { type: 'frame', scoring: scoringReading({ currentEt: 69.2,
      player: vehicleReading({ driverName: 'Fixture Driver', vehicleName: 'Ferrari 296 GT3' }) }),
    capture: decodeLiveCaptureSample(slot) });
    expect(service.hasClients()).toBe(false);
    expect(capture.status().samples).toBe(1);
    await service.stop();
    expect(capture.status().error).toBeNull();
    const indexed = getLiveCaptureIndexRows(db.getDb());
    expect(indexed).toHaveLength(1);
    expect(indexed[0].manifest).toMatchObject({ status: 'interrupted', samples: 1, sessionId: null, gameVersion: null });
    const filename = path.join(directory, indexed[0].filename);
    const output = execFileSync(process.execPath, ['-e', `
      const duckdb = require('duckdb');
      const db = new duckdb.Database(process.argv[1], duckdb.OPEN_READONLY);
      db.all('SELECT velocity_forward_mps, velocity_left_mps, velocity_up_mps, roll_rate_radps, pitch_rate_radps, yaw_rate_radps, fl_patch_lateral_mps FROM capture_samples', (error, rows) => {
        if (error) throw error;
        process.stdout.write(JSON.stringify(rows));
        db.close(() => {});
      });`, filename], { encoding: 'utf8' });
    expect(JSON.parse(output)).toEqual([{ velocity_forward_mps: 24.0998, velocity_left_mps: -0.0003,
      velocity_up_mps: 0.3096, roll_rate_radps: -0.0212, pitch_rate_radps: 0.04272,
      yaw_rate_radps: -0.14548, fl_patch_lateral_mps: null }]);
    const discovered: string[] = [];
    const discovery = new LiveCaptureController({ directory, onPersist: () => {},
      onCatalog: (recordings, errors) => {
        expect(errors).toEqual([]);
        discovered.push(...recordings.map(entry => entry.manifest.recordingId));
      } });
    await discovery.discover();
    await discovery.stop();
    expect(discovered).toEqual([indexed[0].manifest.recordingId]);
    expect(await reconcileLiveCaptures(db.getDb(), directory)).toMatchObject({ indexed: 1, verified: 0, pending: 1 });
  } finally {
    await service.stop();
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
