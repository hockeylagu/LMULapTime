import type { ReplayTrajectoryData } from '../../shared/types/replay.js';
import type { LiveEvidenceResponse } from '../../shared/types/liveEvidence.js';

export function liveEvidenceFixture(): Extract<LiveEvidenceResponse, { state: 'available' }> {
  return { state: 'available', sessionId: 'session', driverOrdinal: 0, lapOrdinal: 1,
    evidence: { source: 'live-capture', recordingId: 'recording', schemaVersion: 1, normalizationVersion: 1,
      signConvention: 'iso8855', gameVersion: 'Build-42', lapNumber: 2, startSeconds: 100, durationSeconds: 90,
      channels: [
        { name: 'velocity_forward_mps', unit: 'm/s', frame: 'iso8855-vehicle', sourceField: 'localVel.z' },
        { name: 'velocity_left_mps', unit: 'm/s', frame: 'iso8855-vehicle', sourceField: 'localVel.x' },
        { name: 'yaw_rate_radps', unit: 'rad/s', frame: 'iso8855-vehicle', sourceField: 'localRot.y' },
      ], points: [
        { sampleIndex: 0, elapsedSeconds: 100.02, lapSeconds: 0.02, values: [20, 2, 0.25] },
        { sampleIndex: 1, elapsedSeconds: 100.04, lapSeconds: 0.04, values: [20, 0, 0] },
        { sampleIndex: 2, elapsedSeconds: 101, lapSeconds: 1, values: [4, 2, null] },
      ], observations: [], sessionObservations: [], observationsTruncated: false,
      coverage: { firstLapSeconds: 0.02, lastLapSeconds: 1,
        gaps: [{ afterLapSeconds: 0.04, beforeLapSeconds: 1 }], recordingDroppedSamples: 5 } } };
}

export function liveTrajectoryFixture(): ReplayTrajectoryData {
  return { sessionId: 'session', driverOrdinal: 0, lapOrdinal: 1, hasLiveCapture: true,
    source: 'duckdb', signConvention: 'iso8855', timeReference: 'lap', currentLap: 2,
    replayName: 'fixture.Vcr', pointsCount: 4, laps: [{ lapNumber: 2, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 }],
    bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4, spanX: 4, spanZ: 4 },
    points: [0.02, 0.04, 0.5, 1].map((timeSec, index) => ({ x: index, y: 0, z: index, timeSec,
      speedKmh: 72, steerYaw: 0.1, rotY: 0, throttle: 40, brake: 0, gear: 3, yawRateDeg: -99, slipAngleDeg: -9 })) };
}
