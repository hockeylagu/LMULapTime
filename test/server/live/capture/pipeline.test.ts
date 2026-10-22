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
import { VEHICLE_TELEMETRY, WHEEL } from '../../../../server/live/rf2Layout.js';
import { LIVE_CAPTURE_CHANNELS } from '../../../../server/live/capture/channels.js';
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
    // Same saved frame, FL/FR/RL/RR. No input is reconstructed from a normalized result.
    const rawWheels = [
      [-0.4129, -1.8818, -0.4157, -23.9723, -0.03201, -0.02633, 0.01678],
      [-0.4397, -1.6297, -0.4509, -24.224, -0.031, -0.0264, 0.01883],
      [-0.1159, -0.7526, -0.1181, -23.9834, -0.02966, 0.00102, 0.00851],
      [-0.1789, -1.1636, -0.1839, -24.2205, -0.02683, -0.00049, 0.01225],
    ];
    const wheelFields = ['lateralPatchVel', 'longitudinalPatchVel', 'lateralGroundVel', 'longitudinalGroundVel', 'camber', 'toe', 'verticalTireDeflection'];
    rawWheels.forEach((wheel, corner) => wheel.forEach((value, field) =>
      slot.writeDoubleLE(value, at.wheels + corner * WHEEL.size + WHEEL.offsets[wheelFields[field]])));
    for (let corner = 0; corner < 4; corner++) {
      slot.write('RDRACEOLD,ROAD,', at.wheels + corner * WHEEL.size + WHEEL.offsets.terrainName, 'latin1');
    }
    // Synthetic impact/configuration state alongside the saved wheel frame exercises sparse persistence.
    slot.writeDoubleLE(69.4, at.lastImpactET);
    slot.writeDoubleLE(8896.196, at.lastImpactMagnitude);
    const upgradePackHex = '004280ff000102030405060708090a0b';
    service.start();
    reader.emit('message', { type: 'frame', scoring: scoringReading({ currentEt: 69.2,
      player: vehicleReading({ driverName: 'Fixture Driver', vehicleName: 'Ferrari 296 GT3', upgradePackHex }) }),
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
      const { DuckDBInstance } = require('@duckdb/node-api');
      (async () => {
        const instance = await DuckDBInstance.create(process.argv[1], { access_mode: 'READ_ONLY' });
        const connection = await instance.connect();
        try {
          const rows = (await connection.runAndReadAll('SELECT ${LIVE_CAPTURE_CHANNELS.map(channel => channel.name).join(', ')} FROM capture_samples')).getRowObjects();
          process.stdout.write(JSON.stringify(rows));
        } finally {
          connection.closeSync();
          instance.closeSync();
        }
      })().catch(error => { console.error(error); process.exitCode = 1; });`, filename], { encoding: 'utf8' });
    const expected = [24.0998, 0.0003, 0.14548, 1.8818, 1.6297, 0.7526, 1.1636, 23.9723, 24.224, 23.9834, 24.2205];
    expect(JSON.parse(output)).toEqual([Object.fromEntries(LIVE_CAPTURE_CHANNELS.map((channel, index) => [channel.name, expected[index]]))]);
    expect(indexed[0].manifest.normalizationVersion).toBe(3);
    const observations = execFileSync(process.execPath, ['-e', `
      const { DuckDBInstance } = require('@duckdb/node-api');
      (async () => {
        const instance = await DuckDBInstance.create(process.argv[1], { access_mode: 'READ_ONLY' });
        const connection = await instance.connect();
        try {
          const rows = (await connection.runAndReadAll('SELECT kind, elapsed_seconds, data FROM capture_observations ORDER BY observation_id')).getRowObjects();
          process.stdout.write(JSON.stringify(rows));
        } finally {
          connection.closeSync();
          instance.closeSync();
        }
      })().catch(error => { console.error(error); process.exitCode = 1; });`, filename], { encoding: 'utf8' });
    const stored: { kind: string; elapsed_seconds: number | null; data: string }[] = JSON.parse(observations);
    const byKind = (kind: string) => stored.filter(item => item.kind === kind).map(item => JSON.parse(item.data) as unknown);
    expect(byKind('impact')).toEqual([{ impactElapsedSeconds: 69.4, magnitude: 8896.196 }]);
    expect(stored.find(item => item.kind === 'impact')?.elapsed_seconds).toBe(69.4);
    expect(byKind('upgrade-pack')).toEqual([{ rawHex: upgradePackHex }]);
    expect(byKind('terrain-material')).toEqual([{ materialId: 0, rawName: 'RDRACEOLD,ROAD,' }]);
    expect(byKind('terrain-change')).toEqual(['FL', 'FR', 'RL', 'RR'].map(corner => ({ corner, materialId: 0 })));
    const discovered: string[] = [];
    const discovery = new LiveCaptureController({ directory, onPersist: () => {},
      onCatalog: (recordings, errors) => {
        expect(errors).toEqual([]);
        discovered.push(...recordings.map(entry => entry.manifest.recordingId));
      } });
    const cataloguing = discovery.discover();
    // A real DuckDB catalog runs in its worker while main-thread callbacks remain available.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(discovered).toEqual([]);
    await cataloguing;
    await discovery.stop();
    expect(discovered).toEqual([indexed[0].manifest.recordingId]);
    expect(await reconcileLiveCaptures(db.getDb(), directory)).toMatchObject({ indexed: 1, verified: 0, pending: 1 });
  } finally {
    await service.stop();
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
