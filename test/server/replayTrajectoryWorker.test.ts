import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { extractReplayTrajectoryInWorker } from '../../server/replay/replayTrajectoryWorkerClient.js';
import { createMockVcrBuffer } from '../utils/mockVcr.js';

const runRealReplayTests = process.env.RUN_REAL_REPLAY_TESTS === '1';
const steamReplaysDir = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays';
const imolaRaceReplay = path.join(steamReplaysDir, 'Autodromo Enzo e Dino Ferrari R1 8.Vcr');

describe('replay trajectory worker', () => {
  const tempPaths: string[] = [];

  afterEach(() => {
    for (const tempPath of tempPaths.splice(0)) {
      fs.rmSync(tempPath, { force: true });
    }
  });

  it('streams parse progress and returns the trajectory without parser logs', async () => {
    const tempPath = path.join(os.tmpdir(), `lmu-worker-${Date.now()}.Vcr`);
    tempPaths.push(tempPath);
    fs.writeFileSync(tempPath, createMockVcrBuffer());

    const stages: string[] = [];
    const extraction = extractReplayTrajectoryInWorker(tempPath, { driverSlot: 1 });
    let step = await extraction.next();
    while (!step.done) {
      stages.push(step.value.stage);
      step = await extraction.next();
    }

    expect(stages).toContain('stream_decoding');
    expect(step.value.driverSlot).toBe(1);
    expect(step.value.pointsCount).toBe(3);
  });

  it('locates the worker when the process starts outside the repository', async () => {
    const tempPath = path.join(os.tmpdir(), `lmu-worker-cwd-${Date.now()}.Vcr`);
    const originalDirectory = process.cwd();
    tempPaths.push(tempPath);
    fs.writeFileSync(tempPath, createMockVcrBuffer());

    try {
      process.chdir(os.tmpdir());
      const extraction = extractReplayTrajectoryInWorker(tempPath, { driverSlot: 1 });
      let step = await extraction.next();
      while (!step.done) step = await extraction.next();
      expect(step.value.pointsCount).toBe(3);
    } finally {
      process.chdir(originalDirectory);
    }
  });

  it('returns a queued result after the worker exits while the consumer is paused', async () => {
    const tempPath = path.join(os.tmpdir(), `lmu-worker-paused-${Date.now()}.Vcr`);
    tempPaths.push(tempPath);
    fs.writeFileSync(tempPath, createMockVcrBuffer());
    const extraction = extractReplayTrajectoryInWorker(tempPath, { driverSlot: 1 });

    let step = await extraction.next();
    await new Promise((resolve) => setTimeout(resolve, 100));
    while (!step.done) step = await extraction.next();

    expect(step.value.pointsCount).toBe(3);
  });

  it('rejects when a worker exits cleanly without returning a result', async () => {
    const extraction = extractReplayTrajectoryInWorker('unused.Vcr', {}, {
      workerPath: new URL('data:text/javascript,', import.meta.url),
    });

    await expect(extraction.next()).rejects.toThrow('exited with code 0 before returning a result');
  });

  describe.skipIf(!runRealReplayTests || !fs.existsSync(imolaRaceReplay))('real replay worker', () => {
    it('streams every decode stage and preserves the full Imola race trajectory', async () => {
      const stages: string[] = [];
      const extraction = extractReplayTrajectoryInWorker(imolaRaceReplay, {
        playerName: 'Samuel',
        maxPoints: 500,
      });
      let step = await extraction.next();
      while (!step.done) {
        stages.push(step.value.stage);
        step = await extraction.next();
      }

      expect(stages).toContain('header');
      expect(stages).toContain('metadata');
      expect(stages).toContain('stream_init');
      expect(stages).toContain('stream_decoding');
      expect(stages).toContain('lap_analysis');
      expect(stages).toContain('downsampling');
      expect(step.value.driverName).toContain('Samuel');
      expect(step.value.laps).toHaveLength(16);
      expect(step.value.pointsCount).toBe(500);
    }, 180_000);
  });
});