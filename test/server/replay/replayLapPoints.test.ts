import { describe, it, expect } from 'vitest';
import { lapEdgesFromNeighbours, LAP_EDGE_PADDING_SEC } from '../../../server/replay/replayLapPoints.js';
import { ReplayTrajectoryPoint } from '../../../server/core/types.js';

// 50 m/s, one sample every 0.1 s (5 m); sample i is at time 100 + i * 0.1.
const samples = (from: number, to: number, jumpAt?: number): ReplayTrajectoryPoint[] =>
  Array.from({ length: to - from + 1 }, (_, k) => {
    const i = from + k;
    return { x: i * 5 + (jumpAt !== undefined && i < jumpAt ? -500 : 0), y: 0, z: 0, timeSec: Number((100 + i * 0.1).toFixed(2)) };
  });

describe('lapEdgesFromNeighbours', () => {
  it('takes LAP_EDGE_PADDING_SEC of recording from the end of the previous lap and the start of the next', () => {
    const { leadIn, leadOut } = lapEdgesFromNeighbours(samples(50, 150), samples(0, 50), samples(150, 200));
    // The sample the laps share (index 50 / 150) belongs to this lap, not to its edges.
    expect(leadIn[leadIn.length - 1].timeSec).toBe(104.9);
    expect(leadIn[0].timeSec).toBe(103);
    expect(leadIn).toHaveLength(20);
    expect(leadOut[0].timeSec).toBe(115.1);
    expect((leadOut[leadOut.length - 1].timeSec ?? 0) - 115).toBeLessThanOrEqual(LAP_EDGE_PADDING_SEC);
    expect(leadOut).toHaveLength(20);
  });

  it('goes on past two samples stored with the same time (times are kept to 0.01 s)', () => {
    const previous = samples(0, 50);
    previous[45] = { ...previous[45], timeSec: previous[44].timeSec };
    const { leadIn } = lapEdgesFromNeighbours(samples(50, 150), previous, undefined);
    expect(leadIn).toHaveLength(20);
  });

  it('returns no edges without neighbouring laps (first lap, lap not stored)', () => {
    expect(lapEdgesFromNeighbours(samples(50, 150), undefined, undefined)).toEqual({ leadIn: [], leadOut: [] });
  });

  it('stops at a teleport (pit reset): the samples beyond it are not part of the run-up', () => {
    const { leadIn } = lapEdgesFromNeighbours(samples(50, 150), samples(0, 49, 45), undefined);
    expect(leadIn.map(p => p.timeSec)).toEqual([104.5, 104.6, 104.7, 104.8, 104.9]);
  });

  it('ignores a neighbour from another part of the session (a gap in time)', () => {
    const { leadIn, leadOut } = lapEdgesFromNeighbours(samples(50, 150), samples(0, 20), samples(180, 200));
    expect(leadIn).toEqual([]);
    expect(leadOut).toEqual([]);
  });
});
