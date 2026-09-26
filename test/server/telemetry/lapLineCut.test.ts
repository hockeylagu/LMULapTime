import { describe, it, expect } from 'vitest';
import { cutLapAtLine } from '../../../server/tracks/lapLineCut.js';
import { projectTrajectoryToCenterline } from '../../../server/tracks/trackProjection.js';
import { ReplayTrajectoryPoint } from '../../../server/core/types.js';

// A 200 m square loop; station 0 (the start/finish line) is at (0, 0), halfway along the
// bottom straight, driven towards +x.
const SQUARE: Array<[number, number]> = [[0, 0], [25, 0], [25, 50], [-25, 50], [-25, 0]];
const L = 200;
const SPEED_MS = 20;

function positionAt(station: number): { x: number; z: number } {
  const s = ((station % L) + L) % L;
  if (s < 25) return { x: s, z: 0 };
  if (s < 75) return { x: 25, z: s - 25 };
  if (s < 125) return { x: 100 - s, z: 50 };
  if (s < 175) return { x: -25, z: 175 - s };
  return { x: s - 200, z: 0 };
}

/** Samples every 2 m (0.1 s) at the given continuous stations; time 0 is station -20. */
function drive(fromStation: number, toStation: number): ReplayTrajectoryPoint[] {
  const points: ReplayTrajectoryPoint[] = [];
  for (let s = fromStation; s <= toStation + 1e-9; s += 2) {
    points.push({ ...positionAt(s), y: 0, timeSec: Number(((s + 20) / SPEED_MS).toFixed(3)), speedKmh: 72, throttle: s, brake: 0, gear: 4 });
  }
  return points;
}

function cut(samples: ReplayTrajectoryPoint[], lapStartIdx: number, lapEndIdx: number) {
  const { stations, lateralOffsets } = projectTrajectoryToCenterline(samples, SQUARE, { clampSeam: false });
  return cutLapAtLine(samples, stations, lateralOffsets, L, lapStartIdx, lapEndIdx);
}

describe('cutLapAtLine', () => {
  // Recording from 19 m before the line to 21 m past the next crossing; the timing loop sliced
  // the lap 11 m late at both ends (a remote driver's delayed timing event).
  const samples = drive(-19, 221);
  const sliceStart = samples.findIndex(p => Math.abs((p.throttle ?? 0) - 11) < 1e-9);
  const sliceEnd = samples.findIndex(p => Math.abs((p.throttle ?? 0) - 211) < 1e-9);

  it('moves both ends of a late slice to the line crossings, interpolating the boundary samples', () => {
    const result = cut(samples, sliceStart, sliceEnd);
    const first = result.points[0];
    const last = result.points[result.points.length - 1];
    expect(result.startCut && result.endCut).toBe(true);
    expect(first.stationM).toBe(0);
    expect(first.x).toBeCloseTo(0, 6);
    expect(first.timeSec).toBeCloseTo(1, 6);
    expect(first.throttle).toBeCloseTo(0, 6);
    expect(last.stationM).toBe(L);
    expect(last.timeSec).toBeCloseTo(11, 6);
    // Line to line takes exactly one lap length at the recorded speed.
    expect((last.timeSec ?? 0) - (first.timeSec ?? 0)).toBeCloseTo(L / SPEED_MS, 6);
    expect(result.points.every(p => (p.stationM ?? -1) >= 0 && (p.stationM ?? Infinity) <= L)).toBe(true);
  });

  it('does not blend state channels such as the gear', () => {
    const result = cut(samples, sliceStart, sliceEnd);
    expect(result.points[0].gear).toBe(4);
  });

  it('reports where the samples of the timing-loop slice moved to', () => {
    const result = cut(samples, sliceStart, sliceEnd);
    expect(result.points[result.indexShift].stationM).toBe(11);
  });

  it('keeps the slice start when there is no recording before it', () => {
    const lateStart = drive(11, 221);
    const end = lateStart.findIndex(p => Math.abs((p.throttle ?? 0) - 211) < 1e-9);
    const result = cut(lateStart, 0, end);
    expect(result.startCut).toBe(false);
    expect(result.points[0].stationM).toBe(11);
    expect(result.indexShift).toBe(0);
    expect(result.endCut).toBe(true);
    expect(result.points[result.points.length - 1].stationM).toBe(L);
  });

  it('trims a slice that starts just before the line', () => {
    const early = drive(-1, 199);
    const result = cut(early, 0, early.length - 1);
    expect(result.startCut).toBe(true);
    expect(result.points[0].stationM).toBe(0);
    expect(result.points[0].timeSec).toBeCloseTo(1, 6);
    expect(result.points[1].stationM).toBe(1);
  });

  it('ignores a line crossing too far in time from the slice boundary', () => {
    // Sliced at station 71: the crossing was 3.55 s earlier, beyond MAX_LINE_CUT_SHIFT_SEC.
    const start = samples.findIndex(p => Math.abs((p.throttle ?? 0) - 71) < 1e-9);
    const result = cut(samples, start, sliceEnd);
    expect(result.startCut).toBe(false);
    expect(result.points[0].stationM).toBe(71);
  });
});

describe('projectTrajectoryToCenterline seam handling', () => {
  const pastTheLine = drive(170, 210);

  it('pins stations past the line at the track length by default', () => {
    const { stations } = projectTrajectoryToCenterline(pastTheLine, SQUARE);
    expect(stations[stations.length - 1]).toBe(L);
  });

  it('returns the wrapped stations with clampSeam: false', () => {
    const { stations } = projectTrajectoryToCenterline(pastTheLine, SQUARE, { clampSeam: false });
    expect(stations[stations.length - 1]).toBeCloseTo(10, 6);
  });
});
