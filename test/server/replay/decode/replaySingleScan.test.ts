import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractReplayDriverTrajectories, extractReplayTrajectory } from '../../../../server/replay/decode/replayTrajectory.js';
import { createSliceVcrBuffer, type MockSlice } from '../../../utils/mockVcr.js';

describe('single replay stream traversal', () => {
  it.each([false, true])('isolates an unavailable slot, including the primary (%s), and finalizes remaining drivers', primary => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'single-scan-missing-'));
    const file = path.join(directory, 'Missing_P1.Vcr');
    fs.writeFileSync(file, createSliceVcrBuffer({ drivers: [
      { name: 'Player', vehicleId: 'A', team: 'A', carNumber: '1' },
    ], slices: [{ sTime: 0, driverSlot: 1, x: 0, y: 0, z: 0 }, { sTime: 1, driverSlot: 1, x: 10, y: 0, z: 0 }] }));
    try {
      const failures: Array<{ slot: number | undefined; message: string }> = [];
      const result = [...extractReplayDriverTrajectories(file, { driverSlots: primary ? [1] : [99, 1],
        ...(primary ? { driverSlot: 99, includePrimary: true } : {}), silent: true,
        onDriverError: (slot, error) => failures.push({ slot, message: String(error) }),
      })];
      expect(result.map(driver => driver.driverSlot)).toEqual([1]);
      expect(failures).toEqual([{ slot: 99, message: 'Error: Replay driver slot 99 is unavailable' }]);
      expect(result[0].points).toHaveLength(2);
    } finally {
      fs.rmSync(file);
      fs.rmdirSync(directory);
    }
  });

  it('matches independent decodes for all drivers, including partial laps, late weather and pit exits', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'single-scan-test-'));
    const file = path.join(directory, 'Single_P1.Vcr');
    const slices: MockSlice[] = [];
    for (let time = 0; time <= 240; time += 0.5) {
      for (const slot of [1, 2]) {
        const finish = time === 90 || time === 180;
        slices.push({ sTime: time, driverSlot: slot, x: time * 40, y: slot, z: slot * 10,
          timing: finish ? { sector: 0, lapIdx: time / 90 - 1, splitSec: 90 } : undefined,
          weather: time === 200 ? { ambientTemp: 19, rainIntensity: 40 } : undefined,
          rawEvents: time === 150 || time === 195 ? [{ evClass: 0, evType: 2, slot, payload: Buffer.from([time === 150 ? 34 : 32]) }] : undefined,
        });
      }
    }
    fs.writeFileSync(file, createSliceVcrBuffer({ drivers: [
      { name: 'Player', vehicleId: 'A', team: 'A', carNumber: '1' },
      { name: 'Rival', vehicleId: 'B', team: 'B', carNumber: '2' },
    ], slices }));
    try {
      let traversals = 0;
      const combined = [...extractReplayDriverTrajectories(file, { driverSlots: [1, 2], playerName: 'Player',
        allLaps: true, maxPoints: 0, silent: true,
        onProgress: progress => { if (progress.stage === 'stream_init') traversals++; },
      })];
      expect(traversals).toBe(1);
      expect(combined).toHaveLength(2);
      for (const actual of combined) {
        const expected = extractReplayTrajectory(file, { driverSlot: actual.driverSlot, allLaps: true, maxPoints: 0, silent: true });
        const strip = (lap: typeof expected) => { const { allLapsData: _unused, ...result } = lap; return result; };
        expect(actual.allLapsData?.map(strip)).toEqual(expected.allLapsData?.map(strip));
        expect(actual.currentLap).toBe(expected.currentLap);
      }
    } finally {
      fs.rmSync(file);
      fs.rmdirSync(directory);
    }
  });
});
