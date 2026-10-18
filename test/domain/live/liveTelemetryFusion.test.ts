import { describe, expect, it } from 'vitest';
import { fuseLiveTelemetry } from '../../../shared/domain/live/liveTelemetryFusion.js';
import { liveEvidenceFixture, liveTrajectoryFixture } from '../../helpers/liveEvidence.js';
import { applyTelemetryPostProcessingToTrajectory } from '../../../src/utils/telemetryPostProcessing.js';

describe('supplemental live telemetry fusion', () => {
  it('keeps exact source values, zeroes, geometry and timing, and leaves gaps and low-speed beta unchanged', () => {
    const trajectory = liveTrajectoryFixture();
    const before = JSON.stringify(trajectory);
    const result = fuseLiveTelemetry(trajectory, liveEvidenceFixture());
    expect(result.source).toBe('duckdb');
    expect(result.points[0].yawRateDeg).toBe(0.25 * 180 / Math.PI);
    expect(result.points[0].slipAngleDeg).toBe(Math.atan2(2, 20) * 180 / Math.PI);
    expect(result.points[1]).toMatchObject({ yawRateDeg: 0, slipAngleDeg: 0 });
    expect(result.points[2]).toBe(trajectory.points[2]);
    expect(result.points[3]).toBe(trajectory.points[3]);
    expect(result.liveCaptureOverlay).toMatchObject({ state: 'applied', yawPoints: 2, slipPoints: 2, totalPoints: 4, captureGaps: 1 });
    expect(result.points.map(p => [p.x, p.y, p.z, p.timeSec])).toEqual(trajectory.points.map(p => [p.x, p.y, p.z, p.timeSec]));
    expect(JSON.stringify(trajectory)).toBe(before);
  });

  it('uses explicit session-clock origins and refuses a guessed first-point origin', () => {
    const trajectory = liveTrajectoryFixture();
    const sessionClock = { ...trajectory, source: 'vcr' as const, timeReference: 'session' as const, lapStartTimeSec: 100,
      points: trajectory.points.map(p => ({ ...p, timeSec: p.timeSec! + 100 })) };
    expect(fuseLiveTelemetry(sessionClock, liveEvidenceFixture()).points[0].liveDynamics?.yawRate).toBe(true);
    expect(fuseLiveTelemetry({ ...sessionClock, lapStartTimeSec: undefined }, liveEvidenceFixture()).liveCaptureOverlay?.state).toBe('unaligned');
    expect(fuseLiveTelemetry({ ...sessionClock, lapStartTimeSec: 200 }, liveEvidenceFixture()).liveCaptureOverlay?.state).toBe('unaligned');
    expect(fuseLiveTelemetry({ ...trajectory, timeReference: undefined }, liveEvidenceFixture()).points).toBe(trajectory.points);
  });

  it('preserves measured dynamics through client smoothing and derives balance from the supplied yaw', () => {
    const fused = fuseLiveTelemetry(liveTrajectoryFixture(), liveEvidenceFixture());
    const processed = applyTelemetryPostProcessingToTrajectory(fused);
    expect(processed.points[0].yawRateDeg).toBe(fused.points[0].yawRateDeg);
    expect(processed.points[0].slipAngleDeg).toBe(fused.points[0].slipAngleDeg);
    expect(processed.points[1].yawRateDeg).toBe(0);
    expect(processed.points[1].slipAngleDeg).toBe(0);
    expect(processed.points[2].yawRateDeg).not.toBe(-99);
    expect(processed.points[2].liveDynamics).toBeUndefined();
  });

  it('retains native telemetry G values while replay-only G stays computed', () => {
    const native = liveTrajectoryFixture();
    native.points = native.points.map(point => ({ ...point, accelLonG: 0, accelLatG: 1.23456789, accelTotalG: 1.23456789 }));
    const processedNative = applyTelemetryPostProcessingToTrajectory(fuseLiveTelemetry(native, liveEvidenceFixture()));
    expect(processedNative.points.every(point => point.accelLonG === 0 && point.accelLatG === 1.23456789 && point.accelTotalG === 1.23456789)).toBe(true);
    const replay = { ...liveTrajectoryFixture(), source: 'vcr' as const };
    const processedReplay = applyTelemetryPostProcessingToTrajectory(fuseLiveTelemetry(replay, liveEvidenceFixture()));
    expect(processedReplay.points.every(point => Number.isFinite(point.accelLonG) && Number.isFinite(point.accelLatG))).toBe(true);
    expect(processedReplay.points[0].liveDynamics?.yawRate).toBe(true);
  });

  it('requires matching locators, durations, ISO conventions and ordered live clocks', () => {
    const trajectory = liveTrajectoryFixture();
    const response = liveEvidenceFixture();
    for (const changed of [{ ...trajectory, sessionId: 'other' }, { ...trajectory, driverOrdinal: 1 },
      { ...trajectory, lapOrdinal: 2 }, { ...trajectory, currentLap: 3 }, { ...trajectory, signConvention: undefined },
      { ...trajectory, laps: trajectory.laps?.map(lap => ({ ...lap, lapTimeSec: 91 })) }]) {
      expect(fuseLiveTelemetry(changed, response).liveCaptureOverlay?.state).toBe('unaligned');
    }
    response.evidence.points.reverse();
    expect(fuseLiveTelemetry(trajectory, response).liveCaptureOverlay?.state).toBe('unaligned');
  });

  it('never uses samples farther than 25 ms or unavailable/reverse velocity channels', () => {
    const trajectory = liveTrajectoryFixture();
    trajectory.points[0].timeSec = 0.066;
    const response = liveEvidenceFixture();
    response.evidence.points[0].values = [-10, 2, null];
    response.evidence.points[1].values = [null, null, null];
    const result = fuseLiveTelemetry(trajectory, response);
    expect(result.points.every(point => point.liveDynamics === undefined)).toBe(true);
  });

  it('does not extend source values beyond the first or last recorded timestamp', () => {
    const trajectory = liveTrajectoryFixture();
    trajectory.points[0].timeSec = 0.01;
    trajectory.points[3].timeSec = 1.01;
    const response = liveEvidenceFixture();
    response.evidence.points[2].values = [20, 1, 0.2];
    const result = fuseLiveTelemetry(trajectory, response);
    expect(result.points[0].liveDynamics).toBeUndefined();
    expect(result.points[3].liveDynamics).toBeUndefined();
  });
});
