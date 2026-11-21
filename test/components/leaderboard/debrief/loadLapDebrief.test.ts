import { describe, expect, it, vi } from 'vitest';
import type { ReplayTrajectoryData } from '../../../../shared/types/index.js';
import type { LayoutCorners } from '../../../../shared/types/corners/cornerPasses.js';

const api = vi.hoisted(() => ({ fetchSessionTelemetry: vi.fn(), loadLayoutCorners: vi.fn() }));
vi.mock('../../../../src/api/replayApi.js', () => ({ fetchSessionTelemetry: api.fetchSessionTelemetry }));
vi.mock('../../../../src/api/cornerApi.js', () => ({ loadLayoutCorners: api.loadLayoutCorners }));

import { loadLapPairDebrief } from '../../../../src/components/leaderboard/debrief/loadLapDebrief.js';

// A 1000 m lap every 10 m from the start line at station 0; the slower lap loses 1 s through the dip at 200 m.
function lap(slowerSec: number, carClass: string): ReplayTrajectoryData {
  const points = Array.from({ length: 100 }, (_, i) => ({
    x: i * 10, y: 0, z: 0, speedKmh: i === 20 ? 80 : 200, throttle: 0, brake: 0, steerYaw: 0,
    timeSec: i * 0.2 + (i > 20 ? slowerSec : 0), stationM: i * 10,
  }));
  return {
    points, pointsCount: points.length, layoutKey: 'square', trackLengthM: 1000, stationSource: 'track', geometryRevision: 'rev1',
    vehicleIdentity: { carClass },
  } as unknown as ReplayTrajectoryData;
}

describe('loadLapPairDebrief', () => {
  it("ranks your class's corners from its map, by their names", async () => {
    const yours = { sessionId: 'a', driverOrdinal: 0, lapOrdinal: 1 }, theirs = { sessionId: 'b', driverOrdinal: 2, lapOrdinal: 3 };
    api.fetchSessionTelemetry.mockImplementation((sessionId: string) => Promise.resolve(lap(sessionId === 'a' ? 1 : 0, 'GT3')));
    const corners: LayoutCorners = { kind: 'sequences', startStationM: 0, lengthM: 1000, corners: [
      { id: 1, label: 'T1–T2', title: 'T1–T2 sequence', apexM: 200, startM: 100, endM: 600 },
      { id: 3, label: 'T3', title: 'T3 sequence', apexM: 800, startM: 600, endM: 1100 },
    ] };
    api.loadLayoutCorners.mockResolvedValue(corners);
    const debrief = await loadLapPairDebrief(yours, theirs);
    expect(api.loadLayoutCorners).toHaveBeenCalledWith('square', 'GT3');
    expect(debrief.corners.map(corner => [corner.label, corner.cornerNumber, corner.timeLossSec])).toEqual([['T1–T2', 1, 1]]);
  });
});
