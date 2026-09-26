import { describe, expect, it } from 'vitest';
import {
  cloneReplayMetadata,
  composeReplayMetadata,
  buildReplayListSummaries,
} from '../../../server/replay/replayMetadataService.js';
import {
  cloneReplayTrajectory,
  applyPureOfficialLapValidation,
  downsampleTrajectoryResponse,
} from '../../../server/replay/replayTransforms.js';
import {
  DetailedSession,
  DriverData,
  ReplayMetadata,
  ReplayTrajectoryData,
} from '../../../server/core/types.js';

describe('Replay domain services and transforms', () => {
  describe('cloneReplayMetadata & composeReplayMetadata', () => {
    it('clones metadata deeply so cached original is not mutated', () => {
      const original: ReplayMetadata = {
        filename: 'Test_P1.Vcr',
        filePath: '/path/Test_P1.Vcr',
        fileSizeBytes: 1000,
        mtimeMs: 123456,
        timeSliceCount: 10,
        totalEvents: 1,
        durationSec: 10,
        drivers: [
          { slot: 1, name: 'Driver A', isPlayer: true, carClass: 'GTE' },
          { slot: 2, name: 'Driver B', isPlayer: false, carClass: 'LMP2' },
        ],
        laps: [{ lapNumber: 1, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 }],
      };

      const cloned = cloneReplayMetadata(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.drivers).not.toBe(original.drivers);
      expect(cloned.drivers[0]).not.toBe(original.drivers[0]);
      if (cloned.laps && original.laps) {
        expect(cloned.laps).not.toBe(original.laps);
        expect(cloned.laps[0]).not.toBe(original.laps[0]);
      }

      // Mutating clone does not affect original
      cloned.trackVenue = 'Mutated Venue';
      cloned.drivers[0].carClass = 'Hypercar';
      expect(original.trackVenue).toBeUndefined();
      expect(original.drivers[0].carClass).toBe('GTE');
    });

    it('overlays XML session details without modifying original metadata', () => {
      const original: ReplayMetadata = {
        filename: 'Monza_P1.Vcr',
        filePath: '/replays/Monza_P1.Vcr',
        fileSizeBytes: 2000,
        mtimeMs: 5000,
        timeSliceCount: 50,
        totalEvents: 2,
        durationSec: 60,
        drivers: [{ slot: 1, name: 'Original Player', isPlayer: true }],
      };

      const session = {
        id: 'session-monza',
        trackVenue: 'Autodromo Nazionale Monza',
        trackCourse: 'Grand Prix',
        sessionType: 'Practice',
        drivers: [],
        playerDriver: {
          name: 'Original Player',
          carClass: 'Hypercar',
          carType: 'Toyota GR010',
          bestLapTime: 91.2,
          laps: [
            { lapNum: 1, lapTime: 91.2, lapTimeString: '1:31.200', s1: 30.1, s2: 30.2, s3: 30.9, isValid: true },
          ],
        },
      } as unknown as DetailedSession;

      const composed = composeReplayMetadata({
        metadata: original,
        replayName: 'Monza_P1.Vcr',
        matchedSession: session,
      });

      expect(composed.displayTrack).toBe('Autodromo Nazionale Monza');
      expect(composed.carClass).toBe('Hypercar');
      expect(composed.carModel).toBe('Toyota GR010');
      expect(composed.laps).toHaveLength(1);
      expect(composed.laps?.[0].isBest).toBe(true);

      // Verify original is pristine
      expect(original.carClass).toBeUndefined();
      expect(original.laps).toBeUndefined();
      expect(original.trackVenue).toBeUndefined();
    });

    it('falls back to filename track tokens when no matched session exists', () => {
      const original: ReplayMetadata = {
        filename: 'Spa-Francorchamps P1.Vcr',
        filePath: '/replays/Spa-Francorchamps P1.Vcr',
        fileSizeBytes: 2000,
        mtimeMs: 5000,
        timeSliceCount: 50,
        totalEvents: 2,
        durationSec: 60,
        drivers: [],
      };

      const composed = composeReplayMetadata({
        metadata: original,
        replayName: 'Spa-Francorchamps P1.Vcr',
      });

      expect(composed.displayTrack).toBe('Spa-Francorchamps');
      expect(composed.trackCourse).toBe('Spa-Francorchamps');
    });
  });

  describe('buildReplayListSummaries', () => {
    it('aggregates replays from disk and stored database rows', () => {
      const summaries = buildReplayListSummaries({
        diskFiles: ['Replay_A.Vcr'],
        storedReplays: [
          {
            filename: 'Replay_A.Vcr',
            file_mtime: 1000,
            file_size: 500,
            metadata: {
              filename: 'Replay_A.Vcr',
              filePath: '/replays/Replay_A.Vcr',
              fileSizeBytes: 500,
              mtimeMs: 1000,
              timeSliceCount: 1,
              totalEvents: 1,
              durationSec: 10,
              trackName: 'Test Track',
              drivers: [{ slot: 1, name: 'Driver A', isPlayer: true, carClass: 'LMGT3', carModel: 'Aston Martin' }],
            },
          },
          {
            filename: 'Archived_B.Vcr',
            file_mtime: 2000,
            file_size: 600,
            metadata: {
              filename: 'Archived_B.Vcr',
              filePath: '/replays/Archived_B.Vcr',
              fileSizeBytes: 600,
              mtimeMs: 2000,
              timeSliceCount: 2,
              totalEvents: 1,
              durationSec: 20,
              trackName: 'Archive Track',
              drivers: [{ slot: 1, name: 'Driver B', isPlayer: true, carClass: 'LMP2' }],
            },
          },
        ],
        replaysDir: '/mock/dir',
        sessions: [],
        duckFiles: [],
        telemetryMeta: [],
        getMetadata: () => null,
      });

      expect(summaries).toHaveLength(2);
      // Sorted by mtime descending
      expect(summaries[0].name).toBe('Archived_B.Vcr');
      expect(summaries[1].name).toBe('Replay_A.Vcr');
      expect(summaries[1].carClass).toBe('LMGT3');
      expect(summaries[1].carModel).toBe('Aston Martin');
    });
  });

  describe('replayTransforms', () => {
    it('downsampleTrajectoryResponse creates a cloned copy without modifying original', () => {
      const original = {
        replayName: 'Test.Vcr',
        bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
        source: 'vcr',
        points: [
          { x: 0, y: 0, z: 0, speedKmh: 100 },
          { x: 1, y: 0, z: 1, speedKmh: 110 },
          { x: 2, y: 0, z: 2, speedKmh: 120 },
          { x: 3, y: 0, z: 3, speedKmh: 130 },
        ],
        pointsCount: 4,
        rawPointsCount: 4,
        sectors: { s1Frame: 1, s2Frame: 2 },
      } as unknown as ReplayTrajectoryData;

      const downsampled = downsampleTrajectoryResponse(original, 2);
      expect(downsampled.points).toHaveLength(2);
      expect(downsampled.isFullResolution).toBe(false);
      expect(original.points).toHaveLength(4);
      expect(original.isFullResolution).toBeUndefined();
    });

    it('applyPureOfficialLapValidation does not mutate input trajectory laps', () => {
      const originalLap = { lapNumber: 1, lapTimeSec: 90.0, s1Sec: 30.0, s2Sec: 30.0, s3Sec: 30.0 };
      const original = {
        replayName: 'Test.Vcr',
        bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10, spanX: 10, spanZ: 10 },
        source: 'vcr',
        points: [{ x: 0, y: 0, z: 0 }],
        pointsCount: 1,
        laps: [originalLap],
      } as unknown as ReplayTrajectoryData;

      const session = {
        id: 'sess-val',
        trackVenue: 'Spa',
        trackCourse: 'GP',
        sessionType: 'Qualifying',
        drivers: [],
      } as unknown as DetailedSession;

      const driver = {
        driverName: 'Official Driver',
        bestLapTime: 89.5,
        laps: [{ lapNum: 1, lapTime: 89.5, s1: 29.8, s2: 30.0, s3: 29.7, isValid: true }],
      } as unknown as DriverData;

      const validated = applyPureOfficialLapValidation(cloneReplayTrajectory(original), session, driver);
      expect(validated.laps?.[0].validatedTimeSec).toBe(89.5);
      expect(validated.laps?.[0].timeDiffSec).toBe(0.5);
      expect(validated.validation?.driverName).toBe('Official Driver');

      // Verify original lap was not mutated
      expect(originalLap).not.toHaveProperty('validatedTimeSec');
      expect(originalLap).not.toHaveProperty('timeDiffSec');
    });
  });
});
