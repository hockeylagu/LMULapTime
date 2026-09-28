import { describe, it, expect } from 'vitest';
import { buildRacePositions, readLapSamples } from '../../../server/traffic/lapSamples.js';
import { buildRacePositionsInWorker } from '../../../server/traffic/racePositionsWorkerClient.js';
import { compressTrajectory } from '../../../server/core/replay/replayTrajectoryCodec.js';
import { compressJson } from '../../../server/core/dbSchema.js';
import { distanceAt, RACE_POSITIONS_VERSION } from '../../../server/traffic/racePositions.js';
import type { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../server/core/types.js';
import { circleCenterline, pointAt } from './circleTrack.js';

/** A stored lap at 50 Hz: 50 m/s from `startM`, `durationSec` long, starting at `startSec`. */
function storedLap(lapNumber: number, startSec: number, durationSec: number, startM: number, pitFrom?: number): ReplayTrajectoryData {
  const points: ReplayTrajectoryPoint[] = [];
  for (let i = 0; i <= durationSec * 50; i++) {
    const time = startSec + i / 50;
    points.push({ ...pointAt(startM + 50 * (time - startSec)), y: 0, timeSec: time, inPit: pitFrom !== undefined && time >= pitFrom, speedKmh: 180 });
  }
  return {
    replayName: 'Circle_R1.Vcr', pointsCount: points.length, rawSampleRateHz: 50, currentLap: lapNumber,
    bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 }, points,
  };
}

describe('readLapSamples', () => {
  it('keeps one sample in ten of a 50 Hz lap, reading only time, position and whether it is on track', () => {
    const samples = readLapSamples(4, compressTrajectory(storedLap(4, 100, 10, 0, 108)));

    expect(samples.lapNumber).toBe(4);
    expect(samples.times).toHaveLength(51);
    expect(samples.times.slice(0, 3)).toEqual([100, 100.2, 100.4]);
    expect(samples.x[0]).toBeCloseTo(pointAt(0).x, 6);
    expect(samples.onTrack.filter(Boolean)).toHaveLength(40); // in the pits from 108 s
  });

  it('recomputes the garage state instead of trusting the stored flag', () => {
    // Stored before the fix: a type 49 event at a race pit stop flagged the rest of the race as garage.
    const lap = { ...storedLap(7, 500, 10, 0), driverSlot: 3, pitEvents: [
      { driverSlot: 3, timeSec: 400, code: 18, action: 'stopped in pit stall' },
      { driverSlot: 3, timeSec: 400.1, code: 49, action: 'entered pit / garage', isGarage: true },
    ] };
    lap.points.forEach(p => { p.inGarage = true; });

    expect(readLapSamples(7, compressTrajectory(lap)).onTrack.every(Boolean)).toBe(true);
  });

  it('reads a lap stored in the older one-object-per-point format too', () => {
    const lap = storedLap(1, 0, 2, 0);
    const samples = readLapSamples(1, compressJson(lap));

    expect(samples.times).toHaveLength(11);
    expect(samples.onTrack.every(Boolean)).toBe(true);
  });
});

describe('buildRacePositions', () => {
  const laps = [
    { slot: 0, lapNumber: 1, blob: compressTrajectory(storedLap(1, 0, 20, 0)) },
    { slot: 0, lapNumber: 2, blob: compressTrajectory(storedLap(2, 20, 20, 1000)) },
    { slot: 4, lapNumber: 1, blob: compressTrajectory(storedLap(1, 0, 20, 30)) },
  ];

  it('places every car on the track through the replay', () => {
    const positions = buildRacePositions(laps, circleCenterline());

    expect(positions.version).toBe(RACE_POSITIONS_VERSION);
    expect(positions.trackLengthM).toBeCloseTo(1000, 0);
    expect(positions.drivers.map(d => d.slot)).toEqual([0, 4]);
    expect(distanceAt(positions.drivers[0], 30)).toBeCloseTo(1500, 0);
    expect(distanceAt(positions.drivers[1], 10)).toBeCloseTo(530, 0);
  });

  it('builds the same index on a worker thread', async () => {
    const positions = await buildRacePositionsInWorker(laps, circleCenterline());

    expect(positions).toEqual(buildRacePositions(laps, circleCenterline()));
  });

  it('reports a worker that fails', async () => {
    await expect(buildRacePositionsInWorker([{ slot: 0, lapNumber: 1, blob: new Uint8Array([1, 2, 3]) }], circleCenterline()))
      .rejects.toThrow();
  });
});
