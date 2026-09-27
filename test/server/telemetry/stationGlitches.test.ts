import { describe, it, expect } from 'vitest';
import { countStationGlitches } from '../../../server/tracks/stationGlitches.js';
import { ReplayTrajectoryPoint } from '../../../server/core/types.js';

const L = 1000;
// A car driving along x one metre per sample, with the station the projection gave each sample.
const lap = (stations: number[]): ReplayTrajectoryPoint[] => stations.map((stationM, i) => ({ x: i, y: 0, z: 0, stationM }));
const steady = (from: number, count: number) => Array.from({ length: count }, (_, i) => (from + i) % L);

describe('countStationGlitches', () => {
  it('finds nothing on a lap whose station follows the car, across the start/finish seam', () => {
    expect(countStationGlitches(lap(steady(990, 30)), L)).toEqual({ backwardSteps: 0, forwardJumps: 0, worstM: 0, offCircuit: 0 });
  });

  it('tolerates centreline noise below a metre', () => {
    expect(countStationGlitches(lap([100, 101, 100.4, 102, 103]), L).backwardSteps).toBe(0);
  });

  it('counts a station stepping backwards', () => {
    expect(countStationGlitches(lap([100, 101, 97, 98, 99]), L)).toEqual({ backwardSteps: 1, forwardJumps: 0, worstM: 4, offCircuit: 0 });
  });

  it('counts a jump to another stretch of track and its return', () => {
    const glitches = countStationGlitches(lap([100, 101, 400, 401, 104, 105]), L);
    expect(glitches.forwardJumps).toBe(1);
    expect(glitches.backwardSteps).toBe(1);
    expect(glitches.worstM).toBe(298); // 299 m of station for 1 m driven
  });

  it('ignores teleports, the pit lane and a car crawling or reversing', () => {
    const teleport = lap([100, 101, 2000, 2001]);
    teleport[2] = { ...teleport[2], x: 500 };
    teleport[3] = { ...teleport[3], x: 501 };
    expect(countStationGlitches(teleport, 3000)).toEqual({ backwardSteps: 0, forwardJumps: 0, worstM: 0, offCircuit: 0 });
    const pit = lap([100, 101, 97]).map(p => ({ ...p, inPit: true }));
    expect(countStationGlitches(pit, L).backwardSteps).toBe(0);
    const reversing = lap([100, 101, 97]).map(p => ({ ...p, speedKmh: 8 }));
    expect(countStationGlitches(reversing, L).backwardSteps).toBe(0);
  });

  it('counts disagreements far off the centreline (a run-off) apart from the on-track ones', () => {
    const runOff = lap([100, 101, 97, 98]).map(p => ({ ...p, lateralOffsetM: 35 }));
    expect(countStationGlitches(runOff, L)).toEqual({ backwardSteps: 0, forwardJumps: 0, worstM: 0, offCircuit: 1 });
  });

  it('does not count a genuine gap in the recording as a jump when the car covered the distance', () => {
    const points = lap([100, 101, 102]);
    points[2] = { ...points[2], x: 80, stationM: 180 };
    expect(countStationGlitches(points, L).forwardJumps).toBe(0);
  });
});
