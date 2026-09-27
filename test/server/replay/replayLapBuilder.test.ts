import { describe, expect, it } from 'vitest';
import { detectLapsFromTelemetry, RawTrajectoryPoint, VcrTimingEvent } from '../../../server/replay/replayLapBuilder.js';

const SLOT = 1;
const SPEED_MPS = 50;

/** A car driving in a straight line at 50 m/s, one point every half second from 0 to `untilSec`. */
function drive(untilSec: number, pointAt: (sTime: number) => Partial<RawTrajectoryPoint> = () => ({})): RawTrajectoryPoint[] {
  const points: RawTrajectoryPoint[] = [];
  for (let sTime = 0; sTime <= untilSec; sTime += 0.5) {
    points.push({ sTime, x: sTime * SPEED_MPS, y: 0, z: 0, rotY: 0, ...pointAt(sTime) });
  }
  return points;
}

const finish = (lapIdx: number, sTime: number, splitSec: number): VcrTimingEvent => ({ sTime, drv: SLOT, splitSec, sector: 0, lapIdx });
const sector = (lapIdx: number, sectorNo: number, sTime: number, splitSec: number): VcrTimingEvent => ({ sTime, drv: SLOT, splitSec, sector: sectorNo, lapIdx });

// Lap 1 (from the start) ends at 100 s, lap 2 is a 90 s flying lap ending at 190 s.
const twoLaps = [finish(0, 100, 100), finish(1, 190, 90)];

function detect(points: RawTrajectoryPoint[], timings: VcrTimingEvent[]) {
  return detectLapsFromTelemetry(points, timings, SLOT, [], 2000).detectedLaps;
}

describe('detectLapsFromTelemetry: the lap still running when the replay ends', () => {
  it('is kept as an invalid, partial lap and never becomes the best lap', () => {
    const laps = detect(drive(230), [...twoLaps, sector(2, 1, 215, 25)]);

    expect(laps.map(lap => lap.lapNumber)).toEqual([1, 2, 3]);
    const partial = laps[2];
    expect(partial).toMatchObject({ isValid: false, isBest: false, lapTimeSec: 40, lapDistMeters: 2000, s1Sec: 25 });
    expect(partial.s1Sec + partial.s2Sec + partial.s3Sec).toBeCloseTo(40, 3);
    // The partial lap is shorter than lap 2, but only a completed flying lap can be the best.
    expect(laps.filter(lap => lap.isBest).map(lap => lap.lapNumber)).toEqual([2]);
  });

  it('splits its sectors by distance when no sector was timed', () => {
    const [, , partial] = detect(drive(220), twoLaps);

    expect(partial.lapTimeSec).toBe(30);
    // A third of the distance each, to within one sample (0.5 s).
    expect(Math.abs(partial.s1Sec - 10)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(partial.s2Sec - 10)).toBeLessThanOrEqual(0.5);
    expect(partial.s1Sec + partial.s2Sec + partial.s3Sec).toBeCloseTo(30, 3);
  });

  it('reads its second sector from the sector timing when both sectors were timed', () => {
    const [, , partial] = detect(drive(230), [...twoLaps, sector(2, 1, 212, 22), sector(2, 2, 222, 32)]);
    expect(partial).toMatchObject({ s1Sec: 22, s2Sec: 10, s3Sec: 8 });
  });

  it('is an out-lap when it started in the pit lane', () => {
    const [, , partial] = detect(drive(230, sTime => ({ inPit: sTime >= 188 && sTime <= 192 })), twoLaps);
    expect(partial.isOutlap).toBe(true);
  });

  it('is not added for a short run after the last line crossing (the car stopped or the replay was saved)', () => {
    expect(detect(drive(200), twoLaps).map(lap => lap.lapNumber)).toEqual([1, 2]);
  });
});
